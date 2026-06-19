import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import { DashboardProjection } from '../projections/DashboardProjection';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { TaskDetailProjection } from '../projections/TaskDetailProjection';
import { TaskListProjection } from '../projections/TaskListProjection';
import type { LocalTask } from '../types/mobile';
import { mapSqliteTask } from '../utils/mapSqliteTask';

export interface DashboardStats {
  assignedCount: number;
  inProgressCount: number;
  completedCount: number;
  savedCount: number;
}

export interface TaskListCounts {
  ALL: number;
  ASSIGNED: number;
  IN_PROGRESS: number;
  SUBMITTED: number;
  COMPLETED: number;
  SAVED: number;
}

export interface RecentTaskActivity {
  id: string;
  customerName: string;
  status: string;
  verificationTaskNumber: string | null;
  updatedAt: string | null;
}

class TaskRepositoryClass {
  async repairTaskIdentity(): Promise<void> {
    const brokenRows = await DatabaseService.query<{
      id: string;
      verificationTaskId: string;
    }>(
      `SELECT id, verification_task_id
       FROM tasks
       WHERE verification_task_id IS NOT NULL
         AND verification_task_id != ''
         AND id != verification_task_id`,
    );

    // C14 (audit 2026-04-20): wrap each per-row repair in a single
    // transaction so the 5-6 cross-table writes either all commit or
    // all roll back. Previously an app crash or SQLite BUSY between
    // the child-table UPDATEs and the tasks UPDATE left orphan FKs
    // (child rows pointing at a task id that no longer existed).
    for (const row of brokenRows) {
      const currentId = row.id;
      const targetId = row.verificationTaskId;

      await DatabaseService.transaction(async tx => {
        await tx.execute(
          'UPDATE attachments SET task_id = ? WHERE task_id = ?',
          [targetId, currentId],
        );
        await tx.execute('UPDATE locations SET task_id = ? WHERE task_id = ?', [
          targetId,
          currentId,
        ]);
        await tx.execute(
          'UPDATE form_submissions SET task_id = ? WHERE task_id = ?',
          [targetId, currentId],
        );
        await tx.execute(
          "UPDATE sync_queue SET entity_id = ? WHERE entity_type IN ('TASK', 'TASK_STATUS') AND entity_id = ?",
          [targetId, currentId],
        );

        // Read the target-exists check inside the transaction so a
        // concurrent writer cannot flip the answer between SELECT
        // and the final write.
        const targetExistsResult = await tx.execute(
          'SELECT id FROM tasks WHERE id = ? LIMIT 1',
          [targetId],
        );

        if (targetExistsResult.rows.length > 0) {
          await tx.execute('DELETE FROM tasks WHERE id = ?', [currentId]);
        } else {
          await tx.execute(
            'UPDATE tasks SET id = ?, verification_task_id = ? WHERE id = ?',
            [targetId, targetId, currentId],
          );
        }
      });
    }
    await ProjectionUpdater.scheduleAllRebuild();
  }

  async listTasks(): Promise<LocalTask[]> {
    return TaskListProjection.list();
  }

  // 2026-05-03: list locally-saved tasks (is_saved=1) that aren't already
  // completed/revoked. Used by AutoSubmitSavedTasksUseCase on Sync to
  // auto-submit fully-filled saved tasks. Drafts (incomplete forms) are
  // included here too — the submit usecase itself enforces validation
  // (≥5 verification photos, ≥1 selfie, geo on every photo, valid outcome)
  // and throws on incomplete forms, so they stay saved.
  async listSavedTasks(): Promise<LocalTask[]> {
    return TaskListProjection.list('SAVED');
  }

  async getTaskById(taskId: string): Promise<LocalTask | null> {
    const projected = await TaskDetailProjection.getTaskById(taskId);
    if (projected) {
      return projected;
    }
    const rows = await DatabaseService.query<Record<string, unknown>>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId],
    );
    return rows[0] ? mapSqliteTask(rows[0] as never) : null;
  }

  async getTaskCoordinates(
    taskId: string,
  ): Promise<{ latitude: number | null; longitude: number | null } | null> {
    const projected = await TaskDetailProjection.getCoordinates(taskId);
    if (projected) {
      return projected;
    }
    const rows = await DatabaseService.query<{
      latitude: number | null;
      longitude: number | null;
    }>('SELECT latitude, longitude FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    return rows[0] || null;
  }

  async getTaskIdentity(taskId: string): Promise<{
    verificationType?: string | null;
    verificationTypeCode?: string | null;
    verificationTypeName?: string | null;
    verificationTaskId?: string | null;
  } | null> {
    const rows = await DatabaseService.query<{
      verificationType?: string | null;
      verificationTypeCode?: string | null;
      verificationTypeName?: string | null;
      verificationTaskId?: string | null;
    }>(
      `SELECT verification_type, verification_type_code, verification_type_name, verification_task_id
       FROM tasks
       WHERE id = ?
       LIMIT 1`,
      [taskId],
    );
    return rows[0] ?? null;
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const now = new Date().toISOString();
    let sql = `UPDATE tasks SET status = ?, is_saved = 0, sync_status = 'PENDING', local_updated_at = ?`;
    const params: Array<string | number | null> = [status, now];

    if (status === 'IN_PROGRESS') {
      sql += ', in_progress_at = COALESCE(in_progress_at, ?)';
      params.push(now);
    }

    if (status === 'COMPLETED') {
      sql += ', completed_at = ?';
      params.push(now);
    }

    sql += ' WHERE id = ?';
    params.push(taskId);
    await DatabaseService.execute(sql, params);
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async updateVerificationOutcome(
    taskId: string,
    outcome: string | null,
  ): Promise<void> {
    await DatabaseService.execute(
      `UPDATE tasks
       SET verification_outcome = ?, sync_status = 'PENDING', local_updated_at = ?
       WHERE id = ?`,
      [outcome, new Date().toISOString(), taskId],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async updateFormData(
    taskId: string,
    formData: Record<string, unknown>,
    status: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    // ADR-0047 two-stage completion: submission now moves the task to SUBMITTED
    // (the field terminal), NOT COMPLETED — only the office completes it later.
    // Clear is_saved on SUBMITTED too so the task leaves the Saved tab cleanly
    // (the Saved filter excludes SUBMITTED + COMPLETED). completed_at is stamped
    // only on COMPLETED (which the device never writes; it arrives via
    // down-sync). Sync_status stays PENDING until FormUploader confirms server
    // ack — UI shows "pending sync".
    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?,
           status = ?,
           in_progress_at = CASE WHEN in_progress_at IS NULL AND ? = 'IN_PROGRESS' THEN ? ELSE in_progress_at END,
           completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END,
           is_saved = CASE WHEN ? IN ('COMPLETED', 'SUBMITTED') THEN 0 ELSE is_saved END,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(formData),
        status,
        status,
        now,
        status,
        now,
        status,
        now,
        taskId,
      ],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async toggleSavedState(
    taskId: string,
    isSaved: boolean,
    nextStatus: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await DatabaseService.execute(
      `UPDATE tasks
       SET is_saved = ?,
           saved_at = ?,
           status = ?,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [isSaved ? 1 : 0, isSaved ? now : null, nextStatus, now, taskId],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async revokeTask(taskId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();
    await DatabaseService.execute(
      `UPDATE tasks
       SET status = 'REVOKED',
           is_revoked = 1,
           is_saved = 0,
           revoke_reason = ?,
           revoked_at = ?,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [reason, now, now, taskId],
    );
    // B-145 (2026-05-16): wipe local artifacts of the prior attempt so a
    // reassign-to-same-FE forces a fresh re-capture. Without this, stale
    // photos + form drafts would leak across attempts. Order: FS unlink
    // first, then DB DELETE — if FS fails we still want the DB cleaned.
    await this.wipeLocalTaskArtifacts(taskId);
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  /**
   * Delete local attachments + form_submissions + their FS files for a
   * task. Used by:
   *   - mobile-initiated revoke (FE taps Revoke) — local cleanup
   *   - WS-pushed revoke (BE revoked from web — see MobileSocketService)
   *   - sync-side conflict detection (downloadSync sees server-side
   *     status flip to REVOKED — see SyncConflictResolver)
   *
   * Idempotent: safe to call on a task with no attachments/forms.
   * Errors on FS unlink are logged-and-swallowed so a missing-file
   * mid-cleanup doesn't block the DB part. The DB part is the
   * authority on what counts as "wiped".
   */
  async wipeLocalTaskArtifacts(taskId: string): Promise<void> {
    const paths = await DatabaseService.query<{
      local_path?: string;
      thumbnail_path?: string;
    }>('SELECT local_path, thumbnail_path FROM attachments WHERE task_id = ?', [
      taskId,
    ]);

    for (const row of paths) {
      for (const p of [row.local_path, row.thumbnail_path]) {
        if (!p) continue;
        try {
          if (await RNFS.exists(p)) {
            await RNFS.unlink(p);
          }
        } catch {
          // swallow: missing file or permission — DB delete is authority
        }
      }
    }

    await DatabaseService.execute('DELETE FROM attachments WHERE task_id = ?', [
      taskId,
    ]);
    await DatabaseService.execute(
      'DELETE FROM form_submissions WHERE task_id = ?',
      [taskId],
    );
  }

  async setPriority(taskId: string, priority: number): Promise<void> {
    await DatabaseService.execute(
      `UPDATE tasks
       SET priority = ?, sync_status = 'PENDING', local_updated_at = ?
       WHERE id = ?`,
      [String(priority), new Date().toISOString(), taskId],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async updateSubmissionMeta(
    taskId: string,
    formData: Record<string, unknown>,
    markCompleted: boolean = false,
  ): Promise<void> {
    const now = new Date().toISOString();
    if (markCompleted) {
      await DatabaseService.execute(
        `UPDATE tasks
         SET status = 'COMPLETED',
             completed_at = ?,
             sync_status = 'SYNCED',
             last_synced_at = ?,
             local_updated_at = ?,
             form_data_json = ?
         WHERE id = ?`,
        [now, now, now, JSON.stringify(formData), taskId],
      );
      await ProjectionUpdater.scheduleTaskRebuild(taskId);
      return;
    }

    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?, local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(formData), now, taskId],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async markTaskSynced(taskId: string): Promise<void> {
    const now = new Date().toISOString();
    await DatabaseService.execute(
      `UPDATE tasks
       SET sync_status = 'SYNCED',
           last_synced_at = ?,
           local_updated_at = CASE WHEN local_updated_at IS NULL THEN ? ELSE local_updated_at END
       WHERE id = ?`,
      [now, now, taskId],
    );
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const rows = await DashboardProjection.getStats();
    return {
      assignedCount: rows.assignedCount,
      inProgressCount: rows.inProgressCount,
      completedCount: rows.completedCount,
      savedCount: rows.savedCount,
    };
  }

  async getTaskListCounts(): Promise<TaskListCounts> {
    return TaskListProjection.getCounts();
  }

  async listRecentActivity(limit: number = 3): Promise<RecentTaskActivity[]> {
    return TaskListProjection.listRecentActivity(limit);
  }

  async getActiveTaskCount(): Promise<number> {
    const stats = await DashboardProjection.getStats();
    return stats.activeCount;
  }

  // DB1 (audit 2026-04-21 round 2): the previous `upsertFromServer`
  // method lived here for historical reasons but was never called —
  // `SyncDownloadService.upsertTaskFromServer` is the live path. The
  // old implementation used `INSERT OR REPLACE INTO tasks` which under
  // our `ON DELETE CASCADE` children would delete every attachment /
  // form_submission / location row for the task on every sync. Removed
  // so nothing re-wires it by accident.
}

export const TaskRepository = new TaskRepositoryClass();
