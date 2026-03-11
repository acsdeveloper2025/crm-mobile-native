import { DatabaseService } from '../database/DatabaseService';

class SyncMetadataRepositoryClass {
  async getLastDownloadSyncAt(): Promise<string | null> {
    const rows = await DatabaseService.query<{ lastDownloadSyncAt: string | null }>(
      'SELECT last_download_sync_at FROM sync_metadata WHERE id = 1',
    );
    return rows[0]?.lastDownloadSyncAt || null;
  }

  async updateSyncStatus(deviceId: string, inProgress: boolean): Promise<void> {
    await DatabaseService.execute(
      `INSERT OR REPLACE INTO sync_metadata (id, device_id, sync_in_progress, last_upload_sync_at)
       VALUES (1, ?, ?, ?)`,
      [deviceId, inProgress ? 1 : 0, new Date().toISOString()],
    );
  }

  async saveLastDownloadSyncAt(timestamp: string): Promise<void> {
    await DatabaseService.execute(
      `INSERT OR REPLACE INTO sync_metadata (id, last_download_sync_at, device_id, sync_in_progress)
       VALUES (1, ?, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1), 0)`,
      [timestamp],
    );
  }
}

export const SyncMetadataRepository = new SyncMetadataRepositoryClass();
