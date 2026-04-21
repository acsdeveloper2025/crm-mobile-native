import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

class LocationUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    try {
      const response = await ApiClient.post<{ success: boolean }>(
        ENDPOINTS.LOCATION.CAPTURE,
        operation.payload,
        idempotencyHeaders(operation.operationId),
      );
      if (!response.success) {
        return { outcome: 'FAILURE', error: 'Location upload failed' };
      }
      await SyncEngineRepository.execute(
        "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
        [new Date().toISOString(), operation.entityId],
      );
      return { outcome: 'SUCCESS' };
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: {
          status?: number;
          data?: {
            error?: { code?: string };
            message?: string;
            success?: boolean;
          };
        };
      };
      const status = axiosErr?.response?.status;

      // 409: Location already captured for this task — truly is "already
      // on the server", mark SYNCED and move on.
      if (status === 409) {
        await SyncEngineRepository.execute(
          "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), operation.entityId],
        );
        return { outcome: 'SUCCESS' };
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
            axiosErr?.response?.data?.message || 'validation failed'
          }`,
        };
      }
      throw error;
    }
  }
}

export const LocationUploader = new LocationUploaderClass();
