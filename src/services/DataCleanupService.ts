import { Logger } from '../utils/logger';
import RNFS from 'react-native-fs';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { DataCleanupRepository } from '../repositories/DataCleanupRepository';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';

const TAG = 'DataCleanupService';
const AUTO_CLEANUP_ENABLED_KEY = 'auto_cleanup_enabled';
const LAST_CLEANUP_DATE_KEY = 'last_cleanup_date';
const RETENTION_DAYS = 45;
const ATTACHMENT_CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

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
        } catch (taskErr: unknown) {
          result.errors.push(`Failed cleaning task ${taskId}: ${taskErr instanceof Error ? taskErr.message : String(taskErr)}`);
        }
      }

      if (result.errors.length > 0) result.success = false;
      await ProjectionUpdater.rebuildDashboard();

    } catch (err: unknown) {
      result.success = false;
      result.errors.push(err instanceof Error ? err.message : String(err));
      Logger.error(TAG, 'Manual cleanup failed', err);
    }

    return result;
  }

  /**
   * Clears ALL SQLite data cache (except key_value_store config)
   */
  static async clearCacheAndSync(): Promise<void> {
    try {
      await this.clearAttachmentCache();
      await DataCleanupRepository.clearCacheAndSyncTables();
      await ProjectionUpdater.rebuildAll();
    } catch (error: unknown) {
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
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
      const exists = await RNFS.exists(ATTACHMENT_CACHE_DIR);
      if (!exists) {
        return { deleted: 0, size: 0 };
      }

      const entries = await RNFS.readDir(ATTACHMENT_CACHE_DIR);
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const stats = await RNFS.stat(entry.path);
        const modifiedAt = stats.mtime ? new Date(stats.mtime).getTime() : 0;
        if (modifiedAt && modifiedAt > cutoff) {
          continue;
        }

        deletedFiles++;
        deletedSize += stats.size || 0;
        await RNFS.unlink(entry.path);
      }
    } catch (err) {
      Logger.error(TAG, 'Error clearing attachments cache', err);
    }
    
    return { deleted: deletedFiles, size: deletedSize };
  }
}
