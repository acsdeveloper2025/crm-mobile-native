// StorageService - Local storage management and cleanup
// All key-value storage uses SQLite key_value_store table (no AsyncStorage)

import RNFS from 'react-native-fs';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { MaintenanceRepository } from '../repositories/MaintenanceRepository';
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
      // Free space
      const freeSpace = await RNFS.getFSInfo();
      const totalPhotoCount = await MaintenanceRepository.getAttachmentCount();
      const pendingSyncCount = await MaintenanceRepository.getPendingSyncCount();

      return {
        totalPhotosBytes: 0, // Calculated dynamically in CameraService instead
        totalPhotoCount,
        pendingSyncCount,
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
      const syncedPhotos = await MaintenanceRepository.listSyncedAttachmentsOlderThan(cutoff);

      for (const photo of syncedPhotos) {
        try {
          const exists = await RNFS.exists(photo.localPath);
          if (exists) {
            await RNFS.unlink(photo.localPath);
          }
          if (photo.thumbnailPath && await RNFS.exists(photo.thumbnailPath)) {
            await RNFS.unlink(photo.thumbnailPath);
          }
          await MaintenanceRepository.deleteAttachmentById(photo.id);
          deletedPhotos++;
        } catch (err) {
          Logger.warn(TAG, `Failed to delete photo ${photo.id}`, err);
        }
      }

      // Delete synced locations
      deletedLocations = await MaintenanceRepository.deleteSyncedLocationsOlderThan(cutoff);

      // Delete completed sync queue items
      deletedSyncItems = await MaintenanceRepository.deleteCompletedSyncItemsOlderThan(cutoff);

      // Delete synced audit logs
      await MaintenanceRepository.deleteSyncedAuditLogsOlderThan(cutoff);

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
    await KeyValueRepository.set(key, value);
  }

  /**
   * Get a stored value
   */
  async get(key: string): Promise<string | null> {
    return KeyValueRepository.get(key);
  }

  /**
   * Remove a stored value
   */
  async remove(key: string): Promise<void> {
    await KeyValueRepository.remove(key);
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
      const photosDir = `${RNFS.DocumentDirectoryPath}/photos`;
      const exists = await RNFS.exists(photosDir);
      if (exists) {
        await RNFS.unlink(photosDir);
        await RNFS.mkdir(photosDir);
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

      await MaintenanceRepository.clearAllTables(tables);

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
