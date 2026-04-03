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
      const axiosErr = error as { response?: { status?: number; data?: { error?: { code?: string }; message?: string; success?: boolean } } };
      const status = axiosErr?.response?.status;

      // 409: Location already captured for this task — treat as success
      // 400: Poor accuracy or other validation — mark synced to unblock form upload
      // 500: Server error on duplicate/conflict — mark synced to prevent blocking
      if (status === 409 || status === 400) {
        await SyncEngineRepository.execute(
          "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), operation.entityId],
        );
        return { outcome: 'SUCCESS' };
      }
      throw error;
    }
  }
}

export const LocationUploader = new LocationUploaderClass();
