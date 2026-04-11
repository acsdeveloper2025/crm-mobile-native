import { SyncQueue } from '../services/SyncQueue';
import { MobileTelemetryService } from '../telemetry/MobileTelemetryService';

export interface SyncHealthMetrics {
  queueLength: number;
  retryCount: number;
  lastSuccessfulSyncAt: string | null;
  averageSyncDurationMs: number;
  failedOperations: number;
}

class SyncHealthServiceClass {
  private retryCount = 0;
  private failedOperations = 0;
  private lastSuccessfulSyncAt: string | null = null;
  private durations: number[] = [];
  private readonly maxSamples = 20;

  recordRetries(count: number): void {
    if (count > 0) {
      this.retryCount += count;
    }
  }

  recordCycleResult(durationMs: number, success: boolean): void {
    this.durations.push(durationMs);
    if (this.durations.length > this.maxSamples) {
      this.durations.shift();
    }
    if (success) {
      this.lastSuccessfulSyncAt = new Date().toISOString();
    }
  }

  recordFailedOperations(count: number): void {
    if (count > 0) {
      this.failedOperations += count;
      MobileTelemetryService.trackSyncError('failed_operations_accumulated', {
        increment: count,
        total: this.failedOperations,
      });
    }
  }

  async getMetrics(): Promise<SyncHealthMetrics> {
    const queueLength = await SyncQueue.getPendingCount();
    const averageSyncDurationMs = this.durations.length
      ? Math.round(
          this.durations.reduce((sum, value) => sum + value, 0) /
            this.durations.length,
        )
      : 0;

    return {
      queueLength,
      retryCount: this.retryCount,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      averageSyncDurationMs,
      failedOperations: this.failedOperations,
    };
  }
}

export const SyncHealthService = new SyncHealthServiceClass();
