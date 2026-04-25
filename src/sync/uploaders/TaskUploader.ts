import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'TaskUploader';

// 409 on /start, /complete, /revoke means the task is already in (or past)
// the desired state on the server — the desired effect is observed, the
// upload is idempotent. Same pattern as FormUploader.ts:252-264 and
// LocationUploader.ts:36-44.
const isAlreadyDoneError = (err: unknown): boolean => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 409;
};

class TaskUploaderClass {
  async uploadTaskUpdate(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = operation.payload;
    const action = String(payload.action || '').toLowerCase();
    let response: { success: boolean } | null = null;

    try {
      if (action === 'start') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.START(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'complete') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.COMPLETE(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'revoke') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.REVOKE(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'priority') {
        response = await ApiClient.put<{ success: boolean }>(
          ENDPOINTS.TASKS.PRIORITY(operation.entityId),
          { priority: payload.priority },
          idempotencyHeaders(operation.operationId),
        );
      }
    } catch (err) {
      if (isAlreadyDoneError(err) && action !== 'priority') {
        Logger.info(
          TAG,
          `Task ${action} 409 for ${operation.entityId}: server already in/past desired state, marking SYNCED`,
        );
        response = { success: true };
      } else {
        throw err;
      }
    }

    if (!response?.success) {
      return { outcome: 'FAILURE', error: 'Task update failed' };
    }

    if (typeof payload.localTaskId === 'string') {
      await SyncEngineRepository.execute(
        "UPDATE tasks SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?",
        [new Date().toISOString(), payload.localTaskId],
      );
    }

    return { outcome: 'SUCCESS' };
  }

  async uploadTaskStatus(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = operation.payload;
    const status = String(payload.status || payload.action || '').toUpperCase();
    const localTaskId =
      typeof payload.localTaskId === 'string' ? payload.localTaskId : null;
    const now = new Date().toISOString();
    let response: { success: boolean } | null = null;

    try {
      if (status === 'IN_PROGRESS') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.START(operation.entityId),
          { action: 'start' },
          idempotencyHeaders(operation.operationId),
        );
      } else if (status === 'COMPLETED') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.COMPLETE(operation.entityId),
          { action: 'complete' },
          idempotencyHeaders(operation.operationId),
        );
      } else if (status === 'REVOKED') {
        response = await ApiClient.post<{ success: boolean }>(
          ENDPOINTS.TASKS.REVOKE(operation.entityId),
          {
            action: 'revoke',
            reason: payload.reason || payload.revokeReason || null,
          },
          idempotencyHeaders(operation.operationId),
        );
      } else {
        response = { success: true };
      }
    } catch (err) {
      if (isAlreadyDoneError(err)) {
        Logger.info(
          TAG,
          `Task status ${status} 409 for ${operation.entityId}: server already in/past desired state, marking SYNCED`,
        );
        response = { success: true };
      } else {
        throw err;
      }
    }

    if (!response?.success) {
      return { outcome: 'FAILURE', error: 'Task status upload failed' };
    }

    if (localTaskId) {
      await SyncEngineRepository.execute(
        `UPDATE tasks
         SET sync_status = 'SYNCED',
             last_synced_at = ?,
             local_updated_at = CASE
               WHEN local_updated_at IS NULL THEN ?
               ELSE local_updated_at
             END
         WHERE id = ?`,
        [now, now, localTaskId],
      );
    }

    return { outcome: 'SUCCESS' };
  }
}

export const TaskUploader = new TaskUploaderClass();
