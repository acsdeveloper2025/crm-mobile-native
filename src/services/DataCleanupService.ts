import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';
import RNFS from 'react-native-fs';

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
      const results = await DatabaseService.query<{ value: string }>('SELECT value FROM key_value_store WHERE key = ?', [key]);
      return results.length > 0 ? results[0].value : null;
    } catch {
      return null;
    }
  }

  static async setConfig(key: string, value: string): Promise<void> {
    await DatabaseService.execute('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', [key, value]);
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
      const oldTasks = await DatabaseService.query<{ id: string }>(
        `SELECT id FROM tasks 
         WHERE (updatedAt < ? OR completedAt < ?) 
         AND status IN ('COMPLETED', 'REVOKED')`,
        [cutoffIso, cutoffIso]
      );

      if (oldTasks.length === 0) {
        return result; // Nothing to delete
      }

      for (const task of oldTasks) {
        try {
          // 1. Get attachments for this task
          const attachments = await DatabaseService.query<{ local_path: string }>(
            `SELECT local_path FROM attachments WHERE task_id = ?`,
            [task.id]
          );

          // 2. Delete attachment files from device
          for (const att of attachments) {
            if (att.local_path && await RNFS.exists(att.local_path)) {
              const stat = await RNFS.stat(att.local_path);
              result.deletedSize += stat.size;
              await RNFS.unlink(att.local_path);
              result.deletedFiles++;
            }
          }

          // 3. Delete from DB map
          await DatabaseService.execute(`DELETE FROM attachments WHERE task_id = ?`, [task.id]);
          
          // 4. Delete auto-saves
          await DatabaseService.execute(`DELETE FROM key_value_store WHERE key LIKE ?`, [`auto_save_${task.id}%`]);

          // 5. Delete task
          await DatabaseService.execute(`DELETE FROM tasks WHERE id = ?`, [task.id]);
          
          result.deletedCases++;
        } catch (taskErr: any) {
          result.errors.push(`Failed cleaning task ${task.id}: ${taskErr.message}`);
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
      // Don't fully drop tables, just clear tasks and queues. Keep auth tokens.
      await DatabaseService.execute('DELETE FROM sync_queue WHERE entity_type = "TASK"');
      await DatabaseService.execute('DELETE FROM tasks');
      const attachments = await DatabaseService.query<{ local_path: string }>(`SELECT local_path FROM attachments`);
      for (const att of attachments) {
         if (att.local_path && await RNFS.exists(att.local_path)) {
            await RNFS.unlink(att.local_path);
         }
      }
      await DatabaseService.execute('DELETE FROM attachments');
      
      // Clear form templates cache
      await DatabaseService.execute('DELETE FROM form_templates');
      
      // Important: Leave auth tokens and Theme preferences alone
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
      const attachments = await DatabaseService.query<{ id: string, local_path: string }>(
        `SELECT id, local_path FROM attachments`
      );

      for (const att of attachments) {
        if (att.local_path && await RNFS.exists(att.local_path)) {
          const stat = await RNFS.stat(att.local_path);
          deletedSize += stat.size;
          await RNFS.unlink(att.local_path);
          deletedFiles++;
        }
        await DatabaseService.execute(`DELETE FROM attachments WHERE id = ?`, [att.id]);
      }
    } catch (err) {
      Logger.error(TAG, 'Error clearing attachments cache', err);
    }
    
    return { deleted: deletedFiles, size: deletedSize };
  }
}
