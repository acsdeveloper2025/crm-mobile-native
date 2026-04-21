// M4 (audit 2026-04-21): shared helper so PhotoGallery's displayed
// "(N captured)" count and FormSubmissionService's submit validator
// can't drift. H3 first introduced the filter in both places; this
// module is the single source of truth going forward.
//
// An attachment is "countable" toward the minimum-photos rule when
// it is in a sync-status we can still upload (PENDING / UPLOADING /
// SYNCED). Rows with status ABANDONED (task revoked while PENDING —
// C10) or SKIPPED (file missing on disk — AttachmentUploader) are
// displayed in the gallery but excluded from the count.

const COUNTABLE_ATTACHMENT_STATUSES = new Set([
  'PENDING',
  'UPLOADING',
  'SYNCED',
]);

export const isCountableAttachment = (row: unknown): boolean => {
  const raw = (row ?? {}) as Record<string, unknown>;
  const status = String(
    raw.syncStatus ?? raw.sync_status ?? 'PENDING',
  ).toUpperCase();
  return COUNTABLE_ATTACHMENT_STATUSES.has(status);
};
