// Contract test for reconcileTaskIdentity — the down-sync task-identity fold.
//
// The repo has no jest/vitest runner (frozen stack), so this is a self-contained
// assertion script run through Node's type-stripping, mirroring
// src/sync/runWithTimeout.contract.test.ts:
//
//     npm run contract:task-identity
//
// It replays the real reconcileTaskIdentity logic against an in-memory SQLite DB
// with the actual FK constraints (attachments/form_submissions -> tasks ON DELETE
// CASCADE, locations -> tasks ON DELETE SET NULL) and PRAGMA foreign_keys = ON —
// the device's real mode (op-sqlite opens a single FULLMUTEX SQLCipher connection
// and sets foreign_keys = ON at open). It proves the fix: re-syncing one task of a
// multi-task case no longer cannibalizes its siblings, a genuine stale-id row still
// migrates without orphans or a FOREIGN KEY throw, and steady state is a no-op.
//
// It exits non-zero on the first failed assertion.

import {
  reconcileTaskIdentity,
  type IdentityReconcileExecutor,
} from './reconcileTaskIdentity.ts';

// node:sqlite has no types under the RN tsconfig (no @types/node); the tiny
// surface we use is declared ambiently in src/types/node-sqlite.d.ts. `process`
// is declared locally, mirroring runWithTimeout.contract.test.ts. No suppressions.
declare const process: { exitCode?: number };

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  verification_task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED'
);
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT
);
`;

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// Adapt node:sqlite to the executor surface the helper expects.
function executorFor(db: DatabaseSync): IdentityReconcileExecutor {
  return {
    query: async <T>(sql: string, params: Array<string | number | null> = []) =>
      db.prepare(sql).all(...params) as unknown as T[],
    execute: async (sql: string, params: Array<string | number | null> = []) =>
      db.prepare(sql).run(...params),
  };
}

function seedTask(db: DatabaseSync, id: string, caseId: string, vtId: string): void {
  db.prepare(
    'INSERT INTO tasks (id, case_id, verification_task_id) VALUES (?, ?, ?)',
  ).run(id, caseId, vtId);
}
function seedAttachment(db: DatabaseSync, id: string, taskId: string, status = 'SYNCED'): void {
  db.prepare('INSERT INTO attachments (id, task_id, sync_status) VALUES (?, ?, ?)').run(
    id,
    taskId,
    status,
  );
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

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  await check(
    'multi-task case: reconciling one task does NOT cannibalize its sibling',
    async () => {
      const db = openDb();
      // Two real sibling tasks of the SAME case (shared case_id, distinct
      // verification_task_id) — exactly what the backend down-sync emits.
      seedTask(db, 'T1', 'CASE-UUID', 'T1');
      seedTask(db, 'T2', 'CASE-UUID', 'T2');
      seedAttachment(db, 'a1', 'T1', 'SYNCED');

      await reconcileTaskIdentity(executorFor(db), 'T2');

      assert(count(db, 'tasks', "id = 'T1'") === 1, 'sibling task T1 must survive');
      assert(count(db, 'tasks', "id = 'T2'") === 1, 'task T2 must survive');
      const owner = db.prepare("SELECT task_id FROM attachments WHERE id = 'a1'").all()[0]
        ?.task_id;
      assert(owner === 'T1', `T1's attachment must stay on T1, got "${String(owner)}"`);
      assert(fkOrphans(db) === 0, 'no FK orphans');
    },
  );

  await check(
    'genuine stale-id row migrates onto the canonical id with no orphan and no throw',
    async () => {
      const db = openDb();
      // Canonical row already inserted (the upsert INSERT now runs BEFORE the
      // fold), plus an older row for the SAME task under a stale local id with
      // child rows attached to the stale id.
      seedTask(db, 'CANON', 'CASE-UUID', 'CANON');
      seedTask(db, 'OLD', 'CASE-UUID', 'CANON'); // same verification_task_id, different id
      seedAttachment(db, 'aOld', 'OLD', 'SYNCED');
      db.prepare('INSERT INTO locations (id, task_id) VALUES (?, ?)').run('locOld', 'OLD');
      db.prepare(
        'INSERT INTO form_submissions (id, task_id, sync_status) VALUES (?, ?, ?)',
      ).run('fOld', 'OLD', 'PENDING');

      await reconcileTaskIdentity(executorFor(db), 'CANON');

      assert(count(db, 'tasks', "id = 'OLD'") === 0, 'stale row OLD must be removed');
      assert(count(db, 'tasks', "id = 'CANON'") === 1, 'canonical row must remain');
      const a = db.prepare("SELECT task_id FROM attachments WHERE id = 'aOld'").all()[0];
      assert(a?.task_id === 'CANON', 'attachment must be re-pointed to CANON');
      const f = db.prepare("SELECT task_id FROM form_submissions WHERE id = 'fOld'").all()[0];
      assert(f?.task_id === 'CANON', 'form submission must be re-pointed to CANON');
      assert(fkOrphans(db) === 0, 'no FK orphans after migration');
    },
  );

  await check('steady state (id == verification_task_id) is a no-op', async () => {
    const db = openDb();
    seedTask(db, 'X', 'CASE-UUID', 'X');
    seedAttachment(db, 'aX', 'X', 'SYNCED');

    await reconcileTaskIdentity(executorFor(db), 'X');

    assert(count(db, 'tasks') === 1, 'no rows touched');
    assert(count(db, 'attachments', "task_id = 'X'") === 1, 'attachment untouched');
    assert(fkOrphans(db) === 0, 'no FK orphans');
  });

  await check(
    'root-cause guard: the abandoned case_id key selects the sibling; the verification_task_id key does not',
    async () => {
      const db = openDb();
      seedTask(db, 'T1', 'CASE-UUID', 'T1');
      seedTask(db, 'T2', 'CASE-UUID', 'T2');
      const byCaseId = db
        .prepare('SELECT id FROM tasks WHERE case_id = ? AND id != ?')
        .all('CASE-UUID', 'T2');
      const byVtId = db
        .prepare('SELECT id FROM tasks WHERE verification_task_id = ? AND id != ?')
        .all('T2', 'T2');
      assert(
        byCaseId.length === 1,
        'the old case_id key wrongly matches the sibling (the bug)',
      );
      assert(byVtId.length === 0, 'the verification_task_id key correctly matches no sibling');
    },
  );

  if (failures.length > 0) {
    console.error(`\nreconcileTaskIdentity contract: ${failures.length} FAILED`);
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`\nreconcileTaskIdentity contract: ${passed} checks passed`);
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
