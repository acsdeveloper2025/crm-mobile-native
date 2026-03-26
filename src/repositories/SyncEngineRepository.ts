import { DatabaseService } from '../database/DatabaseService';

type SqlParam = string | number | boolean | null | undefined;

class SyncEngineRepositoryClass {
  query<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return DatabaseService.query<T>(sql, params);
  }

  execute(sql: string, params: SqlParam[] = []): Promise<{ rowsAffected: number; insertId?: number }> {
    return DatabaseService.execute(sql, params);
  }

  count(table: string, whereClause?: string, params: SqlParam[] = []): Promise<number> {
    return DatabaseService.count(table, whereClause, params);
  }
}

export const SyncEngineRepository = new SyncEngineRepositoryClass();
