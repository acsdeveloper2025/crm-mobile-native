import { AppState, AppStateStatus, NativeModules, Platform } from 'react-native';
import { NetworkService } from '../services/NetworkService';
import { MobileTelemetryService } from '../telemetry/MobileTelemetryService';
import { Logger } from '../utils/logger';
import SyncEngine from './SyncEngine';

const TAG = 'BackgroundSyncDaemon';
const DEFAULT_BACKGROUND_INTERVAL_MS = 5 * 60 * 1000;

type BackgroundSyncBridge = {
  scheduleBackgroundSync?: (intervalMs: number) => Promise<void> | void;
  cancelBackgroundSync?: () => Promise<void> | void;
  canRunBackgroundSync?: () => Promise<boolean> | boolean;
};

class BackgroundSyncDaemonClass {
  private appState: AppStateStatus = 'active';
  private timer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private running = false;

  private getBridge(): BackgroundSyncBridge | null {
    const bridge = NativeModules.BackgroundSyncBridge as BackgroundSyncBridge | undefined;
    return bridge || null;
  }

  private async tick(): Promise<void> {
    const startedAt = Date.now();
    try {
      if (this.appState !== 'background') {
        MobileTelemetryService.trackBackgroundSyncStat('background_tick_skipped', { reason: 'app_not_background' }, 'debug');
        return;
      }
      if (!NetworkService.getIsOnline()) {
        MobileTelemetryService.trackBackgroundSyncStat('background_tick_skipped', { reason: 'offline' }, 'debug');
        return;
      }
      const bridge = this.getBridge();
      if (bridge?.canRunBackgroundSync) {
        const canRun = await bridge.canRunBackgroundSync();
        if (!canRun) {
          MobileTelemetryService.trackBackgroundSyncStat('background_tick_skipped', { reason: 'battery_or_power_policy' }, 'info');
          return;
        }
      }
      const status = await SyncEngine.getSyncStatus();
      MobileTelemetryService.trackQueueBacklog(status.pendingItems, 'background_tick');
      if (status.pendingItems <= 0 || SyncEngine.isSyncing()) {
        MobileTelemetryService.trackBackgroundSyncStat('background_tick_skipped', { reason: 'no_pending_or_syncing', pendingItems: status.pendingItems }, 'debug');
        return;
      }
      const result = await SyncEngine.performSync();
      MobileTelemetryService.trackBackgroundSyncStat('background_sync_completed', {
        success: result.success,
        durationMs: Date.now() - startedAt,
        uploadedItems: result.uploadedItems,
        downloadedTasks: result.downloadedTasks,
        errors: result.errors.length,
      }, result.success ? 'info' : 'warning');
    } catch (error) {
      Logger.warn(TAG, 'Background sync tick failed', error);
      MobileTelemetryService.trackBackgroundSyncStat('background_sync_failed', {
        message: error instanceof Error ? error.message : String(error),
      }, 'error');
    }
  }

  async start(intervalMs: number = DEFAULT_BACKGROUND_INTERVAL_MS): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      this.appState = nextState;
      if (nextState === 'background') {
        this.tick().catch(error => {
          Logger.warn(TAG, 'Background tick launch failed', error);
        });
      }
    });

    this.timer = setInterval(() => {
      this.tick().catch(error => {
        Logger.warn(TAG, 'Scheduled background tick launch failed', error);
      });
    }, intervalMs);

    const bridge = this.getBridge();
    if (bridge?.scheduleBackgroundSync) {
      try {
        await bridge.scheduleBackgroundSync(intervalMs);
      } catch (error) {
        Logger.warn(TAG, 'Native background sync scheduling failed', error);
      }
    }

    Logger.info(TAG, `Background sync daemon started (interval=${intervalMs}ms, platform=${Platform.OS})`);
    MobileTelemetryService.trackBackgroundSyncStat('background_daemon_started', {
      intervalMs,
      platform: Platform.OS,
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    const bridge = this.getBridge();
    if (bridge?.cancelBackgroundSync) {
      try {
        await bridge.cancelBackgroundSync();
      } catch (error) {
        Logger.warn(TAG, 'Native background sync cancellation failed', error);
      }
    }
    MobileTelemetryService.trackBackgroundSyncStat('background_daemon_stopped', {});
  }

  async runHeadlessTask(): Promise<void> {
    try {
      if (!NetworkService.getIsOnline()) {
        return;
      }
      await SyncEngine.performSync();
    } catch (error) {
      Logger.warn(TAG, 'Headless background sync failed', error);
    }
  }
}

export const BackgroundSyncDaemon = new BackgroundSyncDaemonClass();
