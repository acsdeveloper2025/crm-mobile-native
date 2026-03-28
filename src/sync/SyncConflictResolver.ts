import { DatabaseService } from '../database/DatabaseService';
import type { MobileCaseResponse } from '../types/api';

interface ExistingTaskState {
  status: string;
  isSaved: boolean;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  syncStatus: string | null;
  local_updated_at?: string | null;
}

interface ResolvedTaskState {
  status: string;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  isSaved: number;
}

class SyncConflictResolver {
  private isLocalFresher(localUpdatedAt: string | null | undefined, serverUpdatedAt: string | null | undefined): boolean {
    if (!localUpdatedAt || !serverUpdatedAt) {
      return false;
    }
    try {
      return new Date(localUpdatedAt) > new Date(serverUpdatedAt);
    } catch {
      return false;
    }
  }

  /**
   * Check if there are in-flight sync queue items for this task that would
   * change its state. If so, preserve local state to avoid silent data loss.
   */
  async hasInFlightQueueItems(taskId: string): Promise<boolean> {
    try {
      const rows = await DatabaseService.query<{ c: number }>(
        `SELECT 1 as c FROM sync_queue
         WHERE entity_type IN ('TASK', 'TASK_STATUS', 'FORM_SUBMISSION')
           AND entity_id = ?
           AND status IN ('PENDING', 'IN_PROGRESS', 'FAILED')
         LIMIT 1`,
        [taskId],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  resolveTaskState(task: MobileCaseResponse, existing?: ExistingTaskState | null, hasQueuedChanges: boolean = false): ResolvedTaskState {
    const backendStatus = (task.status || 'ASSIGNED').toUpperCase();
    let status = backendStatus;
    let inProgressAt = task.inProgressAt || null;
    let savedAt = task.savedAt || null;
    let completedAt = task.completedAt || null;
    let isSaved = task.isSaved ? 1 : 0;

    if (existing) {
      const localStatus = (existing.status || '').toUpperCase();
      const localSaved = existing.isSaved;

      // Check if local edits are newer than server state
      const localHasFreshEdits = this.isLocalFresher(existing.local_updated_at, task.updatedAt);

      // If there are queued changes that haven't synced yet, always preserve
      // local state to prevent silent data loss from overwriting pending work.
      if (hasQueuedChanges) {
        status = localStatus || status;
        inProgressAt = existing.inProgressAt || inProgressAt;
        savedAt = existing.savedAt || savedAt;
        completedAt = existing.completedAt || completedAt;
        isSaved = localSaved ? 1 : isSaved;
        return { status, inProgressAt, savedAt, completedAt, isSaved };
      }

      if (existing.syncStatus === 'PENDING') {
        // For PENDING sync status, use existing logic with status precedence
        const shouldPreserveLocal =
          (backendStatus === 'ASSIGNED' &&
            (localStatus === 'IN_PROGRESS' || localStatus === 'COMPLETED' || localSaved)) ||
          (backendStatus === 'IN_PROGRESS' && localStatus === 'COMPLETED');

        if (shouldPreserveLocal) {
          status = localStatus || status;
          inProgressAt = existing.inProgressAt || inProgressAt;
          savedAt = existing.savedAt || savedAt;
          completedAt = existing.completedAt || completedAt;
          isSaved = localSaved ? 1 : isSaved;
        }
      } else if (localHasFreshEdits) {
        // For non-PENDING status: if local has fresher edits than server, preserve local edits
        // but still accept server-side administrative changes (status revocations, reassignments)
        status = localStatus || status;
        inProgressAt = existing.inProgressAt || inProgressAt;
        savedAt = existing.savedAt || savedAt;
        completedAt = existing.completedAt || completedAt;
        isSaved = localSaved ? 1 : isSaved;
      }
    }

    return {
      status,
      inProgressAt,
      savedAt,
      completedAt,
      isSaved,
    };
  }
}

export const syncConflictResolver = new SyncConflictResolver();
