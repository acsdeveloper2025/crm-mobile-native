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

  startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void {
    SyncWatchdogService.recoverIfStalled(WATCHDOG_MAX_TIMEOUT_MS)
      .then(stalled => {
        if (stalled && !this.syncInProgress) {
          this.performSync().catch(error => Logger.warn(TAG, 'Recovery sync failed', error));
        }
      })
      .catch(error => Logger.warn(TAG, 'Watchdog recovery check failed', error));
    syncScheduler.start(() => this.performSync(), intervalMs);
  }

  stopPeriodicSync(): void {
    syncScheduler.stop();
  }

  async validateVisitStart(taskId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const rows = await SyncEngineRepository.query<{ latitude: number | null; longitude: number | null }>(
        'SELECT latitude, longitude FROM tasks WHERE id = ?',
        [taskId],
      );
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
          reason: `You are ${distanceInMeters.toFixed(0)} meters away. Must be within 100 meters to start.`,
        };
      }
      return { allowed: true };
    } catch (error) {
      Logger.error(TAG, 'Distance validation failed', error);
      return { allowed: false, reason: 'Failed to validate location geometry' };
    }
  }

  async performSync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        uploadedStatusItems: 0,
        uploadedItems: 0,
        downloadedTasks: 0,
        conflicts: 0,
        errors: ['Sync in progress'],
      };
    }

    const backendReachable = await SyncStateService.isBackendReachable();
    if (!backendReachable) {
      MobileTelemetryService.trackSyncError('backend_unreachable', { isSyncing: this.syncInProgress });
      return {
        success: false,
        uploadedStatusItems: 0,
        uploadedItems: 0,
        downloadedTasks: 0,
        conflicts: 0,
        errors: ['Backend unreachable'],
      };
    }

    this.syncInProgress = true;
    const startedAt = Date.now();
    const initialQueueLength = await SyncQueue.getPendingCount();
    MobileTelemetryService.trackQueueBacklog(initialQueueLength, 'sync_cycle_start');
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
        const downloadResult = await SyncDownloadService.downloadServerChanges();
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
      errors.push(error instanceof Error ? error.message : String(error) || 'Unknown sync error');
      SyncHealthService.recordCycleResult(Date.now() - startedAt, false);
      MobileTelemetryService.trackSyncError('sync_cycle_failed', {
        message: error instanceof Error ? error.message : String(error) || 'Unknown sync error',
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
      // Set syncInProgress = false AFTER scheduling the watchdog restart to
      // prevent a race where another sync starts between the flag reset and
      // the setTimeout callback.
      const needsRestart = watchdogTriggered;
      this.syncInProgress = false;

      if (needsRestart) {
        setTimeout(() => {
          // Double-check flag — another sync may have started in the meantime
          if (!this.syncInProgress) {
            this.syncInProgress = true; // Claim the lock before async work
            this.performSync()
              .catch(error => Logger.warn(TAG, 'Watchdog restart sync failed', error))
              .finally(() => { /* syncInProgress is reset inside performSync's finally */ });
          }
        }, 1000);
      }
    }
  }

  isSyncing(): boolean {
    return this.syncInProgress;
  }

  async getSyncStatus(): Promise<{ pendingItems: number; lastSyncAt: string | null; isSyncing: boolean }> {
    return SyncStateService.getStatus(this.syncInProgress);
  }

  async getSyncHealth(): Promise<SyncHealthMetrics> {
    return SyncHealthService.getMetrics();
  }
}

export const SyncEngine = new SyncEngineClass();
export default SyncEngine;
