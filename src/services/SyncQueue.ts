// SyncQueue - Manages offline operations queue
// All data-modifying operations go through this queue for reliable sync

import { v4 as uuidv4 } from 'uuid';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import { syncRetryPolicy } from '../sync/SyncRetryPolicy';
import { inferOperationType, priorityForOperationType } from '../sync/SyncOperationLog';
import { Logger } from '../utils/logger';
import type { SyncQueueItem } from '../types/mobile';

const TAG = 'SyncQueue';
const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

export type EntityType =
  | 'TASK'
  | 'TASK_STATUS'
  | 'ATTACHMENT'
  | 'VISIT_PHOTO'
  | 'LOCATION'
  | 'FORM_SUBMISSION';
export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE';

// Legacy priority levels remain supported for backward compatibility.
export const SYNC_PRIORITY = {
  CRITICAL: 1, // Task status transitions and blocking prerequisites
  HIGH: 3, // Form submissions and attachments
  NORMAL: 5, // Task updates
  LOW: 7, // Location trail, audit logs
} as const;

class SyncQueueClass {
  private getLeaseExpiry(timeoutMs: number): string {
    return new Date(Date.now() + timeoutMs).toISOString();
  }

  async recoverExpiredLeases(): Promise<number> {
    const now = new Date().toISOString();
    const result = await SyncQueueRepository.recoverExpiredLeases(now);

    if (result > 0) {
      Logger.warn(TAG, `Recovered ${result} expired queue lease(s)`);
    }

    return result;
  }

  /**
   * Enqueue a new operation for sync
   */
  async enqueue(
    actionType: ActionType,
    entityType: EntityType,
    entityId: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.NORMAL,
  ): Promise<string> {
    if (entityType === 'TASK_STATUS') {
      // Keep only the latest pending status mutation per task to avoid stale regressions.
      await SyncQueueRepository.deletePendingStatusItems(entityId);
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const operationType = inferOperationType(actionType, entityType, payload);
    const operationPriority = priorityForOperationType(operationType);
    const payloadWithOperation = {
      ...payload,
      _operation: {
        operation_id: id,
        type: operationType,
        entity_type: entityType,
        entity_id: entityId,
        created_at: now,
        retry_count: 0,
        priority: operationPriority,
      },
    };

    await SyncQueueRepository.insert(
      id,
      actionType,
      entityType,
      entityId,
      JSON.stringify(payloadWithOperation),
      priority,
      now,
    );

    Logger.debug(TAG, `Enqueued: ${actionType} ${entityType} ${entityId} (priority: ${priority})`);
    return id;
  }

  /**
   * Get the next batch of pending items, ordered by priority then creation time
   */
  async getPendingItems(limit: number = 50): Promise<SyncQueueItem[]> {
    await this.recoverExpiredLeases();

    return SyncQueueRepository.listProcessible(new Date().toISOString(), limit);
  }

  /**
   * Mark an item as in-progress
   */
  async markInProgress(
    id: string,
    leaseTimeoutMs: number = DEFAULT_LEASE_TIMEOUT_MS,
  ): Promise<void> {
    const now = new Date().toISOString();
    await SyncQueueRepository.markInProgress(id, now, this.getLeaseExpiry(leaseTimeoutMs));
  }

  /**
   * Mark an item as completed (successfully synced)
   */
  async markCompleted(id: string): Promise<void> {
    await SyncQueueRepository.markCompleted(id, new Date().toISOString());
  }

  /**
   * Return an item to pending without penalizing retry count.
   * Used when sequencing rules defer an upload rather than failing it.
   */
  async markPending(id: string, reason?: string): Promise<void> {
    await SyncQueueRepository.markPending(id, reason || null);
  }

  /**
   * Mark an item as failed with error details
   * Sets a retry delay with exponential backoff
   */
  async markFailed(id: string, error: string): Promise<void> {
    // Get current attempts for backoff calculation
    const attempts = await SyncQueueRepository.getAttempts(id) || 1;
    const { nextRetryAt } = syncRetryPolicy.getRetryWindow(attempts);

    await SyncQueueRepository.markFailed(id, error, nextRetryAt);

    Logger.warn(TAG, `Item ${id} failed (attempt ${attempts}): ${error}`);
  }

  /**
   * Get count of pending items
   */
  async getPendingCount(): Promise<number> {
    return SyncQueueRepository.getPendingCount();
  }

  /**
   * Get count of items by entity type and status
   */
  async getCountByType(entityType: EntityType): Promise<{
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  }> {
    const rows = await SyncQueueRepository.getCountByType(entityType);
    const counts = { pending: 0, inProgress: 0, completed: 0, failed: 0 };
    for (const [status, count] of Object.entries(rows)) {
      switch (status) {
        case 'PENDING': counts.pending = count; break;
        case 'IN_PROGRESS': counts.inProgress = count; break;
        case 'COMPLETED': counts.completed = count; break;
        case 'FAILED': counts.failed = count; break;
      }
    }

    return counts;
  }

  /**
   * Remove completed items older than the specified hours
   */
  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(
      Date.now() - olderThanHours * 60 * 60 * 1000,
    ).toISOString();

    const result = await SyncQueueRepository.cleanupCompletedOlderThan(cutoff);

    if (result > 0) {
      Logger.info(TAG, `Cleaned up ${result} completed sync items`);
    }

    return result;
  }

  /**
   * Check if there's a pending item for a specific entity
   */
  async hasPendingItem(entityType: EntityType, entityId: string): Promise<boolean> {
    const rows = await SyncEngineRepository.query<{ c: number }>(
      `SELECT 1 as c FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND (status = 'PENDING' OR status = 'IN_PROGRESS') LIMIT 1`,
      [entityType, entityId],
    );
    return rows.length > 0;
  }
}

// Singleton
export const SyncQueue = new SyncQueueClass();
export default SyncQueue;
