/**
 * A2.4 (audit 2026-05-25) — local mirror of revoke_reasons master.
 * Hydrated by SyncDownloadService.refreshRevokeReasons() on each
 * download cycle from /api/mobile/reference/revoke-reasons. Read by
 * TaskRevokeModal to populate the reason dropdown.
 *
 * Offline-first: reads from local SQLite; sync replaces all rows
 * atomically (delete-then-insert in a transaction).
 *
 * When the local table is empty (fresh install offline, server
 * unreachable since first boot), TaskRevokeModal falls back to the
 * compiled-in `RevokeReason` enum in `src/types/api.ts`. That
 * fallback is intentionally narrow — once the first successful sync
 * runs, the local mirror becomes the source of truth.
 *
 * 2026-07-17: this pointed at `src/types/enums.ts`, which held a SECOND,
 * identical `RevokeReason` enum that nothing imported. That dead twin was
 * deleted; the live one — the one TaskRevokeModal actually falls back to — is
 * and always was in `types/api.ts`.
 */

import { DatabaseService } from '../database/DatabaseService';

export interface RevokeReasonRow {
  id: number;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

interface DbRow {
  id: number;
  code: string;
  label: string;
  sort_order: number;
  is_active: number; // SQLite boolean
}

const FROM_DB = (r: DbRow): RevokeReasonRow => ({
  id: r.id,
  code: r.code,
  label: r.label,
  sortOrder: r.sort_order,
  isActive: r.is_active === 1,
});

class RevokeReasonsRepositoryClass {
  /** All active reasons ordered by sort_order. */
  async listActive(): Promise<RevokeReasonRow[]> {
    const rows = await DatabaseService.query<DbRow>(
      `SELECT id, code, label, sort_order, is_active
         FROM revoke_reasons
        WHERE is_active = 1
        ORDER BY sort_order, id`,
    );
    return rows.map(FROM_DB);
  }

  /**
   * Atomic replace: clear local table + insert all rows from server.
   * Called by SyncDownloadService.refreshRevokeReasons().
   */
  async replaceAll(rows: RevokeReasonRow[]): Promise<void> {
    const syncedAt = new Date().toISOString();
    await DatabaseService.transaction(async tx => {
      await tx.execute('DELETE FROM revoke_reasons');
      for (const r of rows) {
        await tx.execute(
          `INSERT INTO revoke_reasons
             (id, code, label, sort_order, is_active, synced_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [r.id, r.code, r.label, r.sortOrder, r.isActive ? 1 : 0, syncedAt],
        );
      }
    });
  }
}

export const RevokeReasonsRepository = new RevokeReasonsRepositoryClass();
