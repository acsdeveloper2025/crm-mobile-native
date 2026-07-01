// Background-sync FCM trigger contract test (2026-07-01).
//
// Guards the predicate the index.js setBackgroundMessageHandler uses to
// decide whether a backgrounded/killed-app data-message should fire one
// headless sync (which downloads new assignments AND purges revoked tasks
// via the sync-download `revokedAssignmentIds` list).
//
// The critical property: the predicate matches the RAW `type` string, NOT
// normalizeFcmType — `TASK_REVOKED` is deliberately absent from
// FCM_NOTIFICATION_TYPES and would coerce to SYSTEM_NOTIFICATION, so a
// normalize-based check would silently never trigger a revoke wipe.
//
// Same self-contained, dependency-free style as the other contract tests;
// run via:
//
//     npm run contract:fcm-bg
//
// Exits non-zero on the first failed assertion.

import {
  shouldBackgroundSyncForFcmType,
  normalizeFcmType,
} from './fcm.schema.ts';

declare const process: { exitCode?: number };

function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ': ' : ''}expected ${JSON.stringify(
        expected,
      )} but got ${JSON.stringify(actual)}`,
    );
  }
}

let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`  FAIL - ${name}\n    ${(err as Error).message}`);
    process.exitCode = 1;
    throw err;
  }
  passed += 1;
  console.log(`  ok - ${name}`);
}

check('assign types trigger a background sync', () => {
  assertEqual(shouldBackgroundSyncForFcmType('CASE_ASSIGNED'), true);
  assertEqual(shouldBackgroundSyncForFcmType('CASE_REASSIGNED'), true);
});

check('revoke types trigger a background sync', () => {
  assertEqual(shouldBackgroundSyncForFcmType('CASE_REVOKED'), true);
  assertEqual(shouldBackgroundSyncForFcmType('TASK_REVOKED'), true);
});

check('match is case-insensitive on the raw type', () => {
  assertEqual(shouldBackgroundSyncForFcmType('task_revoked'), true);
  assertEqual(shouldBackgroundSyncForFcmType('Case_Assigned'), true);
});

check('TASK_REVOKED still coerces to SYSTEM_NOTIFICATION under normalize', () => {
  // This is WHY the predicate matches the raw string: a normalize-based
  // check would drop TASK_REVOKED here and never wipe a revoked task.
  assertEqual(normalizeFcmType('TASK_REVOKED'), 'SYSTEM_NOTIFICATION');
});

check('chatty / non-task pushes do NOT trigger a sync', () => {
  assertEqual(shouldBackgroundSyncForFcmType('MESSAGE'), false);
  assertEqual(shouldBackgroundSyncForFcmType('REMINDER'), false);
  assertEqual(shouldBackgroundSyncForFcmType('SYSTEM_NOTIFICATION'), false);
  // LOCATION_REQUEST is handled by its own branch before this predicate;
  // it must not also fall through to a sync.
  assertEqual(shouldBackgroundSyncForFcmType('LOCATION_REQUEST'), false);
});

check('missing / non-string types are a safe no-op', () => {
  assertEqual(shouldBackgroundSyncForFcmType(undefined), false);
  assertEqual(shouldBackgroundSyncForFcmType(null), false);
  assertEqual(shouldBackgroundSyncForFcmType(42), false);
  assertEqual(shouldBackgroundSyncForFcmType(''), false);
});

console.log(`\nfcm.schema background-sync contract: ${passed} checks passed`);
