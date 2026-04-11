import type { LocalTask } from '../types/mobile';

/**
 * Maps a raw SQLite row (snake_case columns) to the LocalTask interface (camelCase).
 * Only converts the fields that differ — most columns already match camelCase
 * because the schema uses camelCase-compatible names (e.g., customerName).
 * The 8 snake_case fields from SQLite are mapped here at the boundary.
 */

interface RawSqliteTaskRow
  extends Omit<
    LocalTask,
    | 'isRevoked'
    | 'revokedAt'
    | 'revokedByName'
    | 'revokeReason'
    | 'inProgressAt'
    | 'savedAt'
    | 'isSaved'
    | 'attachmentCount'
  > {
  // Snake_case columns as they come from SQLite SELECT *
  isRevoked?: number;
  revokedAt?: string;
  revokedByName?: string;
  revokeReason?: string;
  inProgressAt?: string;
  savedAt?: string;
  isSaved?: number;
  attachmentCount?: number;
}

export function mapSqliteTask(row: RawSqliteTaskRow): LocalTask {
  const {
    isRevoked,
    revokedAt,
    revokedByName,
    revokeReason,
    inProgressAt,
    savedAt,
    isSaved,
    attachmentCount,
    ...rest
  } = row;

  return {
    ...rest,
    isRevoked: isRevoked,
    revokedAt: revokedAt,
    revokedByName: revokedByName,
    revokeReason: revokeReason,
    inProgressAt: inProgressAt,
    savedAt: savedAt,
    isSaved: isSaved,
    attachmentCount: attachmentCount,
  };
}

export function mapSqliteTasks(rows: RawSqliteTaskRow[]): LocalTask[] {
  return rows.map(mapSqliteTask);
}
