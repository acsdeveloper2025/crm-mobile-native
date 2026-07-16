// Contract test for isCountableEvidence — the ONE "does this capture count
// as evidence?" predicate, shared by the form screen's Save/Submit gates, the
// Saved-tab self-heal, FormSubmissionService and SubmitVerificationUseCase.
//
// 2026-07-17: SubmitVerificationUseCase did NOT share it — it counted straight
// off `listForSubmission`, which filters on component_type only. So a task with
// 5 photos where one was SKIPPED was "incomplete" to the screen and
// submittable to the use case, and the SKIPPED id shipped in attachmentIds
// pointing at a file that can never upload. The screen path masked it; the
// auto-submit path calls the use case directly.
//
// The repo has no jest/vitest runner (frozen stack), so this is a
// self-contained assertion script run through Node's type-stripping:
//
//     npm run contract:attachment-countable
//
// It exits non-zero on the first failed assertion. Dependency-free by design —
// see the note in evidenceCountable.ts about why the predicate lives apart
// from attachmentCount.ts.

import { isCountableEvidence } from './evidenceCountable.ts';

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

check('uploadable statuses count as evidence', () => {
  for (const syncStatus of ['PENDING', 'UPLOADING', 'SYNCED']) {
    assert(
      isCountableEvidence({ syncStatus }),
      `${syncStatus} must count toward the minimum`,
    );
  }
});

check('SKIPPED is NOT evidence', () => {
  // SKIPPED (AttachmentUploader.ts:40) is the ONLY non-countable status any
  // code actually writes: the file went missing from disk, so its bytes can
  // never reach the server. It still renders in the gallery.
  assert(!isCountableEvidence({ syncStatus: 'SKIPPED' }), 'SKIPPED counted');
});

check('ABANDONED is not evidence (legacy status, no longer written)', () => {
  // Kept for old rows only. SyncDownloadService.ts:334 now DELETEs PENDING
  // children on revoke instead of marking them ABANDONED, so nothing writes
  // this any more — several comments still claim otherwise.
  assert(!isCountableEvidence({ syncStatus: 'ABANDONED' }), 'ABANDONED counted');
});

check('reads snake_case rows too (raw SQL vs mapped)', () => {
  // listForTask returns mapped camelCase; a raw `SELECT *` returns
  // sync_status. The predicate must not silently default a real row.
  assert(isCountableEvidence({ sync_status: 'SYNCED' }), 'snake_case SYNCED');
  assert(
    !isCountableEvidence({ sync_status: 'SKIPPED' }),
    'snake_case SKIPPED counted',
  );
});

check('status is matched case-insensitively', () => {
  assert(isCountableEvidence({ syncStatus: 'synced' }), 'lowercase synced');
  assert(!isCountableEvidence({ syncStatus: 'skipped' }), 'lowercase skipped');
});

check('a row with no status defaults to PENDING (counts)', () => {
  // A freshly captured row not yet stamped is real evidence on disk.
  assert(isCountableEvidence({}), 'missing status must default countable');
  assert(isCountableEvidence(null), 'null row must default countable');
});

check('an UNKNOWN status does NOT count', () => {
  // Fail closed: a status this predicate has never heard of is not evidence.
  assert(!isCountableEvidence({ syncStatus: 'FAILED' }), 'FAILED counted');
});

if (failures.length > 0) {
  console.error(`\nevidenceCountable contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nevidenceCountable contract: ${passed} checks passed`);
}
