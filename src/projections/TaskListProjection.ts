import { DatabaseService } from '../database/DatabaseService';
import { ProjectionUpdater } from './ProjectionUpdater';
import { Logger } from '../utils/logger';
import type { LocalTask } from '../types/mobile';
import { mapSqliteTasks } from '../utils/mapSqliteTask';

const TAG = 'TaskListProjection';

class TaskListProjectionClass {
  private buildSearchText(task: LocalTask): string {
    return [
      task.customerName,
      task.addressCity,
      task.verificationTaskNumber,
      task.caseId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private matchesSearch(task: LocalTask, searchQuery?: string): boolean {
    const normalizedQuery = searchQuery?.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return true;
    }

    const searchText = this.buildSearchText(task);
    return tokens.every(token => searchText.includes(token));
  }

  private async hasTasksForFilter(statusFilter?: string): Promise<boolean> {
    if (statusFilter === 'SAVED') {
      const rows = await DatabaseService.query<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM tasks
         WHERE is_saved = 1
           AND status != 'COMPLETED'
           AND (is_revoked IS NULL OR is_revoked = 0)`,
      );
      return (rows[0]?.count ?? 0) > 0;
    }

    if (!statusFilter) {
      const rows = await DatabaseService.query<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM tasks
         WHERE (is_revoked IS NULL OR is_revoked = 0)`,
      );
      return (rows[0]?.count ?? 0) > 0;
    }

    const rows = await DatabaseService.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE status = ?
         AND (is_revoked IS NULL OR is_revoked = 0)`,
      [statusFilter],
    );
    return (rows[0]?.count ?? 0) > 0;
  }

  async list(
    statusFilter?: string,
    searchQuery?: string,
  ): Promise<LocalTask[]> {
    let sql = `SELECT * FROM task_list_projection WHERE (is_revoked IS NULL OR is_revoked = 0)`;
    const params: Array<string | number | null> = [];

    if (statusFilter === 'SAVED') {
      sql += ` AND is_saved = 1 AND status != 'COMPLETED'`;
    } else if (statusFilter) {
      sql += ` AND status = ?`;
      params.push(statusFilter);
    }

    sql += ` ORDER BY
      CASE
        WHEN status = 'IN_PROGRESS' THEN 0
        WHEN status = 'ASSIGNED' THEN 1
        WHEN status = 'COMPLETED' THEN 2
        ELSE 3
      END,
      assigned_at DESC`;

    const rawProjected = await DatabaseService.query<Record<string, unknown>>(
      sql,
      params,
    );
    const projected = mapSqliteTasks(rawProjected as never[]);
    const filtered = projected.filter(task =>
      this.matchesSearch(task, searchQuery),
    );
    if (filtered.length > 0 || (searchQuery?.trim() ?? '').length > 0) {
      return filtered;
    }

    const hasRawTasks = await this.hasTasksForFilter(statusFilter);
    if (!hasRawTasks) {
      return filtered;
    }

    Logger.warn(
      TAG,
      `Projection stale for filter ${
        statusFilter || 'ALL'
      }, rebuilding projections`,
    );
    await ProjectionUpdater.rebuildAll();
    const rawRefreshed = await DatabaseService.query<Record<string, unknown>>(
      sql,
      params,
    );
    return mapSqliteTasks(rawRefreshed as never[]).filter(task =>
      this.matchesSearch(task, searchQuery),
    );
  }

  async getCounts(): Promise<{
    ALL: number;
    ASSIGNED: number;
    IN_PROGRESS: number;
    COMPLETED: number;
    SAVED: number;
  }> {
    const rows = await DatabaseService.query<{
      status: string;
      isSaved: number;
      isRevoked: number;
      count: number;
    }>(
      'SELECT status, is_saved, is_revoked, COUNT(*) as count FROM task_list_projection GROUP BY status, is_saved, is_revoked',
    );

    let all = 0;
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    let saved = 0;

    rows.forEach(row => {
      if (row.isRevoked) return;
      if (row.isSaved && row.status !== 'COMPLETED') {
        saved += row.count;
      } else if (row.status === 'ASSIGNED') {
        assigned += row.count;
      } else if (row.status === 'IN_PROGRESS') {
        inProgress += row.count;
      } else if (row.status === 'COMPLETED') {
        completed += row.count;
      }
      all += row.count;
    });

    return {
      ALL: all,
      ASSIGNED: assigned,
      IN_PROGRESS: inProgress,
      COMPLETED: completed,
      SAVED: saved,
    };
  }

  async listRecentActivity(limit: number): Promise<
    Array<{
      id: string;
      customerName: string;
      status: string;
      verificationTaskNumber: string | null;
      updatedAt: string | null;
    }>
  > {
    return DatabaseService.query<{
      id: string;
      customerName: string;
      status: string;
      verificationTaskNumber: string | null;
      updatedAt: string | null;
    }>(
      `SELECT id, customer_name, status, verification_task_number, updated_at
       FROM task_list_projection
       WHERE is_revoked IS NULL OR is_revoked = 0
       ORDER BY datetime(COALESCE(updated_at, assigned_at)) DESC
       LIMIT ?`,
      [limit],
    );
  }

  async getActiveCount(): Promise<number> {
    const rows = await DatabaseService.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_list_projection WHERE (is_revoked IS NULL OR is_revoked = 0)`,
    );
    return rows[0]?.count ?? 0;
  }
}

export const TaskListProjection = new TaskListProjectionClass();
