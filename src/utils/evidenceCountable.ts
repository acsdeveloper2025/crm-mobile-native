// THE "does this capture count as evidence?" predicate.
//
// Split out of attachmentCount.ts on 2026-07-17 for one reason: that module
// imports AttachmentRepository → DatabaseService → op-sqlite, so it cannot be
// loaded by the contract harness (`node --experimental-strip-types`). A rule
// this shared needs a test that fails on revert, and a rule can only be tested
// if it is importable without a native module. Keep this file dependency-free.
//
// An attachment counts toward the minimum-photos rule when it is in a
// sync-status we can still upload (PENDING / UPLOADING / SYNCED). Rows with
// status ABANDONED (task revoked while PENDING — C10) or SKIPPED (file missing
// on disk — AttachmentUploader) are shown in the gallery but are NOT evidence:
// their bytes will never reach the server.

const COUNTABLE_ATTACHMENT_STATUSES = new Set([
  'PENDING',
  'UPLOADING',
  'SYNCED',
]);

export const isCountableEvidence = (row: unknown): boolean => {
  const raw = (row ?? {}) as Record<string, unknown>;
  const status = String(
    raw.syncStatus ?? raw.sync_status ?? 'PENDING',
  ).toUpperCase();
  return COUNTABLE_ATTACHMENT_STATUSES.has(status);
};
