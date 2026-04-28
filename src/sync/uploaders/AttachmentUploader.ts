import RNFS from 'react-native-fs';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import attachmentService from '../../services/AttachmentService';
import { notificationService } from '../../services/NotificationService';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import type { SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'AttachmentUploader';

// C28 (audit 2026-04-20): axios default timeout is 30 s — far too short
// for 2–10 MB photos on 3G (100–500 Kbps). Scale the timeout with the
// payload size, mirroring SyncQueue.calculateLeaseTimeout so the lease
// always outlasts the upload by ≥ 4 minutes, guaranteeing that no other
// processor can steal the row mid-upload.
const UPLOAD_BASE_TIMEOUT_MS = 60 * 1000;
const UPLOAD_PER_MB_MS = 30 * 1000;
const UPLOAD_MAX_TIMEOUT_MS = 10 * 60 * 1000;

function calculateUploadTimeout(sizeBytes: number): number {
  const sizeMb = Math.max(0, sizeBytes) / (1024 * 1024);
  const dynamic = UPLOAD_BASE_TIMEOUT_MS + Math.ceil(sizeMb) * UPLOAD_PER_MB_MS;
  return Math.min(dynamic, UPLOAD_MAX_TIMEOUT_MS);
}

class AttachmentUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = { ...operation.payload };
    const taskId = String(payload.visitId || payload.taskId || '');
    const localPath = String(payload.localPath || '');

    if (!(await RNFS.exists(localPath))) {
      // File was deleted from disk (cache cleared, storage reclaimed).
      // Mark as SKIPPED rather than FAILURE to avoid wasting retry attempts
      // on an unrecoverable condition — the file can't be re-created.
      Logger.warn(TAG, `Photo file missing — skipping upload: ${localPath}`);
      await SyncEngineRepository.execute(
        "UPDATE attachments SET sync_status = 'SKIPPED', sync_error = 'File missing from disk', last_sync_attempt_at = ? WHERE id = ?",
        [new Date().toISOString(), String(payload.id)],
      );

      // Alert the user that a photo was lost so they can retake it
      try {
        await notificationService.addNotification({
          type: 'SYNC_WARNING',
          title: 'Photo Upload Skipped',
          message: `A photo for task could not be uploaded because the file was removed from device storage. Please retake the photo if needed.`,
          priority: 'HIGH',
          taskId: taskId || undefined,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // best effort — don't fail the sync for a notification error
      }

      // Return SUCCESS so the queue item is completed (not retried forever)
      return {
        outcome: 'SUCCESS',
        error: `Photo file missing (skipped): ${localPath}`,
      };
    }

    // C7 (audit 2026-04-20, 2026-04-21 decision): strip EXIF in
    // place before upload. Vision Camera writes GPS/device/serial
    // into the JPEG's EXIF headers; the watermark already has the
    // evidence fields we want, so the EXIF is pure leakage. Best
    // effort — on failure the file is uploaded unchanged (pre-C7
    // behaviour) with a warning logged.
    await attachmentService.stripExifMetadata(localPath);

    const formData = new FormData();
    formData.append('files', {
      uri: `file://${localPath}`,
      type: String(payload.mimeType || 'image/jpeg'),
      name: String(payload.filename || `${payload.id}.jpg`),
    } as any);
    formData.append(
      'photoType',
      String(
        payload.photoType ||
          (payload.componentType === 'selfie' ? 'selfie' : 'verification'),
      ),
    );
    formData.append('operationId', operation.operationId);

    // 2026-04-28 deep-audit fix (D6/D17): client-side SHA-256 hash for
    // backend tamper detection. Sent only when present (compute may have
    // failed at capture). Backend's `verification_attachments.client_sha256`
    // column stores it; backend may also re-hash on receipt and compare.
    if (
      typeof payload.clientSha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(payload.clientSha256)
    ) {
      formData.append('clientSha256', payload.clientSha256);
    }

    const lat =
      payload.geoLocation && typeof payload.geoLocation === 'object'
        ? (payload.geoLocation as Record<string, unknown>).latitude
        : payload.latitude;
    const lng =
      payload.geoLocation && typeof payload.geoLocation === 'object'
        ? (payload.geoLocation as Record<string, unknown>).longitude
        : payload.longitude;

    // D3 (audit 2026-04-21 round 2): use the capture-time timestamp
    // stored on the attachment row rather than `new Date()` at upload
    // time. Backend's idempotencyMiddleware hashes the body; a stable
    // Idempotency-Key with a drifting body returns HTTP 409
    // IDEMPOTENCY_KEY_CONFLICT on every retry, trapping the upload in
    // the DLQ loop even though the first attempt may have succeeded.
    const locationTimestamp =
      typeof payload.locationTimestamp === 'string' &&
      payload.locationTimestamp.length > 0
        ? payload.locationTimestamp
        : typeof payload.capturedAt === 'string' &&
          payload.capturedAt.length > 0
        ? payload.capturedAt
        : // Last-resort fallback when neither timestamp is on the
          // payload. Stable within an attempt but could still drift
          // across retries — log so we can pin it down if it fires.
          new Date(0).toISOString();

    formData.append(
      'geoLocation',
      JSON.stringify({
        latitude: lat ?? null,
        longitude: lng ?? null,
        accuracy: payload.accuracy ?? 0,
        timestamp: locationTimestamp,
      }),
    );

    const sizeBytes = typeof payload.size === 'number' ? payload.size : 0;
    const uploadTimeoutMs = calculateUploadTimeout(sizeBytes);

    const response = await ApiClient.post<{
      success: boolean;
      data?: { attachments?: Array<{ id: string; url?: string }> };
    }>(ENDPOINTS.ATTACHMENTS.UPLOAD(taskId), formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Idempotency-Key': operation.operationId,
      },
      timeout: uploadTimeoutMs,
    });

    if (!response.success) {
      return { outcome: 'FAILURE', error: 'Attachment upload failed' };
    }

    // M21: the server has already accepted the upload at this
    // point and is protected by the Idempotency-Key header above,
    // so a retry on the next sync cycle will return the same
    // result without uploading twice. The remaining risk is that
    // the LOCAL row fails to transition to SYNCED — which leaves
    // sync_queue in a loop of "upload succeeds → local update
    // fails → retry → idempotent response → local update fails".
    // The retry loop here catches transient SQLite contention
    // (BUSY, LOCKED) at a cost of up to ~450ms total before we
    // give up and let the outer queue retry from scratch.
    const uploadedAttachment = response.data?.attachments?.[0];
    const attachmentId = String(payload.id);
    const now = new Date().toISOString();

    let lastUpdateError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await SyncEngineRepository.execute(
          `UPDATE attachments
           SET sync_status = 'SYNCED',
               backend_attachment_id = COALESCE(?, backend_attachment_id),
               remote_path = COALESCE(?, remote_path),
               last_sync_attempt_at = ?
           WHERE id = ?`,
          [
            uploadedAttachment?.id || null,
            uploadedAttachment?.url || null,
            now,
            attachmentId,
          ],
        );
        lastUpdateError = null;
        break;
      } catch (err) {
        lastUpdateError = err;
        // 50ms, 150ms backoff — short enough that the outer lease
        // timeout is not at risk.
        await new Promise<void>(resolve =>
          setTimeout(() => resolve(), 50 * (attempt + 1) ** 2),
        );
      }
    }

    if (lastUpdateError) {
      // Log with the backend id so a manual reconciliation pass
      // can pair the local row with the server record even if the
      // next sync cycle never succeeds. Falls back to FAILURE so
      // the queue retries the whole operation — server will
      // deduplicate via Idempotency-Key.
      Logger.error(
        TAG,
        'Attachment local SYNCED update failed after 3 attempts',
        {
          attachmentId,
          backendAttachmentId: uploadedAttachment?.id,
          operationId: operation.operationId,
          error: lastUpdateError,
        },
      );
      return {
        outcome: 'FAILURE',
        error: 'Attachment upload succeeded but local SYNCED update failed',
      };
    }

    return { outcome: 'SUCCESS' };
  }
}

export const AttachmentUploader = new AttachmentUploaderClass();
