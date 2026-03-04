// StorageService - Local storage management and cleanup
// All key-value storage uses SQLite key_value_store table (no AsyncStorage)

import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';

const TAG = 'StorageService';

export interface StorageStats {
  totalPhotosBytes: number;
  totalPhotoCount: number;
  pendingSyncCount: number;
  dbSizeBytes: number;
  freeSpaceBytes: number;
}

class StorageServiceClass {
  /**
   * Get storage usage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      // Photo storage
      const photoResult = await DatabaseService.query<{
        total_size: number;
        total_count: number;
      }>(
        'SELECT COUNT(*) as total_count FROM attachments',
      );

      // Pending sync
      const pendingResult = await DatabaseService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('PENDING', 'FAILED')",
      );

      // Free space
      const freeSpace = await RNFS.getFSInfo();

      return {
        totalPhotosBytes: 0, // Calculated dynamically in CameraService instead
        totalPhotoCount: photoResult[0]?.total_count ?? 0,
        pendingSyncCount: pendingResult[0]?.count ?? 0,
        dbSizeBytes: 0, // SQLite doesn't easily expose this
        freeSpaceBytes: freeSpace.freeSpace,
      };
    } catch (error) {
      Logger.error(TAG, 'Failed to get storage stats', error);
      return {
        totalPhotosBytes: 0,
        totalPhotoCount: 0,
        pendingSyncCount: 0,
        dbSizeBytes: 0,
        freeSpaceBytes: 0,
      };
    }
  }

  /**
   * Check if device has enough free space for operations
   */
  async hasEnoughSpace(requiredMB: number = 100): Promise<boolean> {
    try {
      const fsInfo = await RNFS.getFSInfo();
      const freeMB = fsInfo.freeSpace / (1024 * 1024);
      return freeMB >= requiredMB;
    } catch {
      return true; // Assume OK if we can't check
    }
  }

  /**
   * Clean up synced data older than specified days
   * Only removes data that has been successfully synced to server
   */
  async cleanupSyncedData(daysOld: number = 7): Promise<{
    deletedPhotos: number;
    deletedLocations: number;
    deletedSyncItems: number;
  }> {
    const cutoff = new Date(
      Date.now() - daysOld * 24 * 60 * 60 * 1000,
    ).toISOString();

    let deletedPhotos = 0;
    let deletedLocations = 0;
    let deletedSyncItems = 0;

    try {
      // Delete synced photo files
      const syncedPhotos = await DatabaseService.query<{
        id: string;
        file_path: string;
      }>(
        "SELECT id, file_path FROM attachments WHERE sync_status = 'SYNCED' AND uploaded_at < ?",
        [cutoff],
      );

      for (const photo of syncedPhotos) {
        try {
          const exists = await RNFS.exists(photo.file_path);
          if (exists) {
            await RNFS.unlink(photo.file_path);
          }
          await DatabaseService.execute('DELETE FROM attachments WHERE id = ?', [
            photo.id,
          ]);
          deletedPhotos++;
        } catch (err) {
          Logger.warn(TAG, `Failed to delete photo ${photo.id}`, err);
        }
      }

      // Delete synced locations
      const locResult = await DatabaseService.execute(
        "DELETE FROM locations WHERE sync_status = 'SYNCED' AND timestamp < ?",
        [cutoff],
      );
      deletedLocations = locResult.rowsAffected;

      // Delete completed sync queue items
      const syncResult = await DatabaseService.execute(
        "DELETE FROM sync_queue WHERE status = 'COMPLETED' AND processed_at < ?",
        [cutoff],
      );
      deletedSyncItems = syncResult.rowsAffected;

      // Delete synced audit logs
      await DatabaseService.execute(
        'DELETE FROM audit_log WHERE synced = 1 AND timestamp < ?',
        [cutoff],
      );

      Logger.info(
        TAG,
        `Cleanup: ${deletedPhotos} photos, ${deletedLocations} locations, ${deletedSyncItems} sync items`,
      );
    } catch (error) {
      Logger.error(TAG, 'Cleanup failed', error);
    }

    return { deletedPhotos, deletedLocations, deletedSyncItems };
  }

  // ---- Key-Value API (backed by SQLite key_value_store table) ----

  /**
   * Store a key-value pair
   */
  async set(key: string, value: string): Promise<void> {
    await DatabaseService.execute(
      'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  /**
   * Get a stored value
   */
  async get(key: string): Promise<string | null> {
    const rows = await DatabaseService.query<{ value: string }>(
      'SELECT value FROM key_value_store WHERE key = ?',
      [key],
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  /**
   * Remove a stored value
   */
  async remove(key: string): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM key_value_store WHERE key = ?',
      [key],
    );
  }

  /**
   * Store a JSON object
   */
  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }

  /**
   * Get and parse a JSON object
   */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Clear all app data (for logout/reset)
   * WARNING: This deletes all local data including unsynced items
   */
  async clearAllData(): Promise<void> {
    try {
      // Delete photo files
      const visitsDir = `${RNFS.DocumentDirectoryPath}/visits`;
      const exists = await RNFS.exists(visitsDir);
      if (exists) {
        await RNFS.unlink(visitsDir);
        await RNFS.mkdir(visitsDir);
      }

      // Clear database tables (order matters for foreign keys)
      const tables = [
        'sync_queue',
        'audit_log',
        'form_submissions',
        'attachments',
        'locations',
        'tasks',
        'sync_metadata',
        'user_session',
        'key_value_store',
      ];

      for (const table of tables) {
        await DatabaseService.execute(`DELETE FROM ${table}`);
      }

      Logger.info(TAG, 'All local data cleared');
    } catch (error) {
      Logger.error(TAG, 'Failed to clear all data', error);
      throw error;
    }
  }
}

// Singleton
export const StorageService = new StorageServiceClass();
export default StorageService;
