import RNFS from 'react-native-fs';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { DatabaseService } from '../../database/DatabaseService';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import { Logger } from '../../utils/logger';
import { resolveFormTypeKey, type FormTypeKey } from '../../utils/formTypeKey';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'FormUploader';

class FormUploaderClass {
  private async updateLocalSubmissionState(
    taskId: string | null | undefined,
    status: 'pending' | 'submitting' | 'success' | 'failed',
    error?: string | null,
    markCompleted: boolean = false,
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const rows = await SyncEngineRepository.query<{ form_data_json: string | null }>(
      'SELECT form_data_json FROM tasks WHERE id = ?',
      [taskId],
    );

    const existing = rows[0]?.form_data_json;
    let formData: Record<string, unknown> = {};
    if (existing) {
      try {
        formData = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        formData = {};
      }
    }

    const nextFormData = {
      ...formData,
      __submission: {
        status,
        error: error || null,
        updatedAt: new Date().toISOString(),
      },
    };

    const now = new Date().toISOString();
    if (markCompleted) {
      await SyncEngineRepository.execute(
        `UPDATE tasks
         SET status = 'COMPLETED',
             completed_at = ?,
             sync_status = 'SYNCED',
             last_synced_at = ?,
             local_updated_at = ?,
             form_data_json = ?
         WHERE id = ?`,
        [now, now, now, JSON.stringify(nextFormData), taskId],
      );
      return;
    }

    await SyncEngineRepository.execute(
      `UPDATE tasks
       SET form_data_json = ?, local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(nextFormData), now, taskId],
    );
  }

  private async resolveBackendAttachmentIds(
    localTaskId: string | null,
    fallbackIds: string[] = [],
  ): Promise<string[]> {
    if (!localTaskId) {
      return fallbackIds;
    }

    const rows = await SyncEngineRepository.query<{ backend_attachment_id: string | null }>(
      `SELECT backend_attachment_id
       FROM attachments
       WHERE task_id = ?
         AND sync_status = 'SYNCED'
         AND backend_attachment_id IS NOT NULL`,
      [localTaskId],
    );

    const ids = rows
      .map(row => row.backend_attachment_id)
      .filter((value): value is string => Boolean(value));

    return ids.length > 0 ? ids : fallbackIds;
  }

  private async cleanupSyncedPhotosForTask(taskId: string): Promise<void> {
    const photos = await SyncEngineRepository.query<{
      id: string;
      local_path: string;
      thumbnail_path: string | null;
    }>(
      "SELECT id, local_path, thumbnail_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
      [taskId],
    );

    for (const photo of photos) {
      try {
        if (await RNFS.exists(photo.local_path)) {
          await RNFS.unlink(photo.local_path);
        }
        if (photo.thumbnail_path && await RNFS.exists(photo.thumbnail_path)) {
          await RNFS.unlink(photo.thumbnail_path);
        }
        await SyncEngineRepository.execute('DELETE FROM attachments WHERE id = ?', [photo.id]);
      } catch {
        Logger.warn(TAG, `Failed cleaning up photo ${photo.id}`);
      }
    }
  }

  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = { ...operation.payload };
    const taskId = String(payload.taskId || payload.visitId || '');
    const localTaskId = typeof payload.localTaskId === 'string' ? payload.localTaskId : null;

    if (localTaskId) {
      // Track defer count to prevent infinite blocking when photos permanently fail
      const deferCount = typeof payload._deferCount === 'number' ? payload._deferCount : 0;
      const MAX_DEFERS = 15; // After 15 defers (~75 min at 5-min sync), upload with available photos

      // Only defer for items still actively being processed or retryable.
      // Do NOT defer for permanently FAILED items — those won't resolve on their own
      // and would block the form submission forever.
      const pendingLocationsCount = await SyncEngineRepository.count(
        'sync_queue',
        "entity_type = 'LOCATION' AND status IN ('PENDING', 'IN_PROGRESS') AND json_extract(payload_json, '$.taskId') = ?",
        [localTaskId || taskId],
      );
      if (pendingLocationsCount > 0 && deferCount < MAX_DEFERS) {
        const error = `Blocking form upload for ${taskId}: ${pendingLocationsCount} locations pending (defer ${deferCount + 1}/${MAX_DEFERS})`;
        payload._deferCount = deferCount + 1;
        await this.updateLocalSubmissionState(localTaskId, 'pending');
        return { outcome: 'DEFER', error };
      }

      const pendingPhotosCount = await SyncEngineRepository.count(
        'sync_queue',
        "entity_type IN ('VISIT_PHOTO', 'ATTACHMENT') AND status IN ('PENDING', 'IN_PROGRESS') AND (json_extract(payload_json, '$.visitId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
        [taskId, taskId],
      );
      if (pendingPhotosCount > 0 && deferCount < MAX_DEFERS) {
        const error = `Blocking form upload for ${taskId}: ${pendingPhotosCount} photos pending (defer ${deferCount + 1}/${MAX_DEFERS})`;
        payload._deferCount = deferCount + 1;
        await this.updateLocalSubmissionState(localTaskId, 'pending');
        return { outcome: 'DEFER', error };
      }

      if (deferCount >= MAX_DEFERS) {
        Logger.warn(TAG, `Form for ${taskId} exceeded max defers (${MAX_DEFERS}). Uploading with available attachments.`);
      }
    }

    await this.updateLocalSubmissionState(localTaskId, 'submitting');
    const formType = resolveFormTypeKey({
      formType: typeof payload.formType === 'string' ? payload.formType : null,
      verificationTypeCode: typeof payload.verificationTypeCode === 'string' ? payload.verificationTypeCode : null,
      verificationTypeName: typeof payload.verificationTypeName === 'string' ? payload.verificationTypeName : null,
      verificationType: typeof payload.verificationType === 'string' ? payload.verificationType : null,
    });

    const endpointMap: Record<FormTypeKey, (id: string) => string> = {
      residence: ENDPOINTS.FORMS.RESIDENCE,
      office: ENDPOINTS.FORMS.OFFICE,
      business: ENDPOINTS.FORMS.BUSINESS,
      'residence-cum-office': ENDPOINTS.FORMS.RESIDENCE_CUM_OFFICE,
      'dsa-connector': ENDPOINTS.FORMS.DSA_CONNECTOR,
      builder: ENDPOINTS.FORMS.BUILDER,
      'property-individual': ENDPOINTS.FORMS.PROPERTY_INDIVIDUAL,
      'property-apf': ENDPOINTS.FORMS.PROPERTY_APF,
      noc: ENDPOINTS.FORMS.NOC,
    };

    if (!formType || !endpointMap[formType]) {
      return { outcome: 'FAILURE', error: 'Unsupported form type for sync' };
    }

    payload.attachmentIds = await this.resolveBackendAttachmentIds(
      localTaskId,
      Array.isArray(payload.attachmentIds) ? (payload.attachmentIds as string[]) : [],
    );
    delete payload.images;

    if (localTaskId) {
      await SyncEngineRepository.execute(
        'UPDATE form_submissions SET attachment_ids_json = ? WHERE id = ?',
        [JSON.stringify(payload.attachmentIds), operation.entityId],
      );
    }

    const response = await ApiClient.post<{ success: boolean }>(
      endpointMap[formType](taskId),
      payload,
      idempotencyHeaders(operation.operationId),
    );

    if (!response.success) {
      await this.updateLocalSubmissionState(localTaskId, 'failed', 'Form upload returned failure');
      return { outcome: 'FAILURE', error: 'Form upload returned failure' };
    }

    // Wrap all post-upload DB updates in a transaction to prevent partial
    // state if a crash occurs between marking synced and clearing autosave.
    await DatabaseService.transaction(async () => {
      if (localTaskId) {
        await this.updateLocalSubmissionState(localTaskId, 'success', null, true);
      }

      await SyncEngineRepository.execute(
        "UPDATE form_submissions SET sync_status = 'SYNCED', status = 'SYNCED' WHERE id = ?",
        [operation.entityId],
      );
      await SyncEngineRepository.execute(
        'DELETE FROM key_value_store WHERE key = ?',
        [`auto_save_${localTaskId || taskId}`],
      );
    });

    // Cleanup photos only after database has been updated successfully
    if (localTaskId) {
      await this.cleanupSyncedPhotosForTask(localTaskId);
    }

    return { outcome: 'SUCCESS' };
  }
}

export const FormUploader = new FormUploaderClass();
