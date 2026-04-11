import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

class TaskUploaderClass {
  async uploadTaskUpdate(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = operation.payload;
    const action = String(payload.action || '').toLowerCase();
    let response: { success: boolean } | null = null;

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
