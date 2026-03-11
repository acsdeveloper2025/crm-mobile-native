import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';

const TAG = 'ProjectionUpdater';

class ProjectionUpdaterClass {
  private rebuilding = false;

  async rebuildAll(): Promise<void> {
    if (this.rebuilding) {
      return;
    }
    this.rebuilding = true;
    try {
      await DatabaseService.transaction(async tx => {
        await tx.executeSql('DELETE FROM task_list_projection');
        await tx.executeSql(
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

        await tx.executeSql('DELETE FROM task_detail_projection');
        await tx.executeSql(
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
             'is_revoked', is_revoked,
             'revoked_at', revoked_at,
             'revoked_by_name', revoked_by_name,
             'revoke_reason', revoke_reason,
             'in_progress_at', in_progress_at,
             'saved_at', saved_at,
             'is_saved', is_saved,
             'attachment_count', attachment_count,
             'syncStatus', sync_status,
             'lastSyncedAt', last_synced_at,
             'localUpdatedAt', local_updated_at
           ), COALESCE(updated_at, assigned_at, local_updated_at, CURRENT_TIMESTAMP)
           FROM tasks`,
        );

        await tx.executeSql('DELETE FROM dashboard_projection');
        await tx.executeSql(
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
  }

  async rebuildTask(taskId: string): Promise<void> {
    try {
      await DatabaseService.transaction(async tx => {
        await tx.executeSql('DELETE FROM task_list_projection WHERE id = ?', [taskId]);
        await tx.executeSql(
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
        await tx.executeSql('DELETE FROM task_detail_projection WHERE id = ?', [taskId]);
        await tx.executeSql(
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
             'is_revoked', is_revoked,
             'revoked_at', revoked_at,
             'revoked_by_name', revoked_by_name,
             'revoke_reason', revoke_reason,
             'in_progress_at', in_progress_at,
             'saved_at', saved_at,
             'is_saved', is_saved,
             'attachment_count', attachment_count,
             'syncStatus', sync_status,
             'lastSyncedAt', last_synced_at,
             'localUpdatedAt', local_updated_at
           ), COALESCE(updated_at, assigned_at, local_updated_at, CURRENT_TIMESTAMP)
           FROM tasks WHERE id = ?`,
          [taskId],
        );
      });
      await this.rebuildDashboard();
    } catch (error) {
      Logger.warn(TAG, `Failed to rebuild task projections for ${taskId}, triggering full rebuild`, error);
      await this.rebuildAll();
    }
  }

  async rebuildDashboard(): Promise<void> {
    await DatabaseService.execute('DELETE FROM dashboard_projection WHERE id = 1');
    await DatabaseService.execute(
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
  }
}

export const ProjectionUpdater = new ProjectionUpdaterClass();
