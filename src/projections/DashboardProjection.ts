import { DatabaseService } from '../database/DatabaseService';

export interface DashboardProjectionStats {
  assignedCount: number;
  inProgressCount: number;
  completedCount: number;
  savedCount: number;
  activeCount: number;
  lastSyncAt: string | null;
  updatedAt: string | null;
}

class DashboardProjectionClass {
  async getStats(): Promise<DashboardProjectionStats> {
    const rows = await DatabaseService.query<{
      assignedCount: number;
      inProgressCount: number;
      completedCount: number;
      savedCount: number;
      activeCount: number;
      lastSyncAt: string | null;
      updatedAt: string | null;
    }>(
      `SELECT
         assigned_count,
         in_progress_count,
         completed_count,
         saved_count,
         active_count,
         last_sync_at,
         updated_at
       FROM dashboard_projection
       WHERE id = 1
       LIMIT 1`,
    );

    return {
      assignedCount: rows[0]?.assignedCount ?? 0,
      inProgressCount: rows[0]?.inProgressCount ?? 0,
      completedCount: rows[0]?.completedCount ?? 0,
      savedCount: rows[0]?.savedCount ?? 0,
      activeCount: rows[0]?.activeCount ?? 0,
      lastSyncAt: rows[0]?.lastSyncAt ?? null,
      updatedAt: rows[0]?.updatedAt ?? null,
    };
  }
}

export const DashboardProjection = new DashboardProjectionClass();
