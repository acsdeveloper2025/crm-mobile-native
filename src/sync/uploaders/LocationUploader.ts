import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'LocationUploader';

class LocationUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    // 2026-05-01 retention v2: pre-upload existence guard. If the
    // local locations row was cascade-deleted by tier-2 task cleanup
    // between enqueue and dequeue, drop the queue item cleanly
    // instead of generating false-success or DLQ noise.
    const exists = await SyncEngineRepository.query<{ id: string }>(
      'SELECT id FROM locations WHERE id = ? LIMIT 1',
      [operation.entityId],
    );
    if (exists.length === 0) {
      Logger.info(
        TAG,
        `Location row ${operation.entityId} cleanup-deleted; dropping sync_queue item`,
      );
      return { outcome: 'SUCCESS' };
    }
    try {
      // ADR-0054 Phase 5: /location/capture returns a BARE v2 body
      // `{ id, timestamp, accuracy }` (no `success` flag). A truthy object
      // with an `id` is the success signal; a 2xx that somehow lacks it is
      // treated as a failure (retryable).
      const response = await ApiClient.post<{ id?: string } | null>(
        ENDPOINTS.LOCATION.CAPTURE,
        operation.payload,
        idempotencyHeaders(operation.operationId),
      );
      if (!response || typeof response !== 'object' || !response.id) {
        return { outcome: 'FAILURE', error: 'Location upload failed' };
      }
      await SyncEngineRepository.execute(
        "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
        [new Date().toISOString(), operation.entityId],
      );
      return { outcome: 'SUCCESS' };
    } catch (error: unknown) {
      // ADR-0054 Phase 5: the raw v2 error body is `{ error: "<CODE>", details?,
      // issues? }` — `data.error` is a CODE STRING, not a nested `{ code }`.
      const axiosErr = error as {
        response?: {
          status?: number;
          data?: {
            error?: string;
            details?: unknown;
            issues?: unknown;
          };
        };
      };
      const status = axiosErr?.response?.status;
      const errorCode = axiosErr?.response?.data?.error;

      // 409: Location already captured for this task — truly is "already
      // on the server", mark SYNCED and move on.
      if (status === 409) {
        await SyncEngineRepository.execute(
          "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), operation.entityId],
        );
        return { outcome: 'SUCCESS' };
      }

      // Field-exec tracking P3: a TRACKING point that slips past the client
      // shift-window gate (clock skew / window edge) is rejected by the server
      // with 403 OUTSIDE_SHIFT_WINDOW. It will never be accepted (the window
      // is evaluated server-side at NOW()), so drop it like a 400 rather than
      // retrying forever and flooding the DLQ.
      if (status === 403 && errorCode === 'OUTSIDE_SHIFT_WINDOW') {
        await SyncEngineRepository.execute(
          "UPDATE locations SET sync_status = 'REJECTED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), operation.entityId],
        );
        return {
          outcome: 'SUCCESS',
          error: 'Location rejected by server (403): outside shift window',
        };
      }

      // D6 (audit 2026-04-21 round 2): previously 400 was silently
      // marked SYNCED too, which was a lie — the server rejected the
      // payload so it was never stored. Anything downstream relying
      // on the server having this row would break. Mark it REJECTED
      // locally (non-retryable — the data will never be accepted);
      // the telemetry line carries the reason for ops. Return SUCCESS
      // so the queue item is removed (no point retrying invalid data).
      if (status === 400) {
        await SyncEngineRepository.execute(
          "UPDATE locations SET sync_status = 'REJECTED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), operation.entityId],
        );
        return {
          outcome: 'SUCCESS',
          error: `Location rejected by server (400): ${
            errorCode || 'validation failed'
          }`,
        };
      }
      throw error;
    }
  }
}

export const LocationUploader = new LocationUploaderClass();
