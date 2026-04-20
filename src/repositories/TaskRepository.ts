import { DatabaseService } from '../database/DatabaseService';
import { DashboardProjection } from '../projections/DashboardProjection';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { TaskDetailProjection } from '../projections/TaskDetailProjection';
import { TaskListProjection } from '../projections/TaskListProjection';
import type { LocalTask } from '../types/mobile';
import type { MobileCaseResponse } from '../types/api';
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
        await tx.executeSql(
          'UPDATE attachments SET task_id = ? WHERE task_id = ?',
          [targetId, currentId],
        );
        await tx.executeSql(
          'UPDATE locations SET task_id = ? WHERE task_id = ?',
          [targetId, currentId],
        );
        await tx.executeSql(
          'UPDATE form_submissions SET task_id = ? WHERE task_id = ?',
          [targetId, currentId],
        );
        await tx.executeSql(
          "UPDATE sync_queue SET entity_id = ? WHERE entity_type IN ('TASK', 'TASK_STATUS') AND entity_id = ?",
          [targetId, currentId],
        );

        // Read the target-exists check inside the transaction so a
        // concurrent writer cannot flip the answer between SELECT
        // and the final write.
        const [targetExistsResult] = await tx.executeSql(
          'SELECT id FROM tasks WHERE id = ? LIMIT 1',
          [targetId],
        );

        if (targetExistsResult.rows.length > 0) {
          await tx.executeSql('DELETE FROM tasks WHERE id = ?', [currentId]);
        } else {
          await tx.executeSql(
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
    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?,
           status = ?,
           in_progress_at = CASE WHEN in_progress_at IS NULL AND ? = 'IN_PROGRESS' THEN ? ELSE in_progress_at END,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(formData), status, status, now, now, taskId],
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
    await ProjectionUpdater.scheduleTaskRebuild(taskId);
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

  async upsertFromServer(task: MobileCaseResponse): Promise<void> {
    const canonicalTaskId = (task.verificationTaskId || task.id || '').trim();
    if (!canonicalTaskId) {
      return;
    }

    const staleRows = await DatabaseService.query<{ id: string }>(
      `SELECT id
       FROM tasks
       WHERE case_id = ?
         AND id != ?`,
      [task.caseId, canonicalTaskId],
    );

    const existingRows = await DatabaseService.query<{
      status: string;
      isSaved: number;
      inProgressAt: string | null;
      savedAt: string | null;
      completedAt: string | null;
      syncStatus: string | null;
    }>(
      `SELECT status, is_saved, in_progress_at, saved_at, completed_at, sync_status
       FROM tasks
       WHERE id = ?
       LIMIT 1`,
      [canonicalTaskId],
    );

    const existing = existingRows[0];
    const backendStatus = (task.status || 'ASSIGNED').toUpperCase();
    let mergedStatus = backendStatus;
    let mergedInProgressAt = task.inProgressAt || null;
    let mergedSavedAt = task.savedAt || null;
    let mergedCompletedAt = task.completedAt || null;
    let mergedIsSaved = task.isSaved ? 1 : 0;

    if (existing && existing.syncStatus === 'PENDING') {
      const localStatus = (existing.status || '').toUpperCase();
      const localSaved = existing.isSaved === 1;
      const shouldPreserveLocal =
        (backendStatus === 'ASSIGNED' &&
          (localStatus === 'IN_PROGRESS' ||
            localStatus === 'COMPLETED' ||
            localSaved)) ||
        (backendStatus === 'IN_PROGRESS' && localStatus === 'COMPLETED');
      if (shouldPreserveLocal) {
        mergedStatus = localStatus || mergedStatus;
        mergedInProgressAt = existing.inProgressAt || mergedInProgressAt;
        mergedSavedAt = existing.savedAt || mergedSavedAt;
        mergedCompletedAt = existing.completedAt || mergedCompletedAt;
        mergedIsSaved = localSaved ? 1 : mergedIsSaved;
      }
    }

    const now = new Date().toISOString();

    // C15 (audit 2026-04-20): wrap the stale-row migration loop + the
    // canonical-task INSERT OR REPLACE in a single transaction. Prior
    // to this, a crash between the child-table UPDATEs, the stale
    // DELETE, and the final INSERT OR REPLACE could leave orphan FK
    // references or an inconsistent tasks row. Atomic now.
    await DatabaseService.transaction(async tx => {
      for (const stale of staleRows) {
        await tx.executeSql(
          'UPDATE attachments SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await tx.executeSql(
          'UPDATE locations SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await tx.executeSql(
          'UPDATE form_submissions SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await tx.executeSql(
          "UPDATE sync_queue SET entity_id = ? WHERE entity_type IN ('TASK', 'TASK_STATUS') AND entity_id = ?",
          [canonicalTaskId, stale.id],
        );
        await tx.executeSql('DELETE FROM tasks WHERE id = ?', [stale.id]);
      }

      await tx.executeSql(
        `INSERT OR REPLACE INTO tasks
        (id, case_id, verification_task_id, verification_task_number, title, description, customer_name, customer_calling_code,
         customer_phone, customer_email, address_street, address_city, address_state, address_pincode, latitude, longitude,
         status, priority, assigned_at, updated_at, completed_at, notes, verification_type, verification_outcome, applicant_type,
         backend_contact_number, created_by_backend_user, assigned_to_field_user, client_id, client_name, client_code,
         product_id, product_name, product_code, verification_type_id, verification_type_name, verification_type_code,
         form_data_json, is_revoked, revoked_at, revoked_by_name, revoke_reason,
         in_progress_at, saved_at, is_saved, attachment_count,
         sync_status, last_synced_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)`,
        [
          canonicalTaskId,
          task.caseId,
          canonicalTaskId,
          task.verificationTaskNumber || '',
          task.title,
          task.description || '',
          task.customerName,
          task.customerCallingCode || null,
          task.customerPhone || null,
          task.customerEmail || null,
          task.addressStreet || '',
          task.addressCity || '',
          task.addressState || '',
          task.addressPincode || '',
          task.latitude || null,
          task.longitude || null,
          mergedStatus,
          task.priority || 'MEDIUM',
          task.assignedAt || now,
          task.updatedAt || now,
          mergedCompletedAt,
          task.notes || null,
          task.verificationType || null,
          task.verificationOutcome || null,
          task.applicantType || null,
          task.backendContactNumber || null,
          task.createdByBackendUser || null,
          task.assignedToFieldUser || null,
          task.client?.id || null,
          task.client?.name || null,
          task.client?.code || null,
          task.product?.id || null,
          task.product?.name || null,
          task.product?.code || null,
          task.verificationTypeDetails?.id || null,
          task.verificationTypeDetails?.name || null,
          task.verificationTypeDetails?.code || null,
          task.formData ? JSON.stringify(task.formData) : null,
          task.isRevoked ? 1 : 0,
          task.revokedAt || null,
          task.revokedByName || null,
          task.revokeReason || null,
          mergedInProgressAt,
          mergedSavedAt,
          mergedIsSaved,
          task.attachmentCount || 0,
          now,
          now,
        ],
      );
    });

    await ProjectionUpdater.scheduleTaskRebuild(canonicalTaskId);
  }
}

export const TaskRepository = new TaskRepositoryClass();
