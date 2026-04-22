import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';

const TAG = 'ProjectionUpdater';

export type ProjectionChangeEvent =
  | { type: 'all' }
  | { type: 'task'; taskId: string }
  | { type: 'dashboard' };

type ProjectionListener = (event: ProjectionChangeEvent) => void;

class ProjectionUpdaterClass {
  private rebuilding = false;
  private listeners = new Set<ProjectionListener>();
  private pendingTaskIds = new Set<string>();
  private pendingRebuildAll = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private resolveFlush: (() => void) | null = null;

  subscribe(listener: ProjectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: ProjectionChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        Logger.warn(TAG, 'Projection listener failed', error);
      }
    });
  }

  private ensureFlushScheduled(): Promise<void> {
    if (!this.flushPromise) {
      this.flushPromise = new Promise(resolve => {
        this.resolveFlush = resolve;
      });
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushPendingRebuilds()
          .catch(error => {
            Logger.warn(TAG, 'Deferred projection flush failed', error);
          })
          .finally(() => {
            if (this.flushTimer) {
              clearTimeout(this.flushTimer);
              this.flushTimer = null;
            }
            this.resolveFlush?.();
            this.resolveFlush = null;
            this.flushPromise = null;
          });
      }, 0);
    }
    return this.flushPromise;
  }

  async scheduleTaskRebuild(taskId: string): Promise<void> {
    this.pendingTaskIds.add(taskId);
    return this.ensureFlushScheduled();
  }

  async scheduleAllRebuild(): Promise<void> {
    this.pendingRebuildAll = true;
    this.pendingTaskIds.clear();
    return this.ensureFlushScheduled();
  }

  private async flushPendingRebuilds(): Promise<void> {
    if (this.pendingRebuildAll) {
      this.pendingRebuildAll = false;
      this.pendingTaskIds.clear();
      await this.rebuildAll();
      return;
    }

    const taskIds = Array.from(this.pendingTaskIds);
    this.pendingTaskIds.clear();
    if (taskIds.length === 0) {
      return;
    }

    for (const taskId of taskIds) {
      await this.rebuildTask(taskId, false, false);
    }
    await this.rebuildDashboard(false);
    if (taskIds.length === 1) {
      this.notify({ type: 'task', taskId: taskIds[0] });
    } else {
      this.notify({ type: 'all' });
    }
    this.notify({ type: 'dashboard' });
  }

  async rebuildAll(): Promise<void> {
    if (this.rebuilding) {
      return;
    }
    this.rebuilding = true;
    try {
      await DatabaseService.transaction(async tx => {
        await tx.execute('DELETE FROM task_list_projection');
        await tx.execute(
          `INSERT INTO task_list_projection (
             id, case_id, verification_task_id, verification_task_number, title, customer_name,
             address_street, address_city, address_state, address_pincode, status, priority,
             assigned_at, updated_at, completed_at, verification_type, verification_type_name,
             is_saved, is_revoked, revoked_at, in_progress_at, saved_at, attachment_count, search_text
           )
           SELECT
             id, case_id, verification_task_id, verification_task_number, title, customer_name,
             address_street, address_city, address_state, address_pincode, status, priority,
             assigned_at, updated_at, completed_at, verification_type, verification_type_name,
             is_saved, is_revoked, revoked_at, in_progress_at, saved_at, attachment_count,
             TRIM(
               LOWER(
                 COALESCE(customer_name, '') || ' ' ||
                 COALESCE(address_city, '') || ' ' ||
                 COALESCE(verification_task_number, '') || ' ' ||
                 COALESCE(case_id, '')
               )
             )
           FROM tasks`,
        );

        await tx.execute('DELETE FROM task_detail_projection');
        // UX fix (2026-04-21): every key inside json_object() MUST be
        // camelCase. The payload is consumed directly via
        // `JSON.parse(taskJson)` in `TaskDetailProjection.getTaskById`
        // and fed into `mapSqliteTask` which destructures camelCase
        // property names. Previous snake_case keys (`is_revoked`,
        // `attachment_count`, etc.) silently made those fields
        // undefined on any task hydrated from the detail projection —
        // which masked the Assigned-tab attachment-count badge after
        // the user opened a task detail and returned to the tab.
        await tx.execute(
          `INSERT INTO task_detail_projection (id, task_json, updated_at)
           SELECT id, json_object(
             'id', id,
             'caseId', case_id,
             'verificationTaskId', verification_task_id,
             'verificationTaskNumber', verification_task_number,
             'title', title,
             'description', description,
             'customerName', customer_name,
             'customerCallingCode', customer_calling_code,
             'customerPhone', customer_phone,
             'customerEmail', customer_email,
             'addressStreet', address_street,
             'addressCity', address_city,
             'addressState', address_state,
             'addressPincode', address_pincode,
             'latitude', latitude,
             'longitude', longitude,
             'status', status,
             'priority', priority,
             'assignedAt', assigned_at,
             'updatedAt', updated_at,
             'completedAt', completed_at,
             'notes', notes,
             'verificationType', verification_type,
             'verificationOutcome', verification_outcome,
             'applicantType', applicant_type,
             'backendContactNumber', backend_contact_number,
             'createdByBackendUser', created_by_backend_user,
             'assignedToFieldUser', assigned_to_field_user,
             'clientId', client_id,
             'clientName', client_name,
             'clientCode', client_code,
             'productId', product_id,
             'productName', product_name,
             'productCode', product_code,
             'verificationTypeId', verification_type_id,
             'verificationTypeName', verification_type_name,
             'verificationTypeCode', verification_type_code,
             'formDataJson', form_data_json,
             'isRevoked', is_revoked,
             'revokedAt', revoked_at,
             'revokedByName', revoked_by_name,
             'revokeReason', revoke_reason,
             'inProgressAt', in_progress_at,
             'savedAt', saved_at,
             'isSaved', is_saved,
             'attachmentCount', attachment_count,
             'syncStatus', sync_status,
             'lastSyncedAt', last_synced_at,
             'localUpdatedAt', local_updated_at
           ), COALESCE(updated_at, assigned_at, local_updated_at, CURRENT_TIMESTAMP)
           FROM tasks`,
        );

        await tx.execute('DELETE FROM dashboard_projection');
        await tx.execute(
          `INSERT INTO dashboard_projection
           SELECT
             1,
             COALESCE(SUM(CASE WHEN status = 'ASSIGNED' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN is_saved = 1 AND status != 'COMPLETED' THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
             (SELECT last_download_sync_at FROM sync_metadata WHERE id = 1),
             CURRENT_TIMESTAMP
           FROM tasks`,
        );
      });
    } catch (error) {
      Logger.error(TAG, 'Failed to rebuild projections', error);
      throw error;
    } finally {
      this.rebuilding = false;
    }
    this.notify({ type: 'all' });
  }

  async rebuildTask(
    taskId: string,
    shouldNotify: boolean = true,
    shouldRebuildDashboard: boolean = true,
  ): Promise<void> {
    try {
      await DatabaseService.transaction(async tx => {
        await tx.execute('DELETE FROM task_list_projection WHERE id = ?', [
          taskId,
        ]);
        await tx.execute(
          `INSERT INTO task_list_projection (
             id, case_id, verification_task_id, verification_task_number, title, customer_name,
             address_street, address_city, address_state, address_pincode, status, priority,
             assigned_at, updated_at, completed_at, verification_type, verification_type_name,
             is_saved, is_revoked, revoked_at, in_progress_at, saved_at, attachment_count, search_text
           )
           SELECT
             id, case_id, verification_task_id, verification_task_number, title, customer_name,
             address_street, address_city, address_state, address_pincode, status, priority,
             assigned_at, updated_at, completed_at, verification_type, verification_type_name,
             is_saved, is_revoked, revoked_at, in_progress_at, saved_at, attachment_count,
             TRIM(
               LOWER(
                 COALESCE(customer_name, '') || ' ' ||
                 COALESCE(address_city, '') || ' ' ||
                 COALESCE(verification_task_number, '') || ' ' ||
                 COALESCE(case_id, '')
               )
             )
           FROM tasks
           WHERE id = ?`,
          [taskId],
        );
        await tx.execute('DELETE FROM task_detail_projection WHERE id = ?', [
          taskId,
        ]);
        await tx.execute(
          `INSERT INTO task_detail_projection (id, task_json, updated_at)
           SELECT id, json_object(
             'id', id,
             'caseId', case_id,
             'verificationTaskId', verification_task_id,
             'verificationTaskNumber', verification_task_number,
             'title', title,
             'description', description,
             'customerName', customer_name,
             'customerCallingCode', customer_calling_code,
             'customerPhone', customer_phone,
             'customerEmail', customer_email,
             'addressStreet', address_street,
             'addressCity', address_city,
             'addressState', address_state,
             'addressPincode', address_pincode,
             'latitude', latitude,
             'longitude', longitude,
             'status', status,
             'priority', priority,
             'assignedAt', assigned_at,
             'updatedAt', updated_at,
             'completedAt', completed_at,
             'notes', notes,
             'verificationType', verification_type,
             'verificationOutcome', verification_outcome,
             'applicantType', applicant_type,
             'backendContactNumber', backend_contact_number,
             'createdByBackendUser', created_by_backend_user,
             'assignedToFieldUser', assigned_to_field_user,
             'clientId', client_id,
             'clientName', client_name,
             'clientCode', client_code,
             'productId', product_id,
             'productName', product_name,
             'productCode', product_code,
             'verificationTypeId', verification_type_id,
             'verificationTypeName', verification_type_name,
             'verificationTypeCode', verification_type_code,
             'formDataJson', form_data_json,
             'isRevoked', is_revoked,
             'revokedAt', revoked_at,
             'revokedByName', revoked_by_name,
             'revokeReason', revoke_reason,
             'inProgressAt', in_progress_at,
             'savedAt', saved_at,
             'isSaved', is_saved,
             'attachmentCount', attachment_count,
             'syncStatus', sync_status,
             'lastSyncedAt', last_synced_at,
             'localUpdatedAt', local_updated_at
           ), COALESCE(updated_at, assigned_at, local_updated_at, CURRENT_TIMESTAMP)
           FROM tasks WHERE id = ?`,
          [taskId],
        );
      });
      if (shouldRebuildDashboard) {
        await this.rebuildDashboard(false);
      }
    } catch (error) {
      Logger.warn(
        TAG,
        `Failed to rebuild task projections for ${taskId}, triggering full rebuild`,
        error,
      );
      await this.rebuildAll();
      return;
    }
    if (shouldNotify) {
      this.notify({ type: 'task', taskId });
      if (shouldRebuildDashboard) {
        this.notify({ type: 'dashboard' });
      }
    }
  }

  async rebuildDashboard(shouldNotify: boolean = true): Promise<void> {
    // Wrap in transaction so dashboard is never empty between DELETE and INSERT
    await DatabaseService.transaction(async tx => {
      await tx.execute('DELETE FROM dashboard_projection WHERE id = 1');
      await tx.execute(
        `INSERT INTO dashboard_projection
         SELECT
           1,
           COALESCE(SUM(CASE WHEN status = 'ASSIGNED' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN is_saved = 1 AND status != 'COMPLETED' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
           (SELECT last_download_sync_at FROM sync_metadata WHERE id = 1),
           CURRENT_TIMESTAMP
         FROM tasks`,
      );
    });
    if (shouldNotify) {
      this.notify({ type: 'dashboard' });
    }
  }
}

export const ProjectionUpdater = new ProjectionUpdaterClass();
