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
//
// ADR-0054 Phase 5 — 409-as-success WITHOUT the v1 adapter. The crm2 device
// writers (repository.ts startTaskByDevice/submitTaskByDevice/revokeTaskInPlace)
// return 200 with the current CaseTaskView when the task is ALREADY in the
// target state, but throw 409 INVALID_TRANSITION when the transition is
// illegal (e.g. already terminal). Both outcomes mean "the desired/observed
// state is reached or unreachable-going-backward" — the device treats the 409
// as success (NOT priority). The check reads `error.response.status` straight
// off the raw axios error, so it is unaffected by removing the adapter.
const isAlreadyDoneError = (err: unknown): boolean => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 409;
};

// ADR-0054 Phase 5: the lifecycle endpoints (/start, /complete, /revoke,
// /priority) now return a BARE CaseTaskView (no `success` flag). A truthy
// object with an `id` is the success signal; the 409-as-success path
// synthesizes `{ id: '' }` only to mark the row SYNCED.
type LifecycleResponse = { id?: string } | null;
const isLifecycleSuccess = (r: LifecycleResponse): boolean =>
  r !== null && typeof r === 'object';

// 2026-05-01 retention v2: pre-upload existence guard. If the local
// task row was cleanup-deleted (45-day tier-2) between enqueue and
// dequeue, hitting the API for that ghost ID just generates a 4xx
// DLQ entry with no real recovery. Treat the queue row as done.
const taskRowExists = async (taskId: string | null): Promise<boolean> => {
  if (!taskId) return true; // nothing to guard against
  const rows = await SyncEngineRepository.query<{ id: string }>(
    'SELECT id FROM tasks WHERE id = ? LIMIT 1',
    [taskId],
  );
  return rows.length > 0;
};

class TaskUploaderClass {
  async uploadTaskUpdate(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = operation.payload;
    const action = String(payload.action || '').toLowerCase();
    const localTaskId =
      typeof payload.localTaskId === 'string' ? payload.localTaskId : null;
    if (localTaskId && !(await taskRowExists(localTaskId))) {
      Logger.info(
        TAG,
        `Task row ${localTaskId} cleanup-deleted; dropping sync_queue item`,
      );
      return { outcome: 'SUCCESS' };
    }
    let response: LifecycleResponse = null;
    let succeeded = false;

    try {
      if (action === 'start') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.START(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'complete') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.COMPLETE(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'revoke') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.REVOKE(operation.entityId),
          payload,
          idempotencyHeaders(operation.operationId),
        );
      } else if (action === 'priority') {
        response = await ApiClient.put<LifecycleResponse>(
          ENDPOINTS.TASKS.PRIORITY(operation.entityId),
          { priority: payload.priority },
          idempotencyHeaders(operation.operationId),
        );
      }
      succeeded = isLifecycleSuccess(response);
    } catch (err) {
      if (isAlreadyDoneError(err) && action !== 'priority') {
        Logger.info(
          TAG,
          `Task ${action} 409 for ${operation.entityId}: server already in/past desired state, marking SYNCED`,
        );
        succeeded = true;
      } else {
        throw err;
      }
    }

    if (!succeeded) {
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
    if (localTaskId && !(await taskRowExists(localTaskId))) {
      Logger.info(
        TAG,
        `Task row ${localTaskId} cleanup-deleted; dropping sync_queue item`,
      );
      return { outcome: 'SUCCESS' };
    }
    const now = new Date().toISOString();
    let response: LifecycleResponse = null;
    let succeeded = false;

    try {
      if (status === 'IN_PROGRESS') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.START(operation.entityId),
          { action: 'start' },
          idempotencyHeaders(operation.operationId),
        );
        succeeded = isLifecycleSuccess(response);
      } else if (status === 'COMPLETED') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.COMPLETE(operation.entityId),
          { action: 'complete' },
          idempotencyHeaders(operation.operationId),
        );
        succeeded = isLifecycleSuccess(response);
      } else if (status === 'REVOKED') {
        response = await ApiClient.post<LifecycleResponse>(
          ENDPOINTS.TASKS.REVOKE(operation.entityId),
          {
            action: 'revoke',
            reason: payload.reason || payload.revokeReason || null,
          },
          idempotencyHeaders(operation.operationId),
        );
        succeeded = isLifecycleSuccess(response);
      } else {
        // Unknown status — nothing to push; treat as a no-op success.
        succeeded = true;
      }
    } catch (err) {
      if (isAlreadyDoneError(err)) {
        Logger.info(
          TAG,
          `Task status ${status} 409 for ${operation.entityId}: server already in/past desired state, marking SYNCED`,
        );
        succeeded = true;
      } else {
        throw err;
      }
    }

    if (!succeeded) {
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
