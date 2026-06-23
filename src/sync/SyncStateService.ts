import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import { AuthService } from '../services/AuthService';
import { NetworkService } from '../services/NetworkService';
import { SyncQueue } from '../services/SyncQueue';
import { Logger } from '../utils/logger';

const TAG = 'SyncStateService';

class SyncStateServiceClass {
  async isBackendReachable(): Promise<boolean> {
    try {
      if (!NetworkService.getIsOnline()) {
        return false;
      }
      const response = await ApiClient.get<{ status: string }>(
        ENDPOINTS.HEALTH,
        {
          timeout: 3000,
        },
      );
      return response.status === 'OK' || response.status === 'ok';
    } catch {
      Logger.warn(TAG, 'Backend is unreachable despite network connectivity');
      return false;
    }
  }

  async updateSyncInProgress(inProgress: boolean): Promise<void> {
    const deviceInfo = await AuthService.getDeviceInfo();
    const now = new Date().toISOString();
    // UPSERT (not INSERT OR REPLACE): only this writer's columns are touched on
    // conflict, so the download watermark (last_download_sync_at, written by
    // SyncDownloadService) is preserved. INSERT OR REPLACE rewrote the whole
    // singleton row and nulled last_download_sync_at — and this runs at the
    // START of every sync, so the download phase then read an empty watermark
    // and re-pulled the backend's 30-day default every cycle.
    await SyncEngineRepository.execute(
      `INSERT INTO sync_metadata (id, device_id, sync_in_progress, last_upload_sync_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         device_id = excluded.device_id,
         sync_in_progress = excluded.sync_in_progress,
         last_upload_sync_at = excluded.last_upload_sync_at`,
      [deviceInfo.deviceId, inProgress ? 1 : 0, now],
    );
  }

  async getStatus(isSyncing: boolean): Promise<{
    pendingItems: number;
    lastSyncAt: string | null;
    isSyncing: boolean;
  }> {
    const pendingItems = await SyncQueue.getPendingCount();
    const syncMeta = await SyncEngineRepository.query<{
      lastDownloadSyncAt: string | null;
    }>('SELECT last_download_sync_at FROM sync_metadata WHERE id = 1');
    return {
      pendingItems,
      lastSyncAt: syncMeta[0]?.lastDownloadSyncAt || null,
      isSyncing,
    };
  }
}

export const SyncStateService = new SyncStateServiceClass();
