// Contract test for the sync_metadata singleton writers.
//
// Runner-free (frozen stack, no jest); run via Node type-stripping, mirroring
// src/sync/reconcileTaskIdentity.contract.test.ts:
//
//     npm run contract:sync-metadata
//
// sync_metadata is a single row (id=1) written by two services that each own a
// different subset of columns: SyncStateService.updateSyncInProgress
// (device_id, sync_in_progress, last_upload_sync_at) and
// SyncDownloadService (last_download_sync_at). They used INSERT OR REPLACE,
// which rewrites the WHOLE row and nulls the columns it omits — so the
// start-of-sync updateSyncInProgress(true) wiped last_download_sync_at, and the
// download phase then read an empty watermark and re-pulled the backend's
// 30-day default every cycle. This test pins the fix: each writer is an UPSERT
// that preserves the other's columns. It exits non-zero on the first failure.

declare const process: { exitCode?: number };

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE sync_metadata (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_download_sync_at TEXT,
  last_upload_sync_at TEXT,
  sync_in_progress INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL
);
`;

// These two statements MUST mirror SyncStateService.updateSyncInProgress and
// SyncDownloadService.downloadServerChanges. If you change them there, change
// them here.
const SET_IN_PROGRESS = `INSERT INTO sync_metadata (id, device_id, sync_in_progress, last_upload_sync_at)
   VALUES (1, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     device_id = excluded.device_id,
     sync_in_progress = excluded.sync_in_progress,
     last_upload_sync_at = excluded.last_upload_sync_at`;

const SET_DOWNLOAD_WATERMARK = `INSERT INTO sync_metadata (id, last_download_sync_at, sync_in_progress, device_id)
   VALUES (1, ?, 1, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1))
   ON CONFLICT(id) DO UPDATE SET
     last_download_sync_at = excluded.last_download_sync_at,
     sync_in_progress = excluded.sync_in_progress`;

// The pre-fix statement, kept only to demonstrate the regression it caused.
const OLD_IN_PROGRESS_INSERT_OR_REPLACE = `INSERT OR REPLACE INTO sync_metadata (id, device_id, sync_in_progress, last_upload_sync_at)
   VALUES (1, ?, ?, ?)`;

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}
function row(db: DatabaseSync): Record<string, unknown> {
  return db.prepare('SELECT * FROM sync_metadata WHERE id = 1').all()[0] ?? {};
}

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}
async function check(name: string, fn: () => void): Promise<void> {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  await check(
    'start-of-sync flag flip PRESERVES the download watermark (the bug)',
    () => {
      const db = openDb();
      // Real order: sync 1 starts (creates the row), then its download phase
      // stamps the watermark.
      db.prepare(SET_IN_PROGRESS).run('device-abc', 1, '2026-06-23T09:00:00.000Z');
      db.prepare(SET_DOWNLOAD_WATERMARK).run('2026-06-23T10:00:00.000Z');
      // Sync 2 starts: updateSyncInProgress(true) must NOT wipe the watermark.
      db.prepare(SET_IN_PROGRESS).run('device-abc', 1, '2026-06-23T11:00:00.000Z');
      const r = row(db);
      assert(
        r.last_download_sync_at === '2026-06-23T10:00:00.000Z',
        `watermark must survive the flag flip, got ${String(r.last_download_sync_at)}`,
      );
      assert(r.sync_in_progress === 1, 'sync_in_progress must be set');
      assert(r.device_id === 'device-abc', 'device_id must be set');
    },
  );

  await check('writing the watermark PRESERVES upload time + device_id', () => {
    const db = openDb();
    db.prepare(SET_IN_PROGRESS).run('device-xyz', 0, '2026-06-23T09:30:00.000Z');
    db.prepare(SET_DOWNLOAD_WATERMARK).run('2026-06-23T12:00:00.000Z');
    const r = row(db);
    assert(
      r.last_upload_sync_at === '2026-06-23T09:30:00.000Z',
      `upload time must survive, got ${String(r.last_upload_sync_at)}`,
    );
    assert(r.device_id === 'device-xyz', `device_id must survive, got ${String(r.device_id)}`);
    assert(r.last_download_sync_at === '2026-06-23T12:00:00.000Z', 'watermark must be set');
  });

  await check('first write on an empty table inserts the singleton row', () => {
    const db = openDb();
    db.prepare(SET_IN_PROGRESS).run('device-1', 1, '2026-06-23T08:00:00.000Z');
    const r = row(db);
    assert(r.device_id === 'device-1', 'row inserted with device_id');
    assert(r.last_download_sync_at == null, 'no watermark yet on first sync (expected)');
  });

  await check(
    'regression guard: the old INSERT OR REPLACE WOULD have nulled the watermark',
    () => {
      const db = openDb();
      db.prepare(SET_IN_PROGRESS).run('device-abc', 0, '2026-06-23T09:00:00.000Z');
      db.prepare(SET_DOWNLOAD_WATERMARK).run('2026-06-23T10:00:00.000Z');
      db.prepare(OLD_IN_PROGRESS_INSERT_OR_REPLACE).run('device-abc', 1, '2026-06-23T11:00:00.000Z');
      const r = row(db);
      assert(
        r.last_download_sync_at == null,
        'the old statement nulls the watermark — this is exactly the bug the UPSERT fixes',
      );
    },
  );

  if (failures.length > 0) {
    console.error(`\nsyncMetadata contract: ${failures.length} FAILED`);
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`\nsyncMetadata contract: ${passed} checks passed`);
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
