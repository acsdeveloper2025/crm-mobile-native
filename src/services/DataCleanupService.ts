import { Logger } from '../utils/logger';
import RNFS from 'react-native-fs';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { DataCleanupRepository } from '../repositories/DataCleanupRepository';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { DatabaseService } from '../database/DatabaseService';

const TAG = 'DataCleanupService';
const AUTO_CLEANUP_ENABLED_KEY = 'auto_cleanup_enabled';
const LAST_CLEANUP_DATE_KEY = 'last_cleanup_date';
const LAST_FILE_CLEANUP_DATE_KEY = 'last_file_cleanup_date';
const RETENTION_DAYS = 45;
// 2026-05-01 retention v2 tier-1: per-user request, photo/attachment
// FILES (not DB rows) are reclaimed at 15 days. Backend is the
// authoritative store; UI re-fetches from server when an old
// attachment is opened. Applies to all attachment kinds — captured
// photos, selfies, backend-pushed attachments. Mobile-only — never
// touches backend DB or /uploads folder.
const FILE_RETENTION_DAYS = 15;
const ATTACHMENT_CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

// 2026-05-01 retention v2 tier-2 anti-flap: record cleaned task IDs in
// KV with a 30-day TTL window. SyncDownloadService consults this list
// before re-hydrating a task that backend still has assigned. Without
// this guard, backend would re-push a freshly-cleaned task on the next
// sync cycle, defeating the cleanup.
const CLEANED_TASK_IDS_KEY = 'cleaned_task_ids_v1';
const CLEANED_TASK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
   * Initialize auto-cleanup on app start. Runs both tiers once per day:
   *   - tier 1 at 15d: blank attachment local files (DB rows kept)
   *   - tier 2 at 45d: hard-delete tasks (hybrid 2C predicate)
   */
  static async initializeAutoCleanup(): Promise<void> {
    try {
      const isEnabled = await this.getConfig(AUTO_CLEANUP_ENABLED_KEY);
      if (isEnabled !== 'true') {
        return;
      }
      const today = new Date().toISOString().split('T')[0];

      // Tier 1: 15d file cleanup
      const lastFileCleanup = await this.getConfig(LAST_FILE_CLEANUP_DATE_KEY);
      if (lastFileCleanup !== today) {
        Logger.info(TAG, 'Running scheduled tier-1 file cleanup');
        await this.cleanupOldAttachmentFiles();
        await this.setConfig(LAST_FILE_CLEANUP_DATE_KEY, today);
      }

      // Tier 2: 45d task cleanup
      const lastCleanup = await this.getConfig(LAST_CLEANUP_DATE_KEY);
      if (lastCleanup !== today) {
        Logger.info(TAG, 'Running scheduled tier-2 task cleanup');
        await this.manualCleanup();
        await this.setConfig(LAST_CLEANUP_DATE_KEY, today);
      }
    } catch (e) {
      Logger.error(TAG, 'Failed to run auto-cleanup', e);
    }
  }

  /**
   * 2026-05-01 retention v2 tier-1: at 15 days, reclaim disk space by
   * unlinking the local FILE for attachments where the backend has the
   * authoritative copy (sync_status = 'SYNCED' AND
   * backend_attachment_id IS NOT NULL). The DB row stays so the UI can
   * route reads to backend on demand. NEVER touches backend DB or
   * /uploads folder — mobile-local filesystem only.
   */
  static async cleanupOldAttachmentFiles(
    days: number = FILE_RETENTION_DAYS,
  ): Promise<{
    blankedRows: number;
    deletedFiles: number;
    reclaimedBytes: number;
    errors: string[];
  }> {
    const out = {
      blankedRows: 0,
      deletedFiles: 0,
      reclaimedBytes: 0,
      errors: [] as string[],
    };
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();
      const candidates =
        await DataCleanupRepository.listOldDispensableAttachments(cutoffIso);
      if (candidates.length === 0) {
        return out;
      }
      const blankedIds: string[] = [];
      for (const att of candidates) {
        try {
          if (att.localPath && (await RNFS.exists(att.localPath))) {
            const stat = await RNFS.stat(att.localPath);
            await RNFS.unlink(att.localPath);
            out.deletedFiles++;
            out.reclaimedBytes += stat.size;
          }
          if (att.thumbnailPath && (await RNFS.exists(att.thumbnailPath))) {
            await RNFS.unlink(att.thumbnailPath);
            out.deletedFiles++;
          }
          blankedIds.push(att.id);
        } catch (err) {
          out.errors.push(
            `Failed unlinking attachment ${att.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      if (blankedIds.length > 0) {
        // Blank path columns in a single UPDATE so reads route to
        // backend instead of trying a missing local file.
        await DataCleanupRepository.clearAttachmentLocalPaths(blankedIds);
        out.blankedRows = blankedIds.length;
      }
      Logger.info(
        TAG,
        `tier-1 file cleanup: blanked ${out.blankedRows} rows, reclaimed ${out.deletedFiles} files (${out.reclaimedBytes} bytes)`,
      );
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
      Logger.error(TAG, 'tier-1 file cleanup failed', err);
    }
    return out;
  }

  /**
   * 2026-05-01 retention v2 tier-2 anti-flap: record cleaned task IDs
   * with their cleaned-at timestamp in KV. SyncDownloadService consults
   * this list to skip re-pulling a task within the 30-day window.
   * Stored as JSON: { [taskId]: cleanedAtMs }.
   */
  private static async recordCleanedTaskIds(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    try {
      const existing = await this.loadCleanedTaskIdMap();
      const now = Date.now();
      for (const id of taskIds) {
        existing[id] = now;
      }
      await KeyValueRepository.set(
        CLEANED_TASK_IDS_KEY,
        JSON.stringify(existing),
      );
    } catch (err) {
      Logger.warn(TAG, 'Failed to record cleaned task ids', err);
    }
  }

  private static async loadCleanedTaskIdMap(): Promise<Record<string, number>> {
    const raw = await KeyValueRepository.get(CLEANED_TASK_IDS_KEY);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      // Prune entries past TTL on every read; keeps the JSON blob small.
      const now = Date.now();
      const fresh: Record<string, number> = {};
      for (const [id, ts] of Object.entries(parsed)) {
        if (typeof ts === 'number' && now - ts < CLEANED_TASK_TTL_MS) {
          fresh[id] = ts;
        }
      }
      return fresh;
    } catch {
      return {};
    }
  }

  /**
   * Public read used by SyncDownloadService to skip re-hydration of
   * tasks that local cleanup recently purged.
   */
  static async listRecentlyCleanedTaskIds(): Promise<string[]> {
    const map = await this.loadCleanedTaskIdMap();
    return Object.keys(map);
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

      // 2026-05-01 retention v2 tier-2 (option 2C hybrid): list ALL
      // tasks past 45d across all 4 tab states (assigned/in-progress/
      // saved/completed/revoked), but ONLY when no pending sync work
      // remains. Tasks with PENDING/FAILED forms or attachments stay
      // visible so the agent can resolve. Backend keeps the
      // authoritative copy regardless — local cleanup is filesystem-
      // only and never touches backend DB or /uploads folder.
      const oldTaskIds = await DataCleanupRepository.listOldTaskIdsHybrid(
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

      // 2026-05-01 retention v2 anti-flap: record the IDs we just
      // cleaned so SyncDownloadService skips re-pulling them within the
      // 30-day TTL window. Without this, backend (which still has the
      // task) would re-push it on next sync and re-flap the cleanup.
      await this.recordCleanedTaskIds(oldTaskIds);

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

      // F-MD5 (audit 2026-04-28): reclaim SQLite free pages after the
      // bulk delete. Idle path — keeps the DB file from drifting up
      // over 45 days of churn. Failures are non-fatal.
      try {
        await DatabaseService.runIncrementalVacuum();
      } catch (vacuumErr) {
        Logger.warn(TAG, 'Incremental vacuum failed', vacuumErr);
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
