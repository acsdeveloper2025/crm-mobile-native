import { DatabaseService } from '../database/DatabaseService';

class DataCleanupRepositoryClass {
  async listOldTerminalTaskIds(cutoffIso: string): Promise<string[]> {
    const rows = await DatabaseService.query<{ id: string }>(
      `SELECT id FROM tasks
       WHERE (updated_at < ? OR completed_at < ?)
       AND status IN ('COMPLETED', 'REVOKED')`,
      [cutoffIso, cutoffIso],
    );
    return rows.map(row => row.id);
  }

  async listAttachmentsForTask(taskId: string): Promise<Array<{ id: string; localPath: string; thumbnailPath: string | null }>> {
    return DatabaseService.query<{ id: string; localPath: string; thumbnailPath: string | null }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath
       FROM attachments
       WHERE task_id = ?`,
      [taskId],
    );
  }

  async deleteTaskGraph(taskId: string): Promise<void> {
    await DatabaseService.transaction(async tx => {
      await tx.executeSql(`DELETE FROM attachments WHERE task_id = ?`, [taskId]);
      await tx.executeSql(`DELETE FROM locations WHERE task_id = ?`, [taskId]);
      await tx.executeSql(`DELETE FROM form_submissions WHERE task_id = ?`, [taskId]);
      await tx.executeSql(
        `DELETE FROM sync_queue
         WHERE entity_id = ?
            OR json_extract(payload_json, '$.localTaskId') = ?
            OR json_extract(payload_json, '$.taskId') = ?
            OR json_extract(payload_json, '$.visitId') = ?`,
        [taskId, taskId, taskId, taskId],
      );
      await tx.executeSql(`DELETE FROM key_value_store WHERE key LIKE ?`, [`auto_save_${taskId}%`]);
      await tx.executeSql(`DELETE FROM tasks WHERE id = ?`, [taskId]);
    });
  }

  async listAllAttachments(): Promise<Array<{ id: string; localPath: string; thumbnailPath: string | null }>> {
    return DatabaseService.query<{ id: string; localPath: string; thumbnailPath: string | null }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath FROM attachments`,
    );
  }

  async clearCacheAndSyncTables(): Promise<void> {
    await DatabaseService.transaction(async tx => {
      await tx.executeSql('DELETE FROM sync_queue');
      await tx.executeSql('DELETE FROM form_submissions');
      await tx.executeSql('DELETE FROM attachments');
      await tx.executeSql('DELETE FROM locations');
      await tx.executeSql('DELETE FROM tasks');
      await tx.executeSql('DELETE FROM form_templates');
      await tx.executeSql(`DELETE FROM key_value_store WHERE key LIKE 'auto_save_%'`);
    });
  }

  async deleteAttachmentById(id: string): Promise<void> {
    await DatabaseService.execute(`DELETE FROM attachments WHERE id = ?`, [id]);
  }
}

export const DataCleanupRepository = new DataCleanupRepositoryClass();
