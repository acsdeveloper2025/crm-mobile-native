import { DatabaseService } from '../database/DatabaseService';

class SyncEngineRepositoryClass {
  query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return DatabaseService.query<T>(sql, params);
  }

  execute(sql: string, params: any[] = []): Promise<{ rowsAffected: number; insertId?: number }> {
    return DatabaseService.execute(sql, params);
  }

  count(table: string, whereClause?: string, params: any[] = []): Promise<number> {
    return DatabaseService.count(table, whereClause, params);
  }
}

export const SyncEngineRepository = new SyncEngineRepositoryClass();
