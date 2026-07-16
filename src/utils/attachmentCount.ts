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

import { AttachmentRepository } from '../repositories/AttachmentRepository';

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

// 2026-07-16: the authoritative count of DEVICE-CAPTURED field photos.
//
// TERMINOLOGY (do not conflate — they are different data flows):
//   * this counts PHOTO/SELFIE CAPTURES the agent took with the camera —
//     the local `attachments` SQLite table, component_type photo|selfie.
//   * an "ATTACHMENT" is an admin-uploaded reference doc pushed web →
//     device (TaskAttachmentsScreen, tasks.attachment_count, the TaskCard
//     badge). It is READ-ONLY on the device — the agent cannot create one,
//     so it can never be part of a "did the agent finish?" gate.
// The local table's name is the trap: it holds captures, not attachments.
//
// The form screen's photoCount/selfieCount come from PhotoGallery's
// onPhotosLoaded, which silently stays 0 when its 3s query times out — fine
// for a label, NOT something to refuse a Save/Submit on. Every gate that
// blocks the user re-counts through here.
export const countCapturedPhotos = async (
  taskId: string,
): Promise<{ photoCount: number; selfieCount: number }> => {
  const rows = await AttachmentRepository.listForTask(taskId);
  let photoCount = 0;
  let selfieCount = 0;
  for (const row of rows) {
    if (!isCountableAttachment(row)) {
      continue;
    }
    const raw = row as unknown as Record<string, unknown>;
    const componentType = raw.componentType ?? raw.component_type;
    if (componentType === 'photo') photoCount += 1;
    if (componentType === 'selfie') selfieCount += 1;
  }
  return { photoCount, selfieCount };
};
