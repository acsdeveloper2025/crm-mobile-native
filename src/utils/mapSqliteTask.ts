import type { LocalTask } from '../types/mobile';

/**
 * Maps a raw SQLite row (snake_case columns) to the LocalTask interface (camelCase).
 * Only converts the fields that differ — most columns already match camelCase
 * because the schema uses camelCase-compatible names (e.g., customerName).
 * The 8 snake_case fields from SQLite are mapped here at the boundary.
 */

interface RawSqliteTaskRow extends Omit<
  LocalTask,
  'isRevoked' | 'revokedAt' | 'revokedByName' | 'revokeReason' | 'inProgressAt' | 'savedAt' | 'isSaved' | 'attachmentCount'
> {
  // Snake_case columns as they come from SQLite SELECT *
  is_revoked?: number;
  revoked_at?: string;
  revoked_by_name?: string;
  revoke_reason?: string;
  in_progress_at?: string;
  saved_at?: string;
  is_saved?: number;
  attachment_count?: number;
}

export function mapSqliteTask(row: RawSqliteTaskRow): LocalTask {
  const {
    is_revoked,
    revoked_at,
    revoked_by_name,
    revoke_reason,
    in_progress_at,
    saved_at,
    is_saved,
    attachment_count,
    ...rest
  } = row;

  return {
    ...rest,
    isRevoked: is_revoked,
    revokedAt: revoked_at,
    revokedByName: revoked_by_name,
    revokeReason: revoke_reason,
    inProgressAt: in_progress_at,
    savedAt: saved_at,
    isSaved: is_saved,
    attachmentCount: attachment_count,
  };
}

export function mapSqliteTasks(rows: RawSqliteTaskRow[]): LocalTask[] {
  return rows.map(mapSqliteTask);
}
