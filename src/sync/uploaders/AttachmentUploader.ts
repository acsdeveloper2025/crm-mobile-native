import RNFS from 'react-native-fs';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import type { SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'AttachmentUploader';

class AttachmentUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = { ...operation.payload };
    const taskId = String(payload.visitId || payload.taskId || '');
    const localPath = String(payload.localPath || '');

    if (!await RNFS.exists(localPath)) {
      Logger.error(TAG, `Photo file missing — cannot upload: ${localPath}`);
      await SyncEngineRepository.execute(
        "UPDATE attachments SET sync_status = 'FAILED', last_sync_attempt_at = ? WHERE id = ?",
        [new Date().toISOString(), payload.id],
      );
      return { outcome: 'FAILURE', error: `Photo file missing: ${localPath}` };
    }

    const formData = new FormData();
    formData.append('files', {
      uri: `file://${localPath}`,
      type: String(payload.mimeType || 'image/jpeg'),
      name: String(payload.filename || `${payload.id}.jpg`),
    } as any);
    formData.append(
      'photoType',
      String(payload.photoType || (payload.componentType === 'selfie' ? 'selfie' : 'verification')),
    );
    formData.append('operationId', operation.operationId);

    const lat =
      payload.geoLocation && typeof payload.geoLocation === 'object'
        ? (payload.geoLocation as Record<string, unknown>).latitude
        : payload.latitude;
    const lng =
      payload.geoLocation && typeof payload.geoLocation === 'object'
        ? (payload.geoLocation as Record<string, unknown>).longitude
        : payload.longitude;

    formData.append(
      'geoLocation',
      JSON.stringify({
        latitude: lat ?? null,
        longitude: lng ?? null,
        accuracy: payload.accuracy ?? 0,
        timestamp: new Date().toISOString(),
      }),
    );

    const response = await ApiClient.post<{
      success: boolean;
      data?: { attachments?: Array<{ id: string; url?: string }> };
    }>(ENDPOINTS.ATTACHMENTS.UPLOAD(taskId), formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Idempotency-Key': operation.operationId,
      },
    });

    if (!response.success) {
      return { outcome: 'FAILURE', error: 'Attachment upload failed' };
    }

    const uploadedAttachment = response.data?.attachments?.[0];
    await SyncEngineRepository.execute(
      `UPDATE attachments
       SET sync_status = 'SYNCED',
           backend_attachment_id = COALESCE(?, backend_attachment_id),
           remote_path = COALESCE(?, remote_path),
           last_sync_attempt_at = ?
       WHERE id = ?`,
      [uploadedAttachment?.id || null, uploadedAttachment?.url || null, new Date().toISOString(), payload.id],
    );
    return { outcome: 'SUCCESS' };
  }
}

export const AttachmentUploader = new AttachmentUploaderClass();
