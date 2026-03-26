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
      if (error?.response?.status === 409 && error?.response?.data?.error?.code === 'LOCATION_ALREADY_CAPTURED_FOR_TASK') {
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
