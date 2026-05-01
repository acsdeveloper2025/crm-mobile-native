/**
 * F2.7.1 — local mirror of verification_type_outcomes lookup table.
 * Hydrated by SyncDownloadService on each download cycle. Read by
 * LegacyFormTemplateBuilders + VerificationFormScreen for per-type
 * valid outcomes.
 *
 * Offline-first: reads from local SQLite; sync replaces all rows
 * atomically (delete-then-insert in a transaction).
 */

import { DatabaseService } from '../database/DatabaseService';

export interface VerificationTypeOutcomeRow {
  id: number;
  verificationTypeId: number;
  verificationTypeCode: string;
  outcomeCode: string;
  displayLabel: string;
  sortOrder: number;
  isActive: boolean;
}

interface DbRow {
  id: number;
  verification_type_id: number;
  verification_type_code: string;
  outcome_code: string;
  display_label: string;
  sort_order: number;
  is_active: number; // SQLite boolean
}

const FROM_DB = (r: DbRow): VerificationTypeOutcomeRow => ({
  id: r.id,
  verificationTypeId: r.verification_type_id,
  verificationTypeCode: r.verification_type_code,
  outcomeCode: r.outcome_code,
  displayLabel: r.display_label,
  sortOrder: r.sort_order,
  isActive: r.is_active === 1,
});

class VerificationTypeOutcomesRepositoryClass {
  /** All active outcomes ordered by type then sort_order. */
  async listAll(): Promise<VerificationTypeOutcomeRow[]> {
    const rows = await DatabaseService.query<DbRow>(
      `SELECT id, verification_type_id, verification_type_code, outcome_code,
              display_label, sort_order, is_active
         FROM verification_type_outcomes
        WHERE is_active = 1
        ORDER BY verification_type_id, sort_order`,
    );
    return rows.map(FROM_DB);
  }

  /** Outcomes for a specific verification type (short code: RV, OV, ...). */
  async listByType(typeCode: string): Promise<VerificationTypeOutcomeRow[]> {
    const rows = await DatabaseService.query<DbRow>(
      `SELECT id, verification_type_id, verification_type_code, outcome_code,
              display_label, sort_order, is_active
         FROM verification_type_outcomes
        WHERE verification_type_code = ? AND is_active = 1
        ORDER BY sort_order`,
      [typeCode.toUpperCase()],
    );
    return rows.map(FROM_DB);
  }

  /**
   * Atomic replace: clear local table + insert all rows from server.
   * Called by SyncDownloadService.
   */
  async replaceAll(rows: VerificationTypeOutcomeRow[]): Promise<void> {
    const syncedAt = new Date().toISOString();
    await DatabaseService.transaction(async tx => {
      await tx.execute('DELETE FROM verification_type_outcomes');
      for (const r of rows) {
        await tx.execute(
          `INSERT INTO verification_type_outcomes
             (id, verification_type_id, verification_type_code, outcome_code,
              display_label, sort_order, is_active, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.verificationTypeId,
            r.verificationTypeCode,
            r.outcomeCode,
            r.displayLabel,
            r.sortOrder,
            r.isActive ? 1 : 0,
            syncedAt,
          ],
        );
      }
    });
  }
}

export const VerificationTypeOutcomesRepository =
  new VerificationTypeOutcomesRepositoryClass();
