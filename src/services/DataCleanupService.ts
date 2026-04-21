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

// H5 orphan-sweep follow-up (2026-04-21): paths mirror CameraService's
// constants. Duplicated rather than imported to avoid pulling Camera
// internals into the cleanup service.
const PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/photos`;
const THUMBNAILS_DIR = `${PHOTOS_DIR}/thumbnails`;
// A file must be at least this old before the sweep is willing to
// delete it as an orphan — protects live captures that have written
// their file to disk but not yet inserted the DB row.
const ORPHAN_FILE_MIN_AGE_MS = 60_000;

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
  static async manualCleanup(
    days: number = RETENTION_DAYS,
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      deletedCases: 0,
      deletedFiles: 0,
      deletedSize: 0,
      errors: [],
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();

      // Find old COMPLETED/REVOKED cases (don't delete ASSIGNED/IN_PROGRESS)
      const oldTaskIds = await DataCleanupRepository.listOldTerminalTaskIds(
        cutoffIso,
      );

      if (oldTaskIds.length === 0) {
        return result; // Nothing to delete
      }

      for (const taskId of oldTaskIds) {
        try {
          // H5 (audit 2026-04-21): delete DB rows FIRST (transactional
          // via deleteTaskGraph), then unlink the files. Previous
          // order was unlink-then-delete-DB, so a crash between the
          // two left DB rows pointing at already-deleted files —
          // unreadable, unrecoverable, and breaks any read that
          // tries to render the "missing" attachments. With the
          // reversed order, a crash leaves orphan files on disk
          // which are pure storage cost and can be swept by a
          // periodic cleanup later.
          const attachments =
            await DataCleanupRepository.listAttachmentsForTask(taskId);

          await DataCleanupRepository.deleteTaskGraph(taskId);
          result.deletedCases++;

          // DB is now authoritative. Unlink the files we cached above.
          // Failures here are logged via the outer catch but don't
          // undo the DB delete — that's the point of the new order.
          for (const att of attachments) {
            if (att.localPath && (await RNFS.exists(att.localPath))) {
              const stat = await RNFS.stat(att.localPath);
              result.deletedSize += stat.size;
              await RNFS.unlink(att.localPath);
              result.deletedFiles++;
            }
            if (att.thumbnailPath && (await RNFS.exists(att.thumbnailPath))) {
              await RNFS.unlink(att.thumbnailPath);
            }
          }
        } catch (taskErr: unknown) {
          result.errors.push(
            `Failed cleaning task ${taskId}: ${
              taskErr instanceof Error ? taskErr.message : String(taskErr)
            }`,
          );
        }
      }

      if (result.errors.length > 0) result.success = false;
      await ProjectionUpdater.rebuildDashboard();

      // H5 follow-up (2026-04-21): piggyback an orphan-file sweep on
      // the auto/manual cleanup run. H5 reversed the old order so the
      // DB is deleted before the files; a crash between the two leaves
      // orphan files on disk (safer than orphan DB rows, but still
      // takes storage). This sweep reclaims them on the next cleanup
      // tick without adding a separate cron/scheduler.
      try {
        const sweep = await this.sweepOrphanFiles();
        result.deletedFiles += sweep.deletedFiles;
        result.deletedSize += sweep.reclaimedBytes;
      } catch (sweepErr) {
        Logger.warn(TAG, 'Orphan-file sweep failed', sweepErr);
      }
    } catch (err: unknown) {
      result.success = false;
      result.errors.push(err instanceof Error ? err.message : String(err));
      Logger.error(TAG, 'Manual cleanup failed', err);
    }

    return result;
  }

  /**
   * Scan the photos / thumbnails directories for files not referenced
   * by any row in the `attachments` table and delete them.
   *
   * H5 follow-up (2026-04-21). Guards:
   *  - Files younger than ORPHAN_FILE_MIN_AGE_MS are skipped (a live
   *    capture may have written but not yet INSERTed the DB row).
   *  - Errors on individual unlinks are logged and do not abort the
   *    sweep — worst case we try again on the next tick.
   *  - `RNFS.unlink` with a path that no longer exists is harmless.
   */
  static async sweepOrphanFiles(): Promise<{
    deletedFiles: number;
    reclaimedBytes: number;
    scannedFiles: number;
  }> {
    let deletedFiles = 0;
    let reclaimedBytes = 0;
    let scannedFiles = 0;

    const photosExist = await RNFS.exists(PHOTOS_DIR);
    if (!photosExist) {
      return { deletedFiles, reclaimedBytes, scannedFiles };
    }

    // Build the referenced-paths set from every attachment row,
    // including thumbnail paths. A single set-hit is enough to keep
    // a file.
    const referenced = new Set<string>();
    const rows = await DataCleanupRepository.listAllAttachments();
    for (const row of rows) {
      if (row.localPath) referenced.add(row.localPath);
      if (row.thumbnailPath) referenced.add(row.thumbnailPath);
    }

    const now = Date.now();
    const scanDir = async (dir: string) => {
      const dirExists = await RNFS.exists(dir);
      if (!dirExists) return;
      const entries = await RNFS.readDir(dir);
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue; // skip thumbnails subdir, scanned separately
        }
        scannedFiles++;
        if (referenced.has(entry.path)) {
          continue;
        }
        const mtimeMs = entry.mtime ? new Date(entry.mtime).getTime() : 0;
        if (mtimeMs && now - mtimeMs < ORPHAN_FILE_MIN_AGE_MS) {
          // Too fresh — probably an in-flight capture.
          continue;
        }
        const size =
          typeof entry.size === 'number'
            ? entry.size
            : parseInt(String(entry.size || 0), 10) || 0;
        try {
          await RNFS.unlink(entry.path);
          deletedFiles++;
          reclaimedBytes += size;
        } catch (unlinkErr) {
          Logger.warn(
            TAG,
            `Orphan-file unlink failed: ${entry.path}`,
            unlinkErr,
          );
        }
      }
    };

    await scanDir(PHOTOS_DIR);
    await scanDir(THUMBNAILS_DIR);

    if (deletedFiles > 0) {
      Logger.info(
        TAG,
        `Orphan-file sweep: scanned ${scannedFiles}, reclaimed ${deletedFiles} files (${reclaimedBytes} bytes)`,
      );
    }
    return { deletedFiles, reclaimedBytes, scannedFiles };
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
  static async clearAttachmentCache(): Promise<{
    deleted: number;
    size: number;
  }> {
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
