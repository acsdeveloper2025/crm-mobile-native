// M4 (audit 2026-04-21): shared helper so PhotoGallery's displayed
// "(N captured)" count and FormSubmissionService's submit validator
// can't drift. H3 first introduced the filter in both places; this
// module is the single source of truth going forward.

import { CaptureRepository } from '../repositories/CaptureRepository';
// The predicate itself lives in a dependency-free module so the contract
// harness can load it — this file pulls in op-sqlite and cannot be tested.
// Re-exported here so existing importers keep working.
export { isCountableEvidence } from './evidenceCountable';
import { isCountableEvidence } from './evidenceCountable';

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
  const rows = await CaptureRepository.listForTask(taskId);
  let photoCount = 0;
  let selfieCount = 0;
  for (const row of rows) {
    if (!isCountableEvidence(row)) {
      continue;
    }
    const raw = row as unknown as Record<string, unknown>;
    const componentType = raw.componentType ?? raw.component_type;
    if (componentType === 'photo') photoCount += 1;
    if (componentType === 'selfie') selfieCount += 1;
  }
  return { photoCount, selfieCount };
};

// 2026-07-17: how many of this task's captures have NOT reached the server.
//
// "The form synced" does NOT mean "the submission is complete". Photos enqueue
// at CAPTURE and the form enqueues at SUBMIT, both at the same priority, so the
// queue orders them only by created_at — and a photo whose upload FAILS gets a
// next_retry_at backoff and is SKIPPED by the dequeue while the form (PENDING)
// uploads regardless. FormUploader.resolveBackendAttachmentIds then sends only
// the photos that happen to be SYNCED — and if NONE are, it falls back to the
// LOCAL uuids, which the server cannot resolve at all. The server acks, the
// form goes SYNCED, and the agent is shown "Submitted to Server" while the case
// holds a partial photo set. That is what silently breaks report generation,
// the web template, and the reverse-geocode (which reads the photos' GPS).
//
// `backend_attachment_id` is the server's own receipt — it is only ever written
// from an upload response (AttachmentUploader / CaptureRepository), so a row
// without one has definitively not landed. Checking it as well as sync_status
// also catches `markMissingAsSynced`-style rows that are SYNCED with no id.
//
// Counts only COUNTABLE captures: a SKIPPED row (file gone from disk) can never
// upload, so it is not "pending" — nothing would re-send it.
export const countUnuploadedEvidence = async (
  taskId: string,
): Promise<number> => {
  const rows = await CaptureRepository.listForTask(taskId);
  let unuploaded = 0;
  for (const row of rows) {
    if (!isCountableEvidence(row)) {
      continue;
    }
    const raw = row as unknown as Record<string, unknown>;
    const syncStatus = String(
      raw.syncStatus ?? raw.sync_status ?? '',
    ).toUpperCase();
    const backendId = raw.backendAttachmentId ?? raw.backend_attachment_id;
    if (syncStatus !== 'SYNCED' || !backendId) {
      unuploaded += 1;
    }
  }
  return unuploaded;
};
