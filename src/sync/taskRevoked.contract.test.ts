// Contract test for isRevokedByServer — the ONE "did the office revoke this
// task?" predicate for a down-synced payload.
//
// 2026-07-17: SyncDownloadService answered this twice, 25 lines apart, from two
// different sources — the `is_revoked` column from `task.isRevoked`, and
// `justRevoked` (which gates the B-148 wipe of local photos/drafts) from the
// conflict-resolved status. They disagreed whenever a revoke arrived while the
// agent had queued work, leaving a row that is invisible to every list AND
// unreapable by retention, whose evidence stays on the device forever.
//
//     npm run contract:task-revoked
//
// Dependency-free: SyncConflictResolver imports op-sqlite and cannot load here.

import { isRevokedByServer } from './taskRevoked.ts';

declare const process: { exitCode?: number };

let passed = 0;
const failures: string[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(
      `${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

check('the flag alone marks a task revoked', () => {
  assert(isRevokedByServer({ isRevoked: true }), 'isRevoked:true');
});

check('the status alone marks a task revoked', () => {
  // crm2 derives isRevoked FROM status === 'REVOKED'
  // (apps/api/src/modules/sync/service.ts), so the two always ship together —
  // but accepting either means a payload can never be half-revoked here.
  assert(isRevokedByServer({ status: 'REVOKED' }), 'status REVOKED');
  assert(isRevokedByServer({ status: 'revoked' }), 'case-insensitive');
});

check('the real crm2 payload shape (both together) is revoked', () => {
  assert(
    isRevokedByServer({ status: 'REVOKED', isRevoked: true }),
    'status+flag',
  );
});

check('live statuses are NOT revoked', () => {
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED']) {
    assert(!isRevokedByServer({ status }), `${status} must not be revoked`);
    assert(
      !isRevokedByServer({ status, isRevoked: false }),
      `${status} + isRevoked:false must not be revoked`,
    );
  }
});

check('a missing / empty payload is not revoked', () => {
  assert(!isRevokedByServer({}), 'empty');
  assert(!isRevokedByServer({ status: null }), 'null status');
  assert(!isRevokedByServer({ status: undefined }), 'undefined status');
});

check('the local IN_PROGRESS zombie cannot happen: a revoked payload is revoked regardless of local work', () => {
  // The production shape: the office revokes (status=REVOKED, isRevoked=true)
  // while the agent has a queued change. Both writers now read THIS, so
  // `is_revoked=1` and the resolved status can no longer disagree — the wipe
  // fires and retention can reap the row.
  const payload = { status: 'REVOKED', isRevoked: true };
  assert(isRevokedByServer(payload), 'revoked payload must be revoked');
});

if (failures.length > 0) {
  console.error(`\ntaskRevoked contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\ntaskRevoked contract: ${passed} checks passed`);
}
