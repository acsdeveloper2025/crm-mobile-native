import { DatabaseService } from '../database/DatabaseService';
import type { SyncQueueItem } from '../types/mobile';

class SyncQueueRepositoryClass {
  async recoverExpiredLeases(now: string): Promise<number> {
    // Reset to PENDING and increment a dedicated crash_recovery_count.
    // We don't increment `attempts` (which tracks genuine server failures)
    // because lease expiry from an app crash is not a server rejection.
    // We cap crash recoveries at 10 to prevent infinite loops where a
    // poison-pill item keeps crashing the app.
    //
    // C22b (audit 2026-04-20): the recovery + counter-bump used to be
    // two separate UPDATEs. The second UPDATE's WHERE clause matched
    // `status='PENDING' AND last_error LIKE '%Recovered...'` — which
    // also matched items recovered in PREVIOUS cycles that were still
    // waiting on retry. Their counter would bump every time any
    // unrelated item recovered, so an item that crashed once could
    // reach the permanent-fail cap purely from bystander increments.
    // Merged into a single atomic UPDATE keyed on the current
    // cycle's expiring-lease condition so only genuinely recovered
    // rows get their counter touched.
    const recovered = await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'PENDING',
           last_error = COALESCE(last_error, 'Recovered after interrupted processing — lease expired'),
           next_retry_at = NULL,
           started_at = NULL,
           lease_expires_at = NULL,
           payload_json = json_set(
             payload_json,
             '$._operation.crash_recovery_count',
             COALESCE(CAST(json_extract(payload_json, '$._operation.crash_recovery_count') AS INTEGER), 0) + 1
           )
       WHERE status = 'IN_PROGRESS'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?
         AND COALESCE(CAST(json_extract(payload_json, '$._operation.crash_recovery_count') AS INTEGER), 0) < 10`,
      [now],
    );

    // Permanently fail items that exceeded 10 crash recoveries
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'FAILED',
           last_error = 'Exceeded maximum crash recovery attempts (10)',
           started_at = NULL,
           lease_expires_at = NULL
       WHERE status = 'IN_PROGRESS'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?
         AND COALESCE(CAST(json_extract(payload_json, '$._operation.crash_recovery_count') AS INTEGER), 0) >= 10`,
      [now],
    );

    return recovered.rowsAffected;
  }

  async insert(
    id: string,
    actionType: string,
    entityType: string,
    entityId: string,
    payloadJson: string,
    priority: number,
    createdAt: string,
    userId: string | null,
  ): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO sync_queue
        (id, action_type, entity_type, entity_id, payload_json, status, priority, created_at, attempts, max_attempts, started_at, lease_expires_at, user_id)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, 0, 10, NULL, NULL, ?)`,
      [
        id,
        actionType,
        entityType,
        entityId,
        payloadJson,
        priority,
        createdAt,
        userId,
      ],
    );
  }

  async deletePendingStatusItems(
    entityId: string,
    userId: string | null,
  ): Promise<void> {
    // Only delete PENDING and FAILED items — NOT IN_PROGRESS items.
    // Deleting an IN_PROGRESS item orphans its active lease and can cause
    // the processor to lose track of the operation.
    //
    // H6 (audit 2026-04-21): scoped by user_id so a call under user B
    // can't wipe user A's pending status mutation for the same entity.
    // Legacy rows (user_id IS NULL) are deleted under any user — they
    // pre-date C6 and can't be attributed.
    await DatabaseService.execute(
      `DELETE FROM sync_queue
       WHERE entity_type = 'TASK_STATUS'
         AND entity_id = ?
         AND status IN ('PENDING', 'FAILED')
         AND (user_id IS NULL OR user_id = ?)`,
      [entityId, userId],
    );
  }

  /**
   * Atomically replace the latest TASK_STATUS mutation for a given
   * entityId: delete any PENDING/FAILED rows and insert a new one in
   * a single SQLite transaction.
   *
   * M22: the previous enqueue path did delete + insert as two separate
   * awaits. If two enqueue calls raced (e.g. the user double-taps
   * "Start Visit" on a flaky network), both could pass the delete
   * before either insert completed — both inserts would then succeed,
   * leaving two duplicate pending status mutations keyed on the same
   * entity. On the next sync cycle the server would see both and the
   * second would bounce off the `must-revoke-first` state check,
   * corrupting the audit trail.
   *
   * Wrapping delete + insert in a single transaction serializes them
   * at the SQLite level so the invariant "at most one PENDING
   * TASK_STATUS mutation per entityId" holds even under concurrent
   * enqueues.
   */
  async replaceLatestStatusItem(
    entityId: string,
    id: string,
    actionType: string,
    payloadJson: string,
    priority: number,
    createdAt: string,
    userId: string | null,
  ): Promise<void> {
    // C6 (audit 2026-04-20, 2026-04-21 decision): the DELETE is scoped
    // by user_id so user A's pending mutation isn't clobbered when
    // user B logs in on a shared device and does an unrelated action.
    // Legacy rows (user_id IS NULL) are deleted under either user —
    // they pre-date the isolation and can't be attributed.
    await DatabaseService.transaction(async tx => {
      await tx.execute(
        `DELETE FROM sync_queue
         WHERE entity_type = 'TASK_STATUS'
           AND entity_id = ?
           AND status IN ('PENDING', 'FAILED')
           AND (user_id IS NULL OR user_id = ?)`,
        [entityId, userId],
      );
      await tx.execute(
        `INSERT INTO sync_queue
          (id, action_type, entity_type, entity_id, payload_json, status, priority, created_at, attempts, max_attempts, started_at, lease_expires_at, user_id)
         VALUES (?, ?, 'TASK_STATUS', ?, ?, 'PENDING', ?, ?, 0, 10, NULL, NULL, ?)`,
        [id, actionType, entityId, payloadJson, priority, createdAt, userId],
      );
    });
  }

  async listProcessible(
    now: string,
    limit: number,
    currentUserId: string | null,
  ): Promise<SyncQueueItem[]> {
    // C6: only return rows that belong to the current user. Legacy
    // rows (user_id IS NULL, created before the v10 migration) still
    // process for whoever is logged in — they pre-date isolation and
    // can't be attributed. If currentUserId is null (no one logged
    // in), only legacy rows process.
    return DatabaseService.query<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE (
         status = 'PENDING'
         OR (status = 'FAILED' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= ?))
       )
       AND (user_id IS NULL OR user_id = ?)
       ORDER BY
         CASE
           WHEN json_extract(payload_json, '$._operation.priority') IS NOT NULL
             THEN CAST(json_extract(payload_json, '$._operation.priority') AS INTEGER)
           ELSE (100 - COALESCE(priority, 0))
         END DESC,
         created_at ASC
       LIMIT ?`,
      [now, currentUserId, limit],
    );
  }

  /**
   * Atomically claim a queue item for processing.
   *
   * M23: the previous implementation did an unconditional
   * `UPDATE … WHERE id = ?`, which meant two concurrent processors
   * (foreground sync triggered from a user action + a scheduled
   * BackgroundSyncDaemon tick) could both read the same PENDING row
   * from listProcessible, both call markInProgress, and both
   * proceed to upload the same operation. With a server-side
   * idempotency key this is merely wasteful; without one it's a
   * duplicate-submission bug.
   *
   * Compare-and-swap: the UPDATE only commits if the row is still
   * PENDING (or FAILED with a next_retry window that has elapsed).
   * Returns true if the CAS succeeded, false if another processor
   * beat us to it. Callers must branch on the return value and
   * skip the upload when the lease was lost.
   */
  async markInProgress(
    id: string,
    startedAt: string,
    leaseExpiresAt: string,
    currentUserId: string | null,
  ): Promise<boolean> {
    // C6: the CAS also requires the row to belong to the current user
    // (or to have no user_id, i.e. legacy). This closes the race where
    // user A's row could be leased under user B's auth context if the
    // listProcessible filter was bypassed somehow.
    const result = await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'IN_PROGRESS',
           attempts = attempts + 1,
           started_at = ?,
           lease_expires_at = ?
       WHERE id = ?
         AND (user_id IS NULL OR user_id = ?)
         AND (
           status = 'PENDING'
           OR (status = 'FAILED' AND attempts < max_attempts)
           OR (status = 'IN_PROGRESS' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
         )`,
      [startedAt, leaseExpiresAt, id, currentUserId, startedAt],
    );
    return result.rowsAffected > 0;
  }

  async markCompleted(id: string, processedAt: string): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'COMPLETED',
           processed_at = ?,
           started_at = NULL,
           lease_expires_at = NULL
       WHERE id = ?`,
      [processedAt, id],
    );
  }

  async markPending(id: string, reason?: string | null): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'PENDING',
           attempts = CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END,
           last_error = ?,
           next_retry_at = NULL,
           started_at = NULL,
           lease_expires_at = NULL
       WHERE id = ?`,
      [reason || null, id],
    );
  }

  async getAttempts(id: string): Promise<number> {
    const rows = await DatabaseService.query<{ attempts: number }>(
      'SELECT attempts FROM sync_queue WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0]?.attempts ?? 0;
  }

  /**
   * Read the fields needed to decide whether a just-failed item has hit
   * its retry cap. Used by SyncQueue.markFailed to fire a
   * `sync_dlq_transition` telemetry event exactly when an item crosses
   * from "will retry" to "permanently failed" (C11, 2026-04-20 audit).
   */
  async getFailureSnapshot(id: string): Promise<{
    attempts: number;
    maxAttempts: number;
    actionType: string;
    entityType: string;
    entityId: string;
    lastError: string | null;
  } | null> {
    const rows = await DatabaseService.query<{
      attempts: number;
      maxAttempts: number;
      actionType: string;
      entityType: string;
      entityId: string;
      lastError: string | null;
    }>(
      `SELECT attempts, max_attempts, action_type, entity_type, entity_id, last_error
         FROM sync_queue
        WHERE id = ?
        LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async markFailed(
    id: string,
    error: string,
    nextRetryAt: string | null,
  ): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'FAILED',
           last_error = ?,
           next_retry_at = ?,
           started_at = NULL,
           lease_expires_at = NULL
       WHERE id = ?`,
      [error, nextRetryAt, id],
    );
  }

  async getPendingCount(): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "status = 'PENDING' OR status = 'FAILED' OR status = 'IN_PROGRESS'",
    );
  }

  async getStats(): Promise<Record<string, number>> {
    const rows = await DatabaseService.query<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status',
    );
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
  }

  async getCountByType(entityType: string): Promise<Record<string, number>> {
    const rows = await DatabaseService.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM sync_queue
       WHERE entity_type = ?
       GROUP BY status`,
      [entityType],
    );
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
  }

  async cleanupCompletedOlderThan(cutoff: string): Promise<number> {
    const result = await DatabaseService.execute(
      `DELETE FROM sync_queue
       WHERE status = 'COMPLETED'
         AND processed_at IS NOT NULL
         AND processed_at < ?`,
      [cutoff],
    );
    return result.rowsAffected;
  }

  async getCompletedCountSince(cutoff: string): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "status = 'COMPLETED' AND processed_at >= ?",
      [cutoff],
    );
  }

  async listLogs(
    filter: 'ALL' | 'FAILED',
    limit: number = 100,
  ): Promise<SyncQueueItem[]> {
    const query =
      filter === 'FAILED'
        ? `SELECT * FROM sync_queue WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT ?`
        : `SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT ?`;
    return DatabaseService.query<SyncQueueItem>(query, [limit]);
  }

  /**
   * Dead-letter queue view: items that have hit their retry cap and will
   * no longer be picked up by listProcessible. The rows are preserved so
   * retryAllFailed() can recover them on explicit user action (C11,
   * 2026-04-20 audit).
   */
  async listDeadLettered(limit: number = 100): Promise<SyncQueueItem[]> {
    return DatabaseService.query<SyncQueueItem>(
      `SELECT * FROM sync_queue
        WHERE status = 'FAILED' AND attempts >= max_attempts
        ORDER BY created_at DESC
        LIMIT ?`,
      [limit],
    );
  }

  async countDeadLettered(): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "status = 'FAILED' AND attempts >= max_attempts",
    );
  }

  async retryAllFailed(): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue SET status = 'PENDING', attempts = 0, next_retry_at = NULL WHERE status = 'FAILED'`,
    );
  }

  async clearCompleted(): Promise<void> {
    await DatabaseService.execute(
      `DELETE FROM sync_queue WHERE status = 'COMPLETED'`,
    );
  }

  async updatePayload(id: string, payloadJson: string): Promise<void> {
    await DatabaseService.execute(
      'UPDATE sync_queue SET payload_json = ? WHERE id = ?',
      [payloadJson, id],
    );
  }

  async listPendingAttachmentQueueItems(
    taskId: string,
    backendTaskId: string,
  ): Promise<Array<{ id: string; payloadJson: string }>> {
    return DatabaseService.query<{ id: string; payloadJson: string }>(
      `SELECT id, payload_json
       FROM sync_queue
       WHERE entity_type = 'ATTACHMENT'
         AND status IN ('PENDING', 'FAILED')
         AND (
           json_extract(payload_json, '$.localTaskId') = ?
           OR json_extract(payload_json, '$.taskId') = ?
         )`,
      [taskId, backendTaskId],
    );
  }

  async countBlockingLocations(taskId: string): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "entity_type = 'LOCATION' AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS') AND json_extract(payload_json, '$.taskId') = ?",
      [taskId],
    );
  }

  /**
   * Remove every sync_queue entry associated with a revoked or
   * server-deleted task (C10, audit 2026-04-20). Covers TASK,
   * TASK_STATUS (matched by entity_id) and ATTACHMENT, VISIT_PHOTO,
   * LOCATION, FORM_SUBMISSION (matched by payload_json.taskId or
   * localTaskId). Prevents the uploader from burning retries on a
   * task the server no longer recognises.
   */
  async deleteQueueItemsForTask(
    localTaskId: string,
    backendTaskId: string,
  ): Promise<number> {
    const result = await DatabaseService.execute(
      `DELETE FROM sync_queue
        WHERE (
          entity_type IN ('TASK', 'TASK_STATUS')
          AND entity_id IN (?, ?)
        )
           OR (
          entity_type IN ('ATTACHMENT', 'VISIT_PHOTO', 'LOCATION', 'FORM_SUBMISSION')
          AND (
            json_extract(payload_json, '$.taskId') IN (?, ?)
            OR json_extract(payload_json, '$.localTaskId') IN (?, ?)
          )
        )`,
      [
        localTaskId,
        backendTaskId,
        localTaskId,
        backendTaskId,
        localTaskId,
        backendTaskId,
      ],
    );
    return result.rowsAffected;
  }

  async countBlockingPhotos(taskId: string): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "entity_type IN ('VISIT_PHOTO', 'ATTACHMENT') AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS') AND (json_extract(payload_json, '$.visitId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
      [taskId, taskId],
    );
  }
}

export const SyncQueueRepository = new SyncQueueRepositoryClass();
