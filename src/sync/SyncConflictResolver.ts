import { DatabaseService } from '../database/DatabaseService';
import type { MobileCaseResponse } from '../types/api';
import { Logger } from '../utils/logger';
import { TimeService } from '../services/TimeService';

interface ExistingTaskState {
  status: string;
  isSaved: boolean;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  syncStatus: string | null;
  localUpdatedAt?: string | null;
}

interface ResolvedTaskState {
  status: string;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  isSaved: number;
}

class SyncConflictResolver {
  /**
   * Phase D5 — delegate to TimeService so the comparison runs in
   * server-clock space with a skew tolerance window. If TimeService
   * has flagged the device clock as unreliable (|offset| > 1h) this
   * returns false unconditionally, which means the resolver accepts
   * server state instead of overwriting it with timestamps it can't
   * trust. That's the safer default on a field device with a broken
   * clock.
   */
  private isLocalFresher(
    localUpdatedAt: string | null | undefined,
    serverUpdatedAt: string | null | undefined,
  ): boolean {
    return TimeService.isLocalFresher(localUpdatedAt, serverUpdatedAt);
  }

  /**
   * Check if there are in-flight sync queue items for this task that would
   * change its state. If so, preserve local state to avoid silent data loss.
   *
   * Safety: if the underlying database query fails we CANNOT safely assume
   * "no in-flight changes" — that would silently allow the server payload to
   * overwrite pending local work. Instead we default to `true` (preserve
   * local) and surface the error via the logger.
   */
  async hasInFlightQueueItems(taskId: string): Promise<boolean> {
    try {
      // 2026-04-27 audit fix F5: previously this counted ANY status='FAILED'
      // as in-flight, including DLQ'd rows (FAILED + attempts >= max_attempts).
      // That meant a task that hit DLQ would pin local state forever and refuse
      // to reconcile from the server — agent's COMPLETED view stuck even after
      // server has rolled the task back to ASSIGNED. Now: DLQ'd FAILED rows
      // are excluded; only PENDING / IN_PROGRESS / actively-retrying FAILED
      // (attempts < max_attempts) are considered in-flight.
      const rows = await DatabaseService.query<{ c: number }>(
        `SELECT 1 as c FROM sync_queue
         WHERE entity_type IN ('TASK', 'TASK_STATUS', 'FORM_SUBMISSION')
           AND entity_id = ?
           AND (
             status IN ('PENDING', 'IN_PROGRESS')
             OR (status = 'FAILED' AND attempts < max_attempts)
           )
         LIMIT 1`,
        [taskId],
      );
      return rows.length > 0;
    } catch (error) {
      Logger.error(
        'SyncConflictResolver',
        `hasInFlightQueueItems failed for task ${taskId}; assuming queued changes exist to preserve local state`,
        error,
      );
      return true;
    }
  }

  resolveTaskState(
    task: MobileCaseResponse,
    existing?: ExistingTaskState | null,
    hasQueuedChanges: boolean = false,
  ): ResolvedTaskState {
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
      const localHasFreshEdits = this.isLocalFresher(
        existing.localUpdatedAt,
        task.updatedAt,
      );

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
        // For PENDING sync status, use existing logic with status precedence.
        //
        // 2026-05-02: extended `shouldPreserveLocal` to cover the case
        // where local `is_saved=1` (mobile-only state — backend has no
        // is_saved column) and backend status is IN_PROGRESS or
        // ASSIGNED. Without this, pressing Save on the phone briefly
        // flipped the task into the Saved tab, then the next sync
        // pulled the task with no is_saved info and the resolver
        // overwrote local is_saved=1 → 0, sending the task back to
        // the In-Progress tab. Now: if local says saved and backend
        // isn't COMPLETED/REVOKED, preserve all local progress fields
        // including is_saved.
        const shouldPreserveLocal =
          (backendStatus === 'ASSIGNED' &&
            (localStatus === 'IN_PROGRESS' ||
              localStatus === 'COMPLETED' ||
              localSaved)) ||
          (backendStatus === 'IN_PROGRESS' &&
            (localStatus === 'COMPLETED' || localSaved)) ||
          (localSaved &&
            backendStatus !== 'COMPLETED' &&
            backendStatus !== 'REVOKED');

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
