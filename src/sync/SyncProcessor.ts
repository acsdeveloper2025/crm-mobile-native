import { SyncQueue } from '../services/SyncQueue';
import { MobileTelemetryService } from '../telemetry/MobileTelemetryService';
import { Logger } from '../utils/logger';
import { toSyncOperation } from './SyncOperationLog';
import { SyncOperationStateService } from './SyncOperationStateService';
import { SyncUploadService } from './SyncUploadService';

const TAG = 'SyncProcessor';

export interface SyncProcessorOptions {
  shouldAbort?: () => boolean;
  onProgress?: () => void;
}

export interface SyncProcessorResult {
  uploaded: number;
  errors: string[];
  retriesSeen: number;
}

class SyncProcessorClass {
  private readonly taskLocks = new Set<string>();

  private acquireTaskLock(taskKey: string): boolean {
    if (this.taskLocks.has(taskKey)) {
      return false;
    }
    this.taskLocks.add(taskKey);
    return true;
  }

  private releaseTaskLock(taskKey: string): void {
    this.taskLocks.delete(taskKey);
  }

  async processPending(limit: number, options: SyncProcessorOptions = {}): Promise<SyncProcessorResult> {
    const errors: string[] = [];
    let uploaded = 0;
    let retriesSeen = 0;

    const pendingItems = await SyncQueue.getPendingItems(limit);
    for (const item of pendingItems) {
      if (options.shouldAbort?.()) {
        errors.push('Sync watchdog interrupted processing due to stalled progress');
        break;
      }

      const operation = toSyncOperation(item);
      retriesSeen += operation.retryCount;

      if (await SyncOperationStateService.isProcessed(operation.operationId)) {
        await SyncQueue.markCompleted(item.id);
        options.onProgress?.();
        continue;
      }

      if (!this.acquireTaskLock(operation.taskKey)) {
        Logger.info(TAG, `Skipping locked task operation ${operation.operationId} for ${operation.taskKey}`);
        continue;
      }

      try {
        await SyncQueue.markInProgress(item.id);
        const result = await SyncUploadService.processOperation(operation);
        if (result.outcome === 'SUCCESS') {
          await SyncQueue.markCompleted(item.id);
          await SyncOperationStateService.markProcessed(operation.operationId);
          uploaded++;
          options.onProgress?.();
          continue;
        }

        if (result.outcome === 'DEFER') {
          await SyncQueue.markPending(item.id, result.error || 'Deferred by ordering policy');
          options.onProgress?.();
          continue;
        }

        await SyncQueue.markFailed(item.id, result.error || 'Operation failed');
        MobileTelemetryService.trackUploadFailure(
          operation.type,
          operation.entityType,
          operation.entityId,
          result.error || 'Operation failed',
        );
        errors.push(`${operation.type}/${operation.entityId}: ${result.error || 'Operation failed'}`);
        options.onProgress?.();
      } catch (error: unknown) {
        // Classify errors: network errors are retryable, others may not be
        const errorMsg = error instanceof Error ? error.message : String(error) || 'Operation crashed';
        const errorCode = (error as { code?: string })?.code;
        const isNetworkError =
          errorCode === 'ECONNABORTED' ||
          errorCode === 'ERR_NETWORK' ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('Network Error') ||
          errorMsg.includes('ECONNREFUSED');

        const failReason = isNetworkError
          ? `[RETRYABLE] ${errorMsg}`
          : `[NON-RETRYABLE] ${errorMsg}`;

        await SyncQueue.markFailed(item.id, failReason);
        MobileTelemetryService.trackUploadFailure(
          operation.type,
          operation.entityType,
          operation.entityId,
          failReason,
        );

        if (!isNetworkError) {
          Logger.error(TAG, `Non-retryable sync failure for ${operation.operationId}: ${errorMsg}`);
        }

        errors.push(`${operation.type}/${operation.entityId}: ${failReason}`);
        options.onProgress?.();
      } finally {
        this.releaseTaskLock(operation.taskKey);
      }
    }

    return { uploaded, errors, retriesSeen };
  }
}

export const SyncProcessor = new SyncProcessorClass();
