import { NetworkService } from '../services/NetworkService';
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

  async processPending(
    limit: number,
    options: SyncProcessorOptions = {},
  ): Promise<SyncProcessorResult> {
    const errors: string[] = [];
    let uploaded = 0;
    let retriesSeen = 0;

    // M26: short-circuit when offline. Without this guard the
    // processor would load pending items and fire axios calls
    // against each one while the radio was off, each waiting for
    // the 30s default timeout. At 50 queued items that burns
    // ~25 minutes of battery for zero progress, and on some
    // devices keeps the modem powered the whole time. The real
    // trigger for sync-on-reconnect lives in NetworkService's
    // change listener; this is just the "don't run when the
    // answer is obviously no" bailout.
    if (!NetworkService.getIsOnline()) {
      Logger.info(TAG, 'processPending skipped — network offline');
      return { uploaded, errors, retriesSeen };
    }

    const pendingItems = await SyncQueue.getPendingItems(limit);

    // Phase D4: group pending items by taskKey so the per-task lock is
    // acquired once per group and held for the entire processing
    // window. Previously the lock was released between every item,
    // which meant the microsecond gap between release and re-acquire
    // was enough for an interleaving async operation (a new enqueue
    // triggered from push notifications, a retry kickoff) to slip in
    // with a stale view of task state. Grouping preserves the
    // invariant that no two operations on the same task are in-flight
    // simultaneously across the entire processing pass.
    const groupedByTask = new Map<string, typeof pendingItems>();
    for (const item of pendingItems) {
      const key = toSyncOperation(item).taskKey;
      const existing = groupedByTask.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groupedByTask.set(key, [item]);
      }
    }

    for (const [taskKey, itemsForTask] of groupedByTask) {
      if (options.shouldAbort?.()) {
        errors.push(
          'Sync watchdog interrupted processing due to stalled progress',
        );
        break;
      }

      // Acquire the lock once per task group. Any concurrent
      // processPending() call that sees the same task locked will skip
      // it entirely rather than squeezing in between individual items.
      if (!this.acquireTaskLock(taskKey)) {
        Logger.info(
          TAG,
          `Skipping ${itemsForTask.length} operation(s) for locked task ${taskKey}`,
        );
        continue;
      }

      try {
        for (const item of itemsForTask) {
          if (options.shouldAbort?.()) {
            errors.push(
              'Sync watchdog interrupted processing due to stalled progress',
            );
            break;
          }

          const operation = toSyncOperation(item);
          retriesSeen += operation.retryCount;

          if (
            await SyncOperationStateService.isProcessed(operation.operationId)
          ) {
            await SyncQueue.markCompleted(item.id);
            options.onProgress?.();
            continue;
          }

          try {
            // M23: markInProgress now returns false if another
            // processor already claimed this row (CAS lost). When
            // that happens, silently skip — the winning processor
            // will drive the upload and we'd double-submit if we
            // proceeded.
            const leased = await SyncQueue.markInProgress(item.id);
            if (!leased) {
              Logger.debug(
                TAG,
                `Skipped ${item.id} — lease already held by another processor`,
              );
              continue;
            }
            const result = await SyncUploadService.processOperation(operation);
            if (result.outcome === 'SUCCESS') {
              await SyncQueue.markCompleted(item.id);
              await SyncOperationStateService.markProcessed(
                operation.operationId,
              );
              uploaded++;
              options.onProgress?.();
              continue;
            }

            if (result.outcome === 'DEFER') {
              await SyncQueue.markPending(
                item.id,
                result.error || 'Deferred by ordering policy',
              );
              options.onProgress?.();
              continue;
            }

            await SyncQueue.markFailed(
              item.id,
              result.error || 'Operation failed',
            );
            MobileTelemetryService.trackUploadFailure(
              operation.type,
              operation.entityType,
              operation.entityId,
              result.error || 'Operation failed',
            );
            errors.push(
              `${operation.type}/${operation.entityId}: ${
                result.error || 'Operation failed'
              }`,
            );
            options.onProgress?.();
          } catch (error: unknown) {
            // Classify errors: network errors are retryable, others may not be
            const errorMsg =
              error instanceof Error
                ? error.message
                : String(error) || 'Operation crashed';
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

            // Network errors retry with backoff; non-network failures (auth,
            // body validation, permanent server rejection) park immediately
            // in DLQ. Without DLQ-on-non-retryable the retry loop hammers
            // the same hopeless request 10× and toasts the user each cycle.
            if (isNetworkError) {
              await SyncQueue.markFailed(item.id, failReason);
            } else {
              await SyncQueue.markDeadLetter(item.id, failReason);
            }

            MobileTelemetryService.trackUploadFailure(
              operation.type,
              operation.entityType,
              operation.entityId,
              failReason,
            );

            errors.push(
              `${operation.type}/${operation.entityId}: ${failReason}`,
            );
            options.onProgress?.();
          }
        }
      } finally {
        this.releaseTaskLock(taskKey);
      }
    }

    return { uploaded, errors, retriesSeen };
  }
}

export const SyncProcessor = new SyncProcessorClass();
