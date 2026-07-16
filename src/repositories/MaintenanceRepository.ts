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

  // 2026-07-17: `listSyncedAttachmentsOlderThan` + `deleteAttachmentById`
  // lived here as a second, laxer copy of the retention reaper and were
  // deleted with their only caller (StorageService.cleanupSyncedData), which
  // now routes through DataCleanupService tier-1. The guarded pair is
  // DataCleanupRepository.listOldDispensableAttachments +
  // clearAttachmentLocalPaths — attachment reclaim belongs there, not here.

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

  // `deleteSyncedAuditLogsOlderThan` removed in v1.0.6 (DB_VERSION 12) —
  // the audit_log table was dropped because no code ever wrote to it.

  /** Whitelist of tables safe to bulk-clear during maintenance */
  private static readonly CLEARABLE_TABLES = new Set([
    'tasks',
    'attachments',
    'locations',
    'form_submissions',
    'form_templates',
    'sync_queue',
    'sync_metadata',
    // `user_session` is the device-owned local session singleton. It must be
    // clearable so StorageService.clearAllData() can wipe the prior user's
    // session on a user-change login (AuthService cross-user wipe). It was
    // missing from this whitelist, so the wipe threw on this table mid-loop
    // ("Table \"user_session\" is not allowed for bulk clear") and left a
    // partial wipe — the symptom reported during the ADR-0054 device smoke.
    'user_session',
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
