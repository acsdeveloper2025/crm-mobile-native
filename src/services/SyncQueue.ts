// SyncQueue - Manages offline operations queue
// All data-modifying operations go through this queue for reliable sync

import { v4 as uuidv4 } from 'uuid';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import { syncRetryPolicy } from '../sync/SyncRetryPolicy';
import {
  inferOperationType,
  priorityForOperationType,
} from '../sync/SyncOperationLog';
import { StorageService } from './StorageService';
import { AuthService } from './AuthService';
import { Logger } from '../utils/logger';
import { MobileTelemetryService } from '../telemetry/MobileTelemetryService';
import type { SyncQueueItem } from '../types/mobile';

const TAG = 'SyncQueue';
// Base lease timeout — extended dynamically for large files
const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;
// Per-MB of payload, add extra time to lease for large attachments
const LEASE_PER_MB_MS = 30 * 1000;
// Maximum lease timeout cap
const MAX_LEASE_TIMEOUT_MS = 15 * 60 * 1000;

export type EntityType =
  | 'TASK'
  | 'TASK_STATUS'
  | 'ATTACHMENT'
  | 'VISIT_PHOTO'
  | 'LOCATION'
  | 'FORM_SUBMISSION'
  | 'NOTIFICATION_ACTION';
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

  /**
   * C6 (audit 2026-04-20, 2026-04-21 decision): per-user queue
   * isolation. Every write to sync_queue is stamped with the current
   * user's id; reads filter by it. Rows created by user A remain in
   * the queue after A logs out and are invisible to user B on a
   * shared device — they get processed when A logs back in.
   *
   * Returns null if no user is currently logged in (the sync
   * processor shouldn't be running in that state; defensive).
   */
  private currentUserId(): string | null {
    return AuthService.getCurrentUser()?.id ?? null;
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
   * Reconcile orphaned attachments: any attachment row with sync_status='PENDING'
   * that has no corresponding active sync_queue entry. This closes the crash
   * window in CameraService.saveCapturedPhoto where the DB insert (inside a
   * transaction) and the enqueue call (outside) can be interrupted, leaving
   * a PENDING attachment that would otherwise never upload.
   *
   * H1 (audit 2026-04-21): only reconcile attachments whose task belongs to
   * the currently logged-in user. Without this filter, if user A's PENDING
   * attachments survive logout and user B signs in before SyncDownloadService
   * drops A's tasks, this method would re-enqueue A's orphans stamped with
   * B's userId (enqueue() reads AuthService.getCurrentUser()) — they'd then
   * upload under B's JWT and be attributed to B on the server. The JOIN to
   * `tasks` is INNER here (no orphans without a task) and filters by
   * `assigned_to_field_user = current_user_id` so cross-user contamination
   * is impossible. Attachments whose task has been dropped from the local
   * tasks table are skipped — SyncDownloadService's revoke/delete path (C10)
   * has already moved them to `sync_status='ABANDONED'` anyway.
   */
  async reconcileOrphanAttachments(): Promise<number> {
    const userId = this.currentUserId();
    if (!userId) {
      // No logged-in user → nothing to reconcile for. Defensive: the sync
      // pipeline shouldn't be running in that state, but returning 0 here
      // avoids any chance of grabbing orphaned-legacy rows under no user.
      return 0;
    }

    const rows = await SyncEngineRepository.query<{
      id: string;
      taskId: string;
      backendTaskId: string | null;
      filename: string;
      localPath: string;
      mimeType: string;
      size: number;
      componentType: string;
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      locationTimestamp: string | null;
      verificationTypeCode: string | null;
    }>(
      `SELECT a.id, a.task_id, t.verification_task_id AS backend_task_id,
              a.filename, a.local_path, a.mime_type, a.size, a.component_type,
              a.latitude, a.longitude, a.accuracy, a.location_timestamp,
              t.verification_type_code
       FROM attachments a
       INNER JOIN tasks t ON t.id = a.task_id
       WHERE a.sync_status = 'PENDING'
         AND t.assigned_to_field_user = ?
         AND NOT EXISTS (
           SELECT 1 FROM sync_queue q
           WHERE q.entity_type = 'ATTACHMENT'
             AND q.entity_id = a.id
             AND q.status IN ('PENDING', 'IN_PROGRESS', 'FAILED')
         )`,
      [userId],
    );

    if (rows.length === 0) {
      return 0;
    }

    for (const row of rows) {
      const payload: Record<string, unknown> = {
        id: row.id,
        taskId: row.backendTaskId || row.taskId,
        localTaskId: row.taskId,
        filename: row.filename,
        localPath: row.localPath,
        mimeType: row.mimeType,
        size: row.size,
        componentType: row.componentType,
        photoType: row.componentType === 'selfie' ? 'selfie' : 'verification',
        ...(row.verificationTypeCode
          ? { verificationType: row.verificationTypeCode }
          : {}),
        geoLocation:
          row.latitude !== null && row.longitude !== null
            ? {
                latitude: row.latitude,
                longitude: row.longitude,
                accuracy: row.accuracy ?? 0,
                timestamp: row.locationTimestamp,
              }
            : null,
      };
      await this.enqueue(
        'CREATE',
        'ATTACHMENT',
        row.id,
        payload,
        SYNC_PRIORITY.HIGH,
      );
    }

    Logger.warn(
      TAG,
      `Reconciled ${rows.length} orphan PENDING attachment(s) — re-enqueued for sync`,
    );

    return rows.length;
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
    // Enforce storage quota — reject enqueue if device storage is critically low.
    // This prevents silent write failures that would lose data.
    const hasSpace = await StorageService.hasEnoughSpace(50); // 50MB minimum
    if (!hasSpace) {
      // Run emergency cleanup of synced data to free space
      Logger.warn(
        TAG,
        'Low storage detected — running emergency cleanup before enqueue',
      );
      await StorageService.cleanupSyncedData(1); // Clean data synced 1+ day ago

      // Re-check after cleanup
      const hasSpaceAfterCleanup = await StorageService.hasEnoughSpace(10); // 10MB absolute minimum
      if (!hasSpaceAfterCleanup) {
        const errorMsg =
          'Device storage critically low — cannot queue operation. Please free storage and try again.';
        Logger.error(TAG, errorMsg);
        throw new Error(errorMsg);
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const operationType = inferOperationType(actionType, entityType, payload);
    const operationPriority = priorityForOperationType(operationType);
    const payloadWithOperation = {
      ...payload,
      _operation: {
        operationId: id,
        type: operationType,
        entityType: entityType,
        entityId: entityId,
        createdAt: now,
        retryCount: 0,
        priority: operationPriority,
      },
    };
    const payloadJson = JSON.stringify(payloadWithOperation);

    if (entityType === 'TASK_STATUS') {
      // M22: delete-pending-then-insert must be atomic. Previously
      // those were two separate awaits, so a concurrent second
      // enqueue (user double-taps "Start Visit", a queued sync
      // trigger races with a user tap, etc.) could pass the delete
      // before the first insert committed and produce duplicate
      // PENDING rows keyed on the same task. Single-transaction path
      // keyed by entityId preserves the "at most one PENDING status
      // mutation per task" invariant.
      await SyncQueueRepository.replaceLatestStatusItem(
        entityId,
        id,
        actionType,
        payloadJson,
        priority,
        now,
        this.currentUserId(),
      );
    } else {
      await SyncQueueRepository.insert(
        id,
        actionType,
        entityType,
        entityId,
        payloadJson,
        priority,
        now,
        this.currentUserId(),
      );
    }

    Logger.debug(
      TAG,
      `Enqueued: ${actionType} ${entityType} ${entityId} (priority: ${priority})`,
    );
    return id;
  }

  /**
   * Get the next batch of pending items, ordered by priority then creation time
   */
  async getPendingItems(limit: number = 50): Promise<SyncQueueItem[]> {
    await this.recoverExpiredLeases();

    return SyncQueueRepository.listProcessible(
      new Date().toISOString(),
      limit,
      this.currentUserId(),
    );
  }

  /**
   * Calculate dynamic lease timeout based on payload size.
   * Large attachments on slow networks need longer leases.
   */
  calculateLeaseTimeout(payload: Record<string, unknown>): number {
    const sizeBytes = typeof payload.size === 'number' ? payload.size : 0;
    const sizeMb = sizeBytes / (1024 * 1024);
    const dynamicTimeout =
      DEFAULT_LEASE_TIMEOUT_MS + Math.ceil(sizeMb) * LEASE_PER_MB_MS;
    return Math.min(dynamicTimeout, MAX_LEASE_TIMEOUT_MS);
  }

  /**
   * Attempt to claim an item for processing with a dynamic lease
   * timeout. Returns true if the CAS succeeded (this processor now
   * owns the lease), false if another processor already claimed it.
   *
   * M23: callers MUST branch on the return value and skip the
   * upload when false — otherwise two processors can race on the
   * same row and double-submit to the server.
   */
  async markInProgress(
    id: string,
    leaseTimeoutMs: number = DEFAULT_LEASE_TIMEOUT_MS,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    return SyncQueueRepository.markInProgress(
      id,
      now,
      this.getLeaseExpiry(leaseTimeoutMs),
      this.currentUserId(),
    );
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
    const attempts = (await SyncQueueRepository.getAttempts(id)) || 1;
    const { nextRetryAt } = syncRetryPolicy.getRetryWindow(attempts);

    await SyncQueueRepository.markFailed(id, error, nextRetryAt);

    Logger.warn(TAG, `Item ${id} failed (attempt ${attempts}): ${error}`);

    // C11 (audit 2026-04-20): detect the transition from "will retry" to
    // "permanently failed" and emit a distinct signal. Without this the
    // item silently falls out of listProcessible at the retry cap — no
    // telemetry, no log differentiation, no way for ops to notice that
    // the user's operation stopped syncing. The row is preserved so
    // retryAllFailed() can still recover it.
    const snapshot = await SyncQueueRepository.getFailureSnapshot(id);
    if (snapshot && snapshot.attempts >= snapshot.maxAttempts) {
      Logger.error(
        TAG,
        `DLQ_TRANSITION item=${id} ${snapshot.actionType} ${
          snapshot.entityType
        }/${snapshot.entityId} gave up after ${snapshot.attempts} attempts: ${
          snapshot.lastError ?? error
        }`,
      );
      MobileTelemetryService.trackSyncError('sync_dlq_transition', {
        itemId: id,
        actionType: snapshot.actionType,
        entityType: snapshot.entityType,
        entityId: snapshot.entityId,
        attempts: snapshot.attempts,
        maxAttempts: snapshot.maxAttempts,
        lastError: snapshot.lastError ?? error,
      });
    }
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
        case 'PENDING':
          counts.pending = count;
          break;
        case 'IN_PROGRESS':
          counts.inProgress = count;
          break;
        case 'COMPLETED':
          counts.completed = count;
          break;
        case 'FAILED':
          counts.failed = count;
          break;
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
  async hasPendingItem(
    entityType: EntityType,
    entityId: string,
  ): Promise<boolean> {
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
