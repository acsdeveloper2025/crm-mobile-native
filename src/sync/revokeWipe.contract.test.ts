// Contract test for the revoked-task PII wipe — isJustRevoked + purgeRevokedTaskPii.
//
// The repo has no jest/vitest runner (frozen stack), so this is a self-contained
// assertion script run through Node's type-stripping, mirroring
// src/sync/reconcileTaskIdentity.contract.test.ts. It replays the real wipe
// against an in-memory SQLite DB with the device's real FK mode
// (PRAGMA foreign_keys = ON):
//
//     npm run contract:revoke-wipe
//
// It proves audit finding A2026-0623-11: once a down-sync sees a task revoked,
// its local attachments (photos) and form_submissions (drafts) are purged and
// the on-disk file paths are returned for unlink, with no FK orphans and no
// collateral damage to a sibling task. isJustRevoked is gated on the SERVER
// revoked signal (not the merged status) and is idempotent once REVOKED.
//
// It exits non-zero on the first failed assertion.

import { isJustRevoked, purgeRevokedTaskPii } from './revokeWipe.ts';
import type { IdentityReconcileExecutor } from './reconcileTaskIdentity.ts';

declare const process: { exitCode?: number };

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ASSIGNED'
);
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  local_path TEXT,
  thumbnail_path TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
`;

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function executorFor(db: DatabaseSync): IdentityReconcileExecutor {
  return {
    query: async <T>(sql: string, params: Array<string | number | null> = []) =>
      db.prepare(sql).all(...params) as unknown as T[],
    execute: async (sql: string, params: Array<string | number | null> = []) =>
      db.prepare(sql).run(...params),
  };
}

function count(db: DatabaseSync, table: string, where = '1=1'): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).all()[0];
  return Number(row?.n ?? 0);
}
function fkOrphans(db: DatabaseSync): number {
  return db.prepare('PRAGMA foreign_key_check;').all().length;
}

let passed = 0;
const failures: string[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  // isJustRevoked — gated on the server revoked signal, idempotent once REVOKED.
  await check('isJustRevoked fires on a fresh server revoke', () => {
    assert(isJustRevoked(true, 'IN_PROGRESS') === true, 'revoked over IN_PROGRESS must fire');
    assert(isJustRevoked(true, undefined) === true, 'revoked over a brand-new row must fire');
  });
  await check('isJustRevoked is idempotent once already REVOKED', () => {
    assert(isJustRevoked(true, 'REVOKED') === false, 'already-REVOKED must not re-fire');
  });
  await check('isJustRevoked never fires without the server revoked signal', () => {
    assert(isJustRevoked(false, 'IN_PROGRESS') === false, 'non-revoked must not fire');
  });

  await check(
    'purge clears photos + form drafts for the revoked task and returns their file paths',
    async () => {
      const db = openDb();
      db.prepare("INSERT INTO tasks (id, status) VALUES ('T1', 'REVOKED')").run();
      db.prepare(
        "INSERT INTO attachments (id, task_id, local_path, thumbnail_path) VALUES ('a1', 'T1', '/d/a1.jpg', '/d/a1.thumb.jpg')",
      ).run();
      db.prepare(
        "INSERT INTO attachments (id, task_id, local_path, thumbnail_path) VALUES ('a2', 'T1', '/d/a2.jpg', NULL)",
      ).run();
      db.prepare("INSERT INTO form_submissions (id, task_id) VALUES ('f1', 'T1')").run();

      const paths = await purgeRevokedTaskPii(executorFor(db), 'T1');

      assert(count(db, 'attachments', "task_id = 'T1'") === 0, 'photos must be purged');
      assert(count(db, 'form_submissions', "task_id = 'T1'") === 0, 'form drafts must be purged');
      const sorted = [...paths].sort();
      assert(
        JSON.stringify(sorted) ===
          JSON.stringify(['/d/a1.jpg', '/d/a1.thumb.jpg', '/d/a2.jpg']),
        `must return every non-empty on-disk path for unlink, got ${JSON.stringify(sorted)}`,
      );
      assert(fkOrphans(db) === 0, 'no FK orphans after purge');
    },
  );

  await check('purge leaves a sibling task untouched', async () => {
    const db = openDb();
    db.prepare("INSERT INTO tasks (id, status) VALUES ('T1', 'REVOKED')").run();
    db.prepare("INSERT INTO tasks (id, status) VALUES ('T2', 'IN_PROGRESS')").run();
    db.prepare(
      "INSERT INTO attachments (id, task_id, local_path) VALUES ('a1', 'T1', '/d/a1.jpg')",
    ).run();
    db.prepare(
      "INSERT INTO attachments (id, task_id, local_path) VALUES ('b1', 'T2', '/d/b1.jpg')",
    ).run();
    db.prepare("INSERT INTO form_submissions (id, task_id) VALUES ('fb1', 'T2')").run();

    await purgeRevokedTaskPii(executorFor(db), 'T1');

    assert(count(db, 'attachments', "task_id = 'T2'") === 1, "sibling T2's photo must survive");
    assert(
      count(db, 'form_submissions', "task_id = 'T2'") === 1,
      "sibling T2's form draft must survive",
    );
    assert(fkOrphans(db) === 0, 'no FK orphans');
  });

  if (failures.length > 0) {
    console.error(`\nrevokeWipe contract: ${failures.length} FAILED`);
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`\nrevokeWipe contract: ${passed} checks passed`);
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
