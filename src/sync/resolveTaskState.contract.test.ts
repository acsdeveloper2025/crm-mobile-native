// Contract test for resolveTaskState — the down-sync status merge.
//
// The repo has no jest/vitest runner (frozen stack), so this is a self-contained
// assertion script run through Node's type-stripping, mirroring
// src/sync/reconcileTaskIdentity.contract.test.ts:
//
//     npm run contract:revoke-resolve
//
// It proves audit finding A2026-0623-11: a server REVOKED status was masked by
// the local status whenever the task had queued changes or fresher local edits,
// so the row stayed IN_PROGRESS (is_revoked=1) and its PII was never purged.
// After the fix a revoked task (backend status REVOKED OR the server revoked
// flag) short-circuits to REVOKED with the local "saved" state cleared, while
// non-revoked merges keep preserving local work.
//
// It exits non-zero on the first failed assertion.

import {
  resolveTaskState,
  type ExistingTaskState,
} from './resolveTaskState.ts';

declare const process: { exitCode?: number };

const baseExisting: ExistingTaskState = {
  status: 'IN_PROGRESS',
  isSaved: true,
  inProgressAt: '2026-06-25T10:00:00.000Z',
  savedAt: '2026-06-25T10:05:00.000Z',
  completedAt: null,
  syncStatus: 'PENDING',
  localUpdatedAt: '2026-06-25T10:06:00.000Z',
};

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
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// THE BUG: queued local changes masked the revoke.
check('revoked under queued changes resolves REVOKED with saved cleared', () => {
  const r = resolveTaskState(
    { status: 'REVOKED', isRevoked: true },
    { ...baseExisting, syncStatus: 'PENDING' },
    /* hasQueuedChanges */ true,
    /* localHasFreshEdits */ false,
  );
  assert(r.status === 'REVOKED', `status must be REVOKED, got "${r.status}"`);
  assert(r.isSaved === 0, `isSaved must be cleared to 0, got ${r.isSaved}`);
  assert(r.savedAt === null, `savedAt must be cleared, got "${r.savedAt}"`);
});

// THE BUG (second branch): fresher local edits masked the revoke.
check('revoked under fresher local edits resolves REVOKED', () => {
  const r = resolveTaskState(
    { status: 'REVOKED', isRevoked: true },
    { ...baseExisting, isSaved: false, syncStatus: 'SYNCED' },
    /* hasQueuedChanges */ false,
    /* localHasFreshEdits */ true,
  );
  assert(r.status === 'REVOKED', `status must be REVOKED, got "${r.status}"`);
  assert(r.isSaved === 0, `isSaved must be 0, got ${r.isSaved}`);
});

// Divergence guard: the server revoked flag is authoritative even if the
// status field hasn't flipped to REVOKED yet.
check('server revoked flag with non-REVOKED status still resolves REVOKED', () => {
  const r = resolveTaskState(
    { status: 'IN_PROGRESS', isRevoked: true },
    { ...baseExisting },
    /* hasQueuedChanges */ true,
    /* localHasFreshEdits */ false,
  );
  assert(r.status === 'REVOKED', `status must be REVOKED, got "${r.status}"`);
});

// Regression guard: the short-circuit must NOT fire for non-revoked tasks —
// queued local work is still preserved.
check('non-revoked queued changes still preserve local progress', () => {
  const r = resolveTaskState(
    { status: 'ASSIGNED', isRevoked: false },
    { ...baseExisting },
    /* hasQueuedChanges */ true,
    /* localHasFreshEdits */ false,
  );
  assert(r.status === 'IN_PROGRESS', `local IN_PROGRESS must be preserved, got "${r.status}"`);
  assert(r.isSaved === 1, `local isSaved must be preserved, got ${r.isSaved}`);
});

// Regression guard: no existing local row + non-revoked → take the server status.
check('no existing row resolves to the backend status', () => {
  const r = resolveTaskState(
    { status: 'ASSIGNED' },
    null,
    /* hasQueuedChanges */ false,
    /* localHasFreshEdits */ false,
  );
  assert(r.status === 'ASSIGNED', `status must be ASSIGNED, got "${r.status}"`);
  assert(r.isSaved === 0, `isSaved must be 0, got ${r.isSaved}`);
});

if (failures.length > 0) {
  console.error(`\nresolveTaskState contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nresolveTaskState contract: ${passed} checks passed`);
}
