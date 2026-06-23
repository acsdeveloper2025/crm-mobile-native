import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import { LocationService } from '../services/LocationService';
import { SyncQueue } from '../services/SyncQueue';
import { MobileTelemetryService } from '../telemetry/MobileTelemetryService';
import { Logger } from '../utils/logger';
import { SyncDownloadService } from './SyncDownloadService';
import { SyncHealthService, type SyncHealthMetrics } from './SyncHealthService';
import { SyncProcessor } from './SyncProcessor';
import { syncScheduler } from './SyncScheduler';
import { SyncStateService } from './SyncStateService';
import { SyncOperationStateService } from './SyncOperationStateService';
import { SyncWatchdogService } from './SyncWatchdogService';
import { runWithTimeout } from './runWithTimeout';

const TAG = 'SyncEngine';
/** Base watchdog timeout — extended dynamically based on queue size */
const WATCHDOG_BASE_TIMEOUT_MS = 2 * 60 * 1000; // 2 min base (allows for slow connection negotiation)
const WATCHDOG_PER_ITEM_MS = 15 * 1000; // +15s per queued item (reduced — items processed in batches)
const WATCHDOG_MAX_TIMEOUT_MS = 20 * 60 * 1000; // Cap at 20 min (1000+ users may have large queues)
const WATCHDOG_POLL_MS = 15 * 1000;

export interface SyncResult {
  success: boolean;
  uploadedStatusItems: number;
  uploadedItems: number;
  downloadedTasks: number;
  conflicts: number;
  errors: string[];
}

class SyncEngineClass {
  private syncInProgress = false;
  private activeSyncPromise: Promise<SyncResult> | null = null;

  startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void {
    SyncWatchdogService.recoverIfStalled(WATCHDOG_MAX_TIMEOUT_MS)
      .then(stalled => {
        if (!stalled) {
          return;
        }
        // A prior cycle stalled. On a warm start (background→foreground) the JS
        // context survived, so the in-memory lock may still be wedged `true`.
        // The old gate `stalled && !this.syncInProgress` refused recovery EXACTLY
        // when it was needed (the lock was stuck), which is why only a force-stop
        // recovered. Force-release the wedged lock, then resync.
        if (this.syncInProgress) {
          Logger.warn(TAG, 'Force-releasing a wedged sync lock from a stalled cycle');
          this.forceReleaseLock();
        }
        this.performSync().catch(error =>
          Logger.warn(TAG, 'Recovery sync failed', error),
        );
      })
      .catch(error =>
        Logger.warn(TAG, 'Watchdog recovery check failed', error),
      );
    syncScheduler.start(() => this.performSync(), intervalMs);
  }

  stopPeriodicSync(): void {
    syncScheduler.stop();
  }

  /** Build the "nothing ran" result for a skipped / hard-timed-out cycle. */
  private static skippedResult(reason: string): SyncResult {
    return {
      success: false,
      uploadedStatusItems: 0,
      uploadedItems: 0,
      downloadedTasks: 0,
      conflicts: 0,
      errors: [reason],
    };
  }

  /** Force-release the in-memory lock (warm-start recovery of a wedged cycle). */
  private forceReleaseLock(): void {
    this.syncInProgress = false;
    this.activeSyncPromise = null;
  }

  async validateVisitStart(
    taskId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const rows = await SyncEngineRepository.query<{
        latitude: number | null;
        longitude: number | null;
      }>('SELECT latitude, longitude FROM tasks WHERE id = ?', [taskId]);
      if (rows.length === 0) {
        return { allowed: false, reason: 'Task not found' };
      }

      const caseLat = rows[0].latitude;
      const caseLng = rows[0].longitude;
      if (!caseLat || !caseLng) {
        return { allowed: true };
      }

      const currentLocation = await LocationService.getCurrentLocation();
      if (!currentLocation) {
        return { allowed: false, reason: 'Unable to get current location' };
      }

      const distanceInMeters = LocationService.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        caseLat,
        caseLng,
      );
      if (distanceInMeters > 100) {
        return {
          allowed: false,
          reason: `You are ${distanceInMeters.toFixed(
            0,
          )} meters away. Must be within 100 meters to start.`,
        };
      }
      return { allowed: true };
    } catch (error) {
      Logger.error(TAG, 'Distance validation failed', error);
      return { allowed: false, reason: 'Failed to validate location geometry' };
    }
  }

  async performSync(): Promise<SyncResult> {
    // Single-flight, claimed SYNCHRONOUSLY before ANY await. The old code set the
    // lock only AFTER `await isBackendReachable()`, so the several triggers that all
    // fire at launch (AuthContext, the scheduler's network-restore, the background
    // daemon) raced through that gap and started TWO cycles on the one op-sqlite
    // connection — the contention that could wedge a cycle. A second caller now
    // dedupes here instead of starting a parallel cycle.
    if (this.syncInProgress) {
      if (this.activeSyncPromise) {
        Logger.info(TAG, 'Sync already in progress, waiting for completion...');
        return this.activeSyncPromise;
      }
      return SyncEngineClass.skippedResult('Sync already starting');
    }
    this.syncInProgress = true;

    try {
      const backendReachable = await SyncStateService.isBackendReachable();
      if (!backendReachable) {
        MobileTelemetryService.trackSyncError('backend_unreachable', {
          isSyncing: true,
        });
        return SyncEngineClass.skippedResult('Backend unreachable');
      }

      this.activeSyncPromise = this._doSync();
      // Hard outer bound: even if a `_doSync` await wedges and never reaches its own
      // `finally`, THIS method's `finally` releases the in-memory lock within
      // WATCHDOG_MAX_TIMEOUT_MS — so a stalled cycle self-heals instead of requiring
      // a force-stop (the previous failure mode). The lock release lives here, not in
      // `_doSync`, precisely so a wedged `_doSync` can't keep the lock held.
      const outcome = await runWithTimeout(
        this.activeSyncPromise,
        WATCHDOG_MAX_TIMEOUT_MS,
        () => SyncEngineClass.skippedResult('Sync cycle exceeded the hard timeout'),
      );
      if (outcome.timedOut) {
        Logger.error(TAG, 'Sync cycle exceeded the hard timeout — releasing lock');
        MobileTelemetryService.trackSyncError('cycle_hard_timeout', {
          timeoutMs: WATCHDOG_MAX_TIMEOUT_MS,
        });
      }
      return outcome.value;
    } finally {
      this.activeSyncPromise = null;
      this.syncInProgress = false;
    }
  }

  private async _doSync(): Promise<SyncResult> {
    const startedAt = Date.now();
    const initialQueueLength = await SyncQueue.getPendingCount();
    MobileTelemetryService.trackQueueBacklog(
      initialQueueLength,
      'sync_cycle_start',
    );
    // Dynamic timeout: base + 30s per item, capped at 10 min.
    // A single 10MB photo on 3G (1 Mbps) takes ~80s, so 2-min fixed timeout is too aggressive.
    const dynamicTimeoutMs = Math.min(
      WATCHDOG_BASE_TIMEOUT_MS + initialQueueLength * WATCHDOG_PER_ITEM_MS,
      WATCHDOG_MAX_TIMEOUT_MS,
    );
    const errors: string[] = [];
    let uploadedItems = 0;
    let downloadedTasks = 0;
    let conflicts = 0;
    let watchdogTriggered = false;
    let lastProgressAt = Date.now();

    const watchdog = setInterval(() => {
      SyncWatchdogService.heartbeat().catch(error => {
        Logger.warn(TAG, 'Watchdog heartbeat failed in interval', error);
      });
      if (Date.now() - lastProgressAt > dynamicTimeoutMs) {
        watchdogTriggered = true;
        Logger.error(TAG, 'Sync watchdog detected stalled sync cycle');
        MobileTelemetryService.trackSyncError('watchdog_stalled', {
          elapsedMs: Date.now() - lastProgressAt,
          timeoutMs: dynamicTimeoutMs,
        });
      }
    }, WATCHDOG_POLL_MS);

    try {
      await SyncWatchdogService.start();
      await SyncStateService.updateSyncInProgress(true);
      await SyncQueue.recoverExpiredLeases();
      lastProgressAt = Date.now();
      await SyncWatchdogService.heartbeat();

      const uploadResult = await SyncProcessor.processPending(120, {
        shouldAbort: () => watchdogTriggered,
        onProgress: () => {
          lastProgressAt = Date.now();
          SyncWatchdogService.heartbeat().catch(error => {
            Logger.warn(TAG, 'Watchdog heartbeat failed on progress', error);
          });
        },
      });
      uploadedItems = uploadResult.uploaded;
      errors.push(...uploadResult.errors);
      SyncHealthService.recordRetries(uploadResult.retriesSeen);
      SyncHealthService.recordFailedOperations(uploadResult.errors.length);

      if (watchdogTriggered) {
        errors.push('Sync watchdog interrupted processing');
      } else {
        const downloadResult = await SyncDownloadService.downloadServerChanges({
          shouldAbort: () => watchdogTriggered,
        });
        downloadedTasks = downloadResult.tasksDownloaded;
        conflicts = downloadResult.conflicts;
        errors.push(...downloadResult.errors);
        SyncHealthService.recordFailedOperations(downloadResult.errors.length);
        lastProgressAt = Date.now();

        const templateResult = await SyncDownloadService.downloadTemplates();
        errors.push(...templateResult.errors);
        await SyncWatchdogService.heartbeat();
      }

      await SyncQueue.cleanup(24);
      await SyncOperationStateService.clearExpired();

      const success = !watchdogTriggered && errors.length === 0;
      SyncHealthService.recordCycleResult(Date.now() - startedAt, success);
      const metrics = await SyncHealthService.getMetrics();
      MobileTelemetryService.trackSyncHealth(metrics, success);
      return {
        success,
        uploadedStatusItems: 0,
        uploadedItems,
        downloadedTasks,
        conflicts,
        errors,
      };
    } catch (error: unknown) {
      Logger.error(TAG, 'Sync failed', error);
      errors.push(
        error instanceof Error
          ? error.message
          : String(error) || 'Unknown sync error',
      );
      SyncHealthService.recordCycleResult(Date.now() - startedAt, false);
      MobileTelemetryService.trackSyncError('sync_cycle_failed', {
        message:
          error instanceof Error
            ? error.message
            : String(error) || 'Unknown sync error',
        uploadedItems,
        downloadedTasks,
        conflicts,
      });
      const metrics = await SyncHealthService.getMetrics();
      MobileTelemetryService.trackSyncHealth(metrics, false);
      return {
        success: false,
        uploadedStatusItems: 0,
        uploadedItems,
        downloadedTasks,
        conflicts,
        errors,
      };
    } finally {
      clearInterval(watchdog);
      try {
        await SyncStateService.updateSyncInProgress(false);
      } catch (syncStatusError) {
        Logger.warn(TAG, 'Failed to reset sync metadata', syncStatusError);
      }
      await SyncWatchdogService.stop();
      // NOTE: the in-memory `syncInProgress` lock is OWNED + released by
      // performSync's bounded `finally`, not here — so a wedged `_doSync` that
      // never reaches this block still has its lock released within the hard
      // timeout. A watchdog-interrupted cycle is resumed by the next scheduled
      // tick / network-restore trigger (no self-restart re-entrancy, which used
      // to manipulate `syncInProgress` from two places).
    }
  }

  isSyncing(): boolean {
    return this.syncInProgress;
  }

  async getSyncStatus(): Promise<{
    pendingItems: number;
    lastSyncAt: string | null;
    isSyncing: boolean;
  }> {
    return SyncStateService.getStatus(this.syncInProgress);
  }

  async getSyncHealth(): Promise<SyncHealthMetrics> {
    return SyncHealthService.getMetrics();
  }
}

export const SyncEngine = new SyncEngineClass();
export default SyncEngine;
