import { Logger } from '../utils/logger';
import RNFS from 'react-native-fs';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { DataCleanupRepository } from '../repositories/DataCleanupRepository';

const TAG = 'DataCleanupService';
const AUTO_CLEANUP_ENABLED_KEY = 'auto_cleanup_enabled';
const LAST_CLEANUP_DATE_KEY = 'last_cleanup_date';
const RETENTION_DAYS = 45;

export interface CleanupResult {
  success: boolean;
  deletedCases: number;
  deletedFiles: number;
  deletedSize: number;
  errors: string[];
}

export class DataCleanupService {
  
  static async getConfig(key: string): Promise<string | null> {
    try {
      return await KeyValueRepository.get(key);
    } catch {
      return null;
    }
  }

  static async setConfig(key: string, value: string): Promise<void> {
    await KeyValueRepository.set(key, value);
  }

  /**
   * Initialize auto-cleanup on app start
   */
  static async initializeAutoCleanup(): Promise<void> {
    try {
      const isEnabled = await this.getConfig(AUTO_CLEANUP_ENABLED_KEY);
      if (isEnabled === 'true') {
        const lastCleanup = await this.getConfig(LAST_CLEANUP_DATE_KEY);
        const today = new Date().toISOString().split('T')[0];
        
        // Run once per day
        if (lastCleanup !== today) {
          Logger.info(TAG, 'Running scheduled auto-cleanup');
          await this.manualCleanup();
          await this.setConfig(LAST_CLEANUP_DATE_KEY, today);
        }
      }
    } catch (e) {
      Logger.error(TAG, 'Failed to run auto-cleanup', e);
    }
  }

  static async setAutoCleanupEnabled(enabled: boolean): Promise<void> {
    await this.setConfig(AUTO_CLEANUP_ENABLED_KEY, enabled.toString());
  }

  static async isAutoCleanupEnabled(): Promise<boolean> {
    const isEnabled = await this.getConfig(AUTO_CLEANUP_ENABLED_KEY);
    return isEnabled === 'true'; // false by default
  }

  /**
   * Manually delete cases and their attachments older than 45 days
   */
  static async manualCleanup(days: number = RETENTION_DAYS): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      deletedCases: 0,
      deletedFiles: 0,
      deletedSize: 0,
      errors: []
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();

      // Find old COMPLETED/REVOKED cases (don't delete ASSIGNED/IN_PROGRESS)
      const oldTaskIds = await DataCleanupRepository.listOldTerminalTaskIds(cutoffIso);

      if (oldTaskIds.length === 0) {
        return result; // Nothing to delete
      }

      for (const taskId of oldTaskIds) {
        try {
          const attachments = await DataCleanupRepository.listAttachmentsForTask(taskId);
          for (const att of attachments) {
            if (att.localPath && await RNFS.exists(att.localPath)) {
              const stat = await RNFS.stat(att.localPath);
              result.deletedSize += stat.size;
              await RNFS.unlink(att.localPath);
              result.deletedFiles++;
            }
            if (att.thumbnailPath && await RNFS.exists(att.thumbnailPath)) {
              await RNFS.unlink(att.thumbnailPath);
            }
          }

          await DataCleanupRepository.deleteTaskGraph(taskId);
          
          result.deletedCases++;
        } catch (taskErr: any) {
          result.errors.push(`Failed cleaning task ${taskId}: ${taskErr.message}`);
        }
      }

      if (result.errors.length > 0) result.success = false;

    } catch (err: any) {
      result.success = false;
      result.errors.push(err.message);
      Logger.error(TAG, 'Manual cleanup failed', err);
    }

    return result;
  }

  /**
   * Clears ALL SQLite data cache (except key_value_store config)
   */
  static async clearCacheAndSync(): Promise<void> {
    try {
      const attachments = await DataCleanupRepository.listAllAttachments();
      for (const att of attachments) {
         if (att.localPath && await RNFS.exists(att.localPath)) {
            await RNFS.unlink(att.localPath);
         }
         if (att.thumbnailPath && await RNFS.exists(att.thumbnailPath)) {
            await RNFS.unlink(att.thumbnailPath);
         }
      }
      await DataCleanupRepository.clearCacheAndSyncTables();
    } catch (error: any) {
      Logger.error(TAG, 'Error clearing cache', error);
      throw error;
    }
  }

  /**
   * Clears only attachment files and DB map
   */
  static async clearAttachmentCache(): Promise<{ deleted: number, size: number }> {
    let deletedFiles = 0;
    let deletedSize = 0;
    try {
      const attachments = await DataCleanupRepository.listAllAttachments();

      for (const att of attachments) {
        if (att.localPath && await RNFS.exists(att.localPath)) {
          const stat = await RNFS.stat(att.localPath);
          deletedSize += stat.size;
          await RNFS.unlink(att.localPath);
          deletedFiles++;
        }
        if (att.thumbnailPath && await RNFS.exists(att.thumbnailPath)) {
          await RNFS.unlink(att.thumbnailPath);
        }
        await DataCleanupRepository.deleteAttachmentById(att.id);
      }
    } catch (err) {
      Logger.error(TAG, 'Error clearing attachments cache', err);
    }
    
    return { deleted: deletedFiles, size: deletedSize };
  }
}
