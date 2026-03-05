// SyncQueue - Manages offline operations queue
// All data-modifying operations go through this queue for reliable sync

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';
import type { SyncQueueItem } from '../types/mobile';

const TAG = 'SyncQueue';

export type EntityType =
  | 'TASK'
  | 'TASK_STATUS'
  | 'ATTACHMENT'
  | 'VISIT_PHOTO'
  | 'LOCATION'
  | 'FORM_SUBMISSION';
export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE';

// Priority levels: lower number = higher priority
export const SYNC_PRIORITY = {
  CRITICAL: 1, // Task status transitions and blocking prerequisites
  HIGH: 3, // Form submissions and attachments
  NORMAL: 5, // Task updates
  LOW: 7, // Location trail, audit logs
} as const;

class SyncQueueClass {
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
      await DatabaseService.execute(
        `DELETE FROM sync_queue
         WHERE entity_type = 'TASK_STATUS'
           AND entity_id = ?
           AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS')`,
        [entityId],
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await DatabaseService.execute(
      `INSERT INTO sync_queue
        (id, action_type, entity_type, entity_id, payload_json, status, priority, created_at, attempts, max_attempts)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, 0, 3)`,
      [id, actionType, entityType, entityId, JSON.stringify(payload), priority, now],
    );

    Logger.debug(TAG, `Enqueued: ${actionType} ${entityType} ${entityId} (priority: ${priority})`);
    return id;
  }

  /**
   * Get the next batch of pending items, ordered by priority then creation time
   */
  async getPendingItems(limit: number = 50): Promise<SyncQueueItem[]> {
    const rows = await DatabaseService.query<any>(
      `SELECT * FROM sync_queue
       WHERE status = 'PENDING' OR (status = 'FAILED' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= ?))
       ORDER BY priority ASC, created_at ASC
       LIMIT ?`,
      [new Date().toISOString(), limit],
    );

    return rows.map(row => ({
      id: row.id,
      actionType: row.action_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payloadJson: row.payload_json,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      nextRetryAt: row.next_retry_at,
    }));
  }

  /**
   * Mark an item as in-progress
   */
  async markInProgress(id: string): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue SET status = 'IN_PROGRESS', attempts = attempts + 1 WHERE id = ?`,
      [id],
    );
  }

  /**
   * Mark an item as completed (successfully synced)
   */
  async markCompleted(id: string): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue SET status = 'COMPLETED', processed_at = ? WHERE id = ?`,
      [new Date().toISOString(), id],
    );
  }

  /**
   * Return an item to pending without penalizing retry count.
   * Used when sequencing rules defer an upload rather than failing it.
   */
  async markPending(id: string, reason?: string): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'PENDING',
           attempts = CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END,
           last_error = ?,
           next_retry_at = NULL
       WHERE id = ?`,
      [reason || null, id],
    );
  }

  /**
   * Mark an item as failed with error details
   * Sets a retry delay with exponential backoff
   */
  async markFailed(id: string, error: string): Promise<void> {
    // Get current attempts for backoff calculation
    const rows = await DatabaseService.query<{ attempts: number }>(
      'SELECT attempts FROM sync_queue WHERE id = ?',
      [id],
    );
    const attempts = rows[0]?.attempts ?? 1;

    // Exponential backoff: 5s, 25s, 125s
    const backoffMs = Math.pow(5, attempts) * 1000;
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'FAILED', last_error = ?, next_retry_at = ?
       WHERE id = ?`,
      [error, nextRetryAt, id],
    );

    Logger.warn(TAG, `Item ${id} failed (attempt ${attempts}): ${error}`);
  }

  /**
   * Get count of pending items
   */
  async getPendingCount(): Promise<number> {
    return await DatabaseService.count(
      'sync_queue',
      "status IN ('PENDING', 'FAILED')",
    );
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
    const rows = await DatabaseService.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM sync_queue
       WHERE entity_type = ?
       GROUP BY status`,
      [entityType],
    );

    const counts = { pending: 0, inProgress: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      switch (row.status) {
        case 'PENDING': counts.pending = row.count; break;
        case 'IN_PROGRESS': counts.inProgress = row.count; break;
        case 'COMPLETED': counts.completed = row.count; break;
        case 'FAILED': counts.failed = row.count; break;
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

    const result = await DatabaseService.execute(
      `DELETE FROM sync_queue WHERE status = 'COMPLETED' AND processed_at < ?`,
      [cutoff],
    );

    if (result.rowsAffected > 0) {
      Logger.info(TAG, `Cleaned up ${result.rowsAffected} completed sync items`);
    }

    return result.rowsAffected;
  }

  /**
   * Check if there's a pending item for a specific entity
   */
  async hasPendingItem(entityType: EntityType, entityId: string): Promise<boolean> {
    const count = await DatabaseService.count(
      'sync_queue',
      "entity_type = ? AND entity_id = ? AND status IN ('PENDING', 'IN_PROGRESS')",
      [entityType, entityId],
    );
    return count > 0;
  }
}

// Singleton
export const SyncQueue = new SyncQueueClass();
export default SyncQueue;
