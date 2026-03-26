import { DatabaseService } from '../database/DatabaseService';
import type { SyncQueueItem } from '../types/mobile';

class SyncQueueRepositoryClass {
  async recoverExpiredLeases(now: string): Promise<number> {
    // Reset to PENDING (not FAILED) and do NOT increment attempts.
    // Lease expiry from an app crash is not a genuine sync failure —
    // the operation was interrupted, not rejected by the server.
    // Counting it as a failed attempt causes permanent data loss after 3 crashes.
    const result = await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'PENDING',
           last_error = COALESCE(last_error, 'Recovered after interrupted processing — lease expired'),
           next_retry_at = NULL,
           started_at = NULL,
           lease_expires_at = NULL
       WHERE status = 'IN_PROGRESS'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?`,
      [now],
    );
    return result.rowsAffected;
  }

  async insert(
    id: string,
    actionType: string,
    entityType: string,
    entityId: string,
    payloadJson: string,
    priority: number,
    createdAt: string,
  ): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO sync_queue
        (id, action_type, entity_type, entity_id, payload_json, status, priority, created_at, attempts, max_attempts, started_at, lease_expires_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, 0, 3, NULL, NULL)`,
      [id, actionType, entityType, entityId, payloadJson, priority, createdAt],
    );
  }

  async deletePendingStatusItems(entityId: string): Promise<void> {
    await DatabaseService.execute(
      `DELETE FROM sync_queue
       WHERE entity_type = 'TASK_STATUS'
         AND entity_id = ?
         AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS')`,
      [entityId],
    );
  }

  async listProcessible(now: string, limit: number): Promise<SyncQueueItem[]> {
    return DatabaseService.query<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE status = 'PENDING'
          OR (status = 'FAILED' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= ?))
       ORDER BY
         CASE
           WHEN json_extract(payload_json, '$._operation.priority') IS NOT NULL
             THEN CAST(json_extract(payload_json, '$._operation.priority') AS INTEGER)
           ELSE (100 - COALESCE(priority, 0))
         END DESC,
         created_at ASC
       LIMIT ?`,
      [now, limit],
    );
  }

  async markInProgress(id: string, startedAt: string, leaseExpiresAt: string): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue
       SET status = 'IN_PROGRESS',
           attempts = attempts + 1,
           started_at = ?,
           lease_expires_at = ?
       WHERE id = ?`,
      [startedAt, leaseExpiresAt, id],
    );
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

  async markFailed(id: string, error: string, nextRetryAt: string | null): Promise<void> {
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

  async listLogs(filter: 'ALL' | 'FAILED', limit: number = 100): Promise<SyncQueueItem[]> {
    const query = filter === 'FAILED'
      ? `SELECT * FROM sync_queue WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT ?`;
    return DatabaseService.query<SyncQueueItem>(query, [limit]);
  }

  async retryAllFailed(): Promise<void> {
    await DatabaseService.execute(
      `UPDATE sync_queue SET status = 'PENDING', attempts = 0, next_retry_at = NULL WHERE status = 'FAILED'`,
    );
  }

  async clearCompleted(): Promise<void> {
    await DatabaseService.execute(`DELETE FROM sync_queue WHERE status = 'COMPLETED'`);
  }

  async updatePayload(id: string, payloadJson: string): Promise<void> {
    await DatabaseService.execute('UPDATE sync_queue SET payload_json = ? WHERE id = ?', [payloadJson, id]);
  }

  async listPendingAttachmentQueueItems(taskId: string, backendTaskId: string): Promise<Array<{ id: string; payloadJson: string }>> {
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

  async countBlockingPhotos(taskId: string): Promise<number> {
    return DatabaseService.count(
      'sync_queue',
      "entity_type IN ('VISIT_PHOTO', 'ATTACHMENT') AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS') AND (json_extract(payload_json, '$.visitId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
      [taskId, taskId],
    );
  }
}

export const SyncQueueRepository = new SyncQueueRepositoryClass();
