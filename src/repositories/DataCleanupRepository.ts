import { DatabaseService } from '../database/DatabaseService';

class DataCleanupRepositoryClass {
  async listOldTerminalTaskIds(cutoffIso: string): Promise<string[]> {
    const rows = await DatabaseService.query<{ id: string }>(
      `SELECT id FROM tasks
       WHERE (updated_at < ? OR completed_at < ?)
       AND status IN ('COMPLETED', 'REVOKED')
       AND sync_status = 'SYNCED'
       AND NOT EXISTS (
         SELECT 1 FROM attachments
         WHERE task_id = tasks.id
           AND sync_status != 'SYNCED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM form_submissions
         WHERE task_id = tasks.id
           AND sync_status != 'SYNCED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM sync_queue
         WHERE entity_id = tasks.id
            OR json_extract(payload_json, '$.localTaskId') = tasks.id
            OR json_extract(payload_json, '$.taskId') = tasks.id
            OR json_extract(payload_json, '$.visitId') = tasks.id
       )`,
      [cutoffIso, cutoffIso],
    );
    return rows.map(row => row.id);
  }

  /**
   * 2026-05-01 retention v2 (option 2C hybrid): list ALL tasks across all
   * statuses past the 45-day cutoff, but ONLY when no pending sync work
   * remains. Drafts (PENDING/FAILED forms or attachments, queued upload
   * ops) keep the task alive so the agent can resolve. Backend retains
   * the authoritative copy regardless — local cleanup is filesystem-only.
   */
  async listOldTaskIdsHybrid(cutoffIso: string): Promise<string[]> {
    const rows = await DatabaseService.query<{ id: string }>(
      `SELECT id FROM tasks
       WHERE (
         (updated_at IS NOT NULL AND updated_at < ?)
         OR (completed_at IS NOT NULL AND completed_at < ?)
         OR (assigned_at IS NOT NULL AND assigned_at < ?)
       )
       AND sync_status = 'SYNCED'
       AND NOT EXISTS (
         SELECT 1 FROM attachments
         WHERE task_id = tasks.id
           AND sync_status IN ('PENDING', 'FAILED', 'IN_PROGRESS', 'RETRYING')
       )
       AND NOT EXISTS (
         SELECT 1 FROM form_submissions
         WHERE task_id = tasks.id
           AND sync_status IN ('PENDING', 'FAILED')
       )
       AND NOT EXISTS (
         SELECT 1 FROM sync_queue
         WHERE status IN ('PENDING', 'IN_PROGRESS')
           AND (
             entity_id = tasks.id
             OR json_extract(payload_json, '$.localTaskId') = tasks.id
             OR json_extract(payload_json, '$.taskId') = tasks.id
             OR json_extract(payload_json, '$.visitId') = tasks.id
           )
       )`,
      [cutoffIso, cutoffIso, cutoffIso],
    );
    return rows.map(row => row.id);
  }

  /**
   * 2026-05-01 retention v2 tier-1: list attachments whose local file
   * is dispensable (backend has authoritative copy). The ROW stays;
   * only the local file gets unlinked + path columns blanked.
   */
  async listOldDispensableAttachments(
    cutoffIso: string,
  ): Promise<
    Array<{ id: string; localPath: string; thumbnailPath: string | null }>
  > {
    return DatabaseService.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath
       FROM attachments
       WHERE uploaded_at < ?
         AND sync_status = 'SYNCED'
         AND backend_attachment_id IS NOT NULL
         AND local_path IS NOT NULL
         AND local_path != ''`,
      [cutoffIso],
    );
  }

  /**
   * 2026-05-01 retention v2 tier-1: blank the path columns post-unlink
   * so reads can route to backend instead of attempting a missing file.
   */
  async clearAttachmentLocalPaths(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    await DatabaseService.execute(
      `UPDATE attachments
         SET local_path = '',
             thumbnail_path = ''
       WHERE id IN (${placeholders})`,
      ids,
    );
  }

  async listAttachmentsForTask(
    taskId: string,
  ): Promise<
    Array<{ id: string; localPath: string; thumbnailPath: string | null }>
  > {
    return DatabaseService.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath
       FROM attachments
       WHERE task_id = ?`,
      [taskId],
    );
  }

  async deleteTaskGraph(taskId: string): Promise<void> {
    await DatabaseService.transaction(async tx => {
      await tx.execute(`DELETE FROM attachments WHERE task_id = ?`, [taskId]);
      await tx.execute(`DELETE FROM locations WHERE task_id = ?`, [taskId]);
      await tx.execute(`DELETE FROM form_submissions WHERE task_id = ?`, [
        taskId,
      ]);
      await tx.execute(
        `DELETE FROM sync_queue
         WHERE entity_id = ?
            OR json_extract(payload_json, '$.localTaskId') = ?
            OR json_extract(payload_json, '$.taskId') = ?
            OR json_extract(payload_json, '$.visitId') = ?`,
        [taskId, taskId, taskId, taskId],
      );
      await tx.execute(`DELETE FROM key_value_store WHERE key LIKE ?`, [
        `auto_save_${taskId}%`,
      ]);
      // DB12 (audit 2026-04-21 round 2): notifications.task_id has
      // no FK (table predates ON DELETE CASCADE retrofit), so a deleted
      // task left orphan notifications pointing at a non-existent id.
      // Purge them here as part of the same transaction.
      await tx.execute(`DELETE FROM notifications WHERE task_id = ?`, [taskId]);
      await tx.execute(`DELETE FROM tasks WHERE id = ?`, [taskId]);
      await tx.execute(`DELETE FROM task_list_projection WHERE id = ?`, [
        taskId,
      ]);
      await tx.execute(`DELETE FROM task_detail_projection WHERE id = ?`, [
        taskId,
      ]);
    });
  }

  async listAllAttachments(): Promise<
    Array<{ id: string; localPath: string; thumbnailPath: string | null }>
  > {
    return DatabaseService.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath FROM attachments`,
    );
  }

  async clearCacheAndSyncTables(): Promise<void> {
    await DatabaseService.transaction(async tx => {
      await tx.execute('DELETE FROM form_templates');
      await tx.execute('DELETE FROM task_list_projection');
      await tx.execute('DELETE FROM task_detail_projection');
      await tx.execute('DELETE FROM dashboard_projection');
      // Keep autosaves for 7 days — only delete older ones
      await tx.execute(
        `DELETE FROM key_value_store WHERE key LIKE 'auto_save_%' AND json_extract(value, '$.timestamp') < ?`,
        [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()],
      );
    });
  }

  async deleteAttachmentById(id: string): Promise<void> {
    await DatabaseService.execute(`DELETE FROM attachments WHERE id = ?`, [id]);
  }
}

export const DataCleanupRepository = new DataCleanupRepositoryClass();
