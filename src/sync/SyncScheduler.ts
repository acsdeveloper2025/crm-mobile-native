import { NetworkService } from '../services/NetworkService';
import { Logger } from '../utils/logger';

const TAG = 'SyncScheduler';

type SyncRunner = () => Promise<unknown>;

class SyncScheduler {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private networkChangeUnsubscribe: (() => void) | null = null;

  start(runSync: SyncRunner, intervalMs: number): void {
    this.stop();

    this.networkChangeUnsubscribe = NetworkService.onNetworkChange(isOnline => {
      if (isOnline) {
        Logger.info(TAG, 'Network restored - triggering sync');
        runSync().catch(error => {
          Logger.warn(TAG, 'Failed to run sync on network restore', error);
        });
      }
    });

    this.syncTimer = setInterval(() => {
      if (NetworkService.getIsOnline()) {
        runSync().catch(error => {
          Logger.warn(TAG, 'Periodic sync tick failed', error);
        });
      }
    }, intervalMs);

    Logger.info(TAG, `Periodic sync started (interval: ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.networkChangeUnsubscribe) {
      try {
        this.networkChangeUnsubscribe();
      } catch (error) {
        Logger.warn(TAG, 'Failed to unsubscribe from network changes', error);
      }
      this.networkChangeUnsubscribe = null;
    }
  }
}

export const syncScheduler = new SyncScheduler();
