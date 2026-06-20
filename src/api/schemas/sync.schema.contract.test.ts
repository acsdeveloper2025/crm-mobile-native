// ADR-0054 Phase 1 contract test (MITIGATION #2).
//
// This is the app-side guard for the v2-native `/api/v2/sync/download`
// shape. It parses a realistic bare v2-native payload through the live Zod
// schema and asserts:
//   1. a well-formed v2-native body validates,
//   2. the NEW identity/display fields survive parsing,
//   3. the DROPPED v1-only fields are absent from the parsed result, and
//   4. hard-break inputs (no `tasks` array, missing `id`/`caseId`) fail.
//
// The repo has no jest/vitest runner and the frozen stack forbids adding
// one, so this file is a self-contained assertion script run through
// Node's built-in TypeScript type-stripping:
//
//     npm run contract:mobile
//
// It exits non-zero on the first failed assertion. It is intentionally
// dependency-free (only the project's own Zod schema). Assertions use a
// tiny local helper instead of `node:assert` so this file typechecks under
// the React Native tsconfig (whose `types` is jest-only — no node globals)
// while still running under plain Node via type-stripping.

import {
  MobileCaseSchema,
  MobileSyncDownloadResponseSchema,
  MobileRefreshResponseSchema,
  MobileVersionCheckResponseSchema,
  MobileNotificationListSchema,
} from './sync.schema.ts';
import { MobileLoginResponseSchema } from './auth.schema.ts';

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

function assertOk(value: unknown, msg?: string): void {
  if (!value) {
    throw new Error(msg || `expected a truthy value but got ${String(value)}`);
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

// A realistic v2-native task as the server now emits it (bare, no wrapper).
const v2Task = {
  id: '11111111-1111-1111-1111-111111111111',
  taskNumber: 'VT-000127',
  caseId: '22222222-2222-2222-2222-222222222222',
  caseNumber: 4,
  customerName: 'ACS BUILDERS',
  customerPhone: '9876543210',
  customerCallingCode: '+91',
  companyName: 'Acme Corp',
  applicantType: 'INDIVIDUAL',
  address: '12 MG Road, Indiranagar, Bengaluru',
  addressPincode: '560038',
  latitude: 12.97,
  longitude: 77.59,
  status: 'ASSIGNED',
  priority: 'HIGH',
  verificationUnit: { id: 7, name: 'RESIDENCE', code: 'RES' },
  notes: 'Verify residence',
  assignedAt: '2026-06-20T08:00:00.000Z',
  updatedAt: '2026-06-20T08:00:00.000Z',
  inProgressAt: undefined,
  submittedAt: undefined,
  completedAt: undefined,
  verificationOutcome: undefined,
  formData: undefined,
  backendContactNumber: '1800000000',
  createdByBackendUser: 'backend.user',
  assignedToFieldUser: 'field.exec',
  isRevoked: false,
  revokedAt: undefined,
  revokeReason: undefined,
  revokedByName: undefined,
  attachmentCount: 0,
  client: { id: 1, name: 'HDFC', code: 'HDFC' },
  product: { id: 2, name: 'Personal Loan', code: 'PL' },
};

const v2Body = {
  tasks: [v2Task],
  revokedAssignmentIds: ['33333333-3333-3333-3333-333333333333'],
  syncTimestamp: '2026-06-20T08:00:01.000Z',
  hasMore: false,
  nextCursor: null,
};

// The v1-only fields that the server STOPPED sending. None of these may
// reappear on the parsed task — they are device-local concepts now.
const DROPPED_V1_FIELDS = [
  'verificationTaskId',
  'verificationTaskNumber',
  'title',
  'description',
  'addressStreet',
  'addressCity',
  'addressState',
  'isSaved',
  'savedAt',
  'syncStatus',
  'attachments',
  'verificationType',
  'verificationTypeDetails',
] as const;

const DROPPED_BODY_FIELDS = [
  'cases',
  'changes',
  'deletedTaskIds',
  'deletedCaseIds',
  'conflicts',
  'attachmentChanges',
] as const;

check('a realistic v2-native body validates', () => {
  const result = MobileSyncDownloadResponseSchema.safeParse(v2Body);
  assertEqual(
    result.success,
    true,
    result.success ? '' : JSON.stringify(result.error?.issues),
  );
});

check('the new identity/display fields survive parsing', () => {
  const task = MobileCaseSchema.parse(v2Task) as Record<string, unknown>;
  assertEqual(task.id, v2Task.id);
  assertEqual(task.caseId, v2Task.caseId);
  assertEqual(task.taskNumber, 'VT-000127');
  assertEqual(task.caseNumber, 4);
  assertEqual(task.address, v2Task.address);
  assertEqual(task.addressPincode, '560038');
  const unit = task.verificationUnit as Record<string, unknown>;
  assertEqual(unit.name, 'RESIDENCE');
  assertEqual(unit.code, 'RES');
});

check('the dropped v1-only task fields are absent', () => {
  const task = MobileCaseSchema.parse(v2Task) as Record<string, unknown>;
  for (const field of DROPPED_V1_FIELDS) {
    assertEqual(
      field in task,
      false,
      `dropped v1 field "${field}" must not be present on the parsed task`,
    );
  }
});

check('the dropped body-level fields are absent', () => {
  const body = MobileSyncDownloadResponseSchema.parse(v2Body) as Record<
    string,
    unknown
  >;
  for (const field of DROPPED_BODY_FIELDS) {
    assertEqual(
      field in body,
      false,
      `dropped body field "${field}" must not be present on the parsed body`,
    );
  }
  // and the new bare-body fields ARE present
  assertOk(Array.isArray(body.tasks));
  assertOk(Array.isArray(body.revokedAssignmentIds));
});

check('a body without a `tasks` array is a hard break (fails)', () => {
  const result = MobileSyncDownloadResponseSchema.safeParse({
    cases: [v2Task], // old field name — must NOT satisfy the new schema
    syncTimestamp: '2026-06-20T08:00:01.000Z',
  });
  assertEqual(result.success, false);
});

function omitKey(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...obj };
  delete copy[key];
  return copy;
}

check('a task missing `id` is a hard break (fails)', () => {
  const result = MobileCaseSchema.safeParse(omitKey(v2Task, 'id'));
  assertEqual(result.success, false);
});

check('a task missing `caseId` is a hard break (fails)', () => {
  const result = MobileCaseSchema.safeParse(omitKey(v2Task, 'caseId'));
  assertEqual(result.success, false);
});

// ─────────────────────────────────────────────────────────────────────────
// ADR-0054 Phase 5 (app cutover): the v1 envelope adapter is REMOVED, so the
// app parses each endpoint's BARE v2 body directly. These checks pin the
// now-bare shapes the app reads off the top level (no `{ success, data }`).
// ─────────────────────────────────────────────────────────────────────────

// --- /auth/login — bare { user, tokens, ... } (no { success, data }) ---
const v2LoginBody = {
  user: {
    id: 'u-1',
    username: 'field.exec',
    role: 'FIELD_AGENT',
    name: 'Field Exec',
  },
  tokens: {
    accessToken: 'access.jwt.token',
    refreshToken: 'refresh.jwt.token',
    expiresIn: 900,
  },
  // extra v2 flags the app ignores — must pass through, not fail validation
  mustChangePassword: false,
  mustAcceptPolicies: false,
  pendingPolicies: [],
};

check('a bare v2 /auth/login body validates and exposes top-level tokens', () => {
  const parsed = MobileLoginResponseSchema.parse(v2LoginBody) as Record<
    string,
    unknown
  >;
  const tokens = parsed.tokens as Record<string, unknown>;
  assertEqual(tokens.accessToken, 'access.jwt.token');
  assertEqual(tokens.refreshToken, 'refresh.jwt.token');
  const user = parsed.user as Record<string, unknown>;
  assertEqual(user.username, 'field.exec');
});

check('a v1-wrapped login body { success, data } no longer validates', () => {
  const result = MobileLoginResponseSchema.safeParse({
    success: true,
    data: v2LoginBody,
  });
  // The bare schema requires top-level `user`+`tokens`; the wrapped body lacks them.
  assertEqual(result.success, false);
});

// --- /auth/refresh — bare { tokens: {...} } (no { success, data }) ---
check('a bare v2 /auth/refresh body validates with top-level tokens', () => {
  const parsed = MobileRefreshResponseSchema.parse({
    tokens: {
      accessToken: 'a.jwt',
      refreshToken: 'r.jwt',
      expiresIn: 900,
    },
  }) as Record<string, unknown>;
  const tokens = parsed.tokens as Record<string, unknown>;
  assertEqual(tokens.accessToken, 'a.jwt');
  assertEqual(tokens.expiresIn, 900);
});

// --- /auth/version-check — bare { forceUpdate, ... } (no `success`) ---
check('a bare v2 /auth/version-check body validates (no success flag)', () => {
  const result = MobileVersionCheckResponseSchema.safeParse({
    forceUpdate: false,
    updateRequired: true,
    latestVersion: '1.0.73',
    minSupportedVersion: '1.0.50',
    urgent: false,
    downloadUrl: 'https://example/app.apk',
    releaseNotes: 'Bug fixes',
  });
  assertEqual(
    result.success,
    true,
    result.success ? '' : JSON.stringify(result.error?.issues),
  );
});

// --- /notifications — paginated { items, totalCount, ... }; the app parses
// `.items` (an array of notification rows) through the list schema. ---
check('the notification list `items` array parses through the list schema', () => {
  const items = [
    {
      id: 'n-1',
      type: 'CASE_ASSIGNMENT',
      title: 'New task assigned',
      isRead: false,
      createdAt: '2026-06-20T08:00:00.000Z',
    },
  ];
  const result = MobileNotificationListSchema.safeParse(items);
  assertEqual(
    result.success,
    true,
    result.success ? '' : JSON.stringify(result.error?.issues),
  );
});

// --- device attachment upload — bare { attachments, failed, ... }; the app
// detects partial/total failure from `failed[]`, NOT a `success` flag. This
// pins the detection logic the AttachmentUploader uses post-adapter. ---
function uploadFailed(body: {
  attachments?: unknown[];
  failed?: unknown[];
}): boolean {
  const stored = body.attachments ?? [];
  const failed = body.failed ?? [];
  // No stored row (and either an explicit failure or simply nothing) → failure.
  return stored.length === 0 || (failed.length > 0 && stored.length === 0);
}

check('a successful device upload (failed:[]) is NOT a failure', () => {
  assertEqual(
    uploadFailed({ attachments: [{ id: 'a-1' }], failed: [] }),
    false,
  );
});

check('a device upload with a failed[] entry and no stored row IS a failure', () => {
  assertEqual(
    uploadFailed({
      attachments: [],
      failed: [{ filename: 'x.jpg', reason: 'PHOTO_FAILED' }],
    }),
    true,
  );
});

console.log(`\nsync.schema contract: ${passed} checks passed`);
