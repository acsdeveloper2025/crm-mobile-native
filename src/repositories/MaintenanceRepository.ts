import { DatabaseService } from '../database/DatabaseService';

class MaintenanceRepositoryClass {
  async getAttachmentCount(): Promise<number> {
    const rows = await DatabaseService.query<{ totalCount: number }>(
      'SELECT COUNT(*) as totalCount FROM attachments',
    );
    return rows[0]?.totalCount ?? 0;
  }

  async getPendingSyncCount(): Promise<number> {
    const rows = await DatabaseService.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('PENDING', 'FAILED')",
    );
    return rows[0]?.count ?? 0;
  }

  async listSyncedAttachmentsOlderThan(cutoffIso: string): Promise<
    Array<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>
  > {
    return DatabaseService.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      `SELECT id, local_path as localPath, thumbnail_path as thumbnailPath
       FROM attachments
       WHERE sync_status = 'SYNCED' AND uploaded_at < ?`,
      [cutoffIso],
    );
  }

  async deleteAttachmentById(id: string): Promise<void> {
    await DatabaseService.execute('DELETE FROM attachments WHERE id = ?', [id]);
  }

  async deleteSyncedLocationsOlderThan(cutoffIso: string): Promise<number> {
    const result = await DatabaseService.execute(
      "DELETE FROM locations WHERE sync_status = 'SYNCED' AND timestamp < ?",
      [cutoffIso],
    );
    return result.rowsAffected;
  }

  async deleteCompletedSyncItemsOlderThan(cutoffIso: string): Promise<number> {
    const result = await DatabaseService.execute(
      "DELETE FROM sync_queue WHERE status = 'COMPLETED' AND processed_at < ?",
      [cutoffIso],
    );
    return result.rowsAffected;
  }

  async deleteSyncedAuditLogsOlderThan(cutoffIso: string): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM audit_log WHERE synced = 1 AND timestamp < ?',
      [cutoffIso],
    );
  }

  /** Whitelist of tables safe to bulk-clear during maintenance */
  private static readonly CLEARABLE_TABLES = new Set([
    'tasks',
    'attachments',
    'locations',
    'form_submissions',
    'form_templates',
    'sync_queue',
    'sync_metadata',
    'audit_log',
    'notifications',
    'key_value_store',
    'task_list_projection',
    'task_detail_projection',
    'dashboard_projection',
  ]);

  async clearAllTables(tableNames: string[]): Promise<void> {
    for (const table of tableNames) {
      if (!MaintenanceRepositoryClass.CLEARABLE_TABLES.has(table)) {
        throw new Error(`Table "${table}" is not allowed for bulk clear`);
      }
      await DatabaseService.execute(`DELETE FROM ${table}`);
    }
  }
}

export const MaintenanceRepository = new MaintenanceRepositoryClass();
