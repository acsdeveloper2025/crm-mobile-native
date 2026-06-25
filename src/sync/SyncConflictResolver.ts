import { DatabaseService } from '../database/DatabaseService';
import type { MobileCaseResponse } from '../types/api';
import { Logger } from '../utils/logger';
import { TimeService } from '../services/TimeService';
import {
  resolveTaskState as resolveTaskStateDecision,
  type ExistingTaskState,
  type ResolvedTaskState,
} from './resolveTaskState.ts';

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
    // Compute the server-clock freshness flag here (needs TimeService), then
    // delegate the pure status-merge decision to ./resolveTaskState so it stays
    // unit-testable outside the RN runtime. The revoked short-circuit lives in
    // that helper (A2026-0623-11).
    const localHasFreshEdits = existing
      ? this.isLocalFresher(existing.localUpdatedAt, task.updatedAt)
      : false;
    return resolveTaskStateDecision(
      task,
      existing,
      hasQueuedChanges,
      localHasFreshEdits,
    );
  }
}

export const syncConflictResolver = new SyncConflictResolver();
