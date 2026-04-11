import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { validateResponse } from '../api/schemas/runtime';
import { MobileSyncDownloadResponseSchema } from '../api/schemas/sync.schema';
import { config } from '../config';
import { DatabaseService } from '../database/DatabaseService';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import { notificationService } from '../services/NotificationService';
import { Logger } from '../utils/logger';
import { syncConflictResolver } from './SyncConflictResolver';
import type {
  MobileCaseResponse,
  MobileSyncDownloadResponse,
} from '../types/api';

const TAG = 'SyncDownloadService';

export interface SyncDownloadResult {
  tasksDownloaded: number;
  conflicts: number;
  errors: string[];
}

class SyncDownloadServiceClass {
  async downloadServerChanges(): Promise<SyncDownloadResult> {
    const errors: string[] = [];
    // Hoisted so the `finally` block can always clear sync_in_progress using
    // the latest known sync timestamp — even on mid-download errors.
    let latestSyncTimestamp = '';
    try {
      const syncMeta = await SyncEngineRepository.query<{
        lastDownloadSyncAt: string | null;
      }>('SELECT last_download_sync_at FROM sync_metadata WHERE id = 1');
      const lastSyncAt = syncMeta[0]?.lastDownloadSyncAt || '';
      let tasksDownloaded = 0;
      let conflicts = 0;
      let offset = 0;
      let hasMore = true;
      latestSyncTimestamp = lastSyncAt;
      const limit = config.syncBatchSize;

      while (hasMore) {
        const response = await ApiClient.get<{
          success: boolean;
          data?: MobileSyncDownloadResponse;
        }>(
          `${ENDPOINTS.SYNC.DOWNLOAD}?lastSyncTimestamp=${encodeURIComponent(
            lastSyncAt,
          )}&limit=${limit}&offset=${offset}`,
        );
        const payload = response.data;
        if (!response.success || !payload) {
          throw new Error('Invalid sync download response');
        }
        // Drift detection at the sync boundary: non-strict so a brand-new
        // field on the backend never bricks a field agent mid-shift.
        // Validation warnings land in telemetry and show up in the next
        // log batch for the team to investigate.
        validateResponse(MobileSyncDownloadResponseSchema, payload, {
          service: 'sync',
          endpoint: 'GET /sync/download',
        });

        for (const task of payload.cases) {
          const canonicalTaskId = (
            task.verificationTaskId ||
            task.id ||
            ''
          ).trim();
          const existingRows = canonicalTaskId
            ? await SyncEngineRepository.query<{ id: string }>(
                'SELECT id FROM tasks WHERE id = ? LIMIT 1',
                [canonicalTaskId],
              )
            : [];
          const isNewTaskAssignment =
            canonicalTaskId && existingRows.length === 0;

          await this.upsertTaskFromServer(task);
          await ProjectionUpdater.rebuildTask(canonicalTaskId);
          tasksDownloaded++;

          if (isNewTaskAssignment && canonicalTaskId) {
            await this.createLocalAssignmentNotification(task, canonicalTaskId);
          }
        }

        for (const taskId of payload.revokedAssignmentIds || []) {
          // Only delete SYNCED child records — preserve PENDING ones to prevent data loss.
          // Unsynced attachments/forms represent work the user hasn't uploaded yet.
          const taskRows = await SyncEngineRepository.query<{ id: string }>(
            'SELECT id FROM tasks WHERE verification_task_id = ?',
            [taskId],
          );
          for (const row of taskRows) {
            await SyncEngineRepository.execute(
              "DELETE FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
              [row.id],
            );
            await SyncEngineRepository.execute(
              'DELETE FROM locations WHERE task_id = ?',
              [row.id],
            );
            await SyncEngineRepository.execute(
              "DELETE FROM form_submissions WHERE task_id = ? AND sync_status = 'SYNCED'",
              [row.id],
            );
          }
          await SyncEngineRepository.execute(
            'DELETE FROM tasks WHERE verification_task_id = ?',
            [taskId],
          );
          await ProjectionUpdater.rebuildTask(taskId);
        }
        for (const taskId of payload.deletedTaskIds || []) {
          // Only delete SYNCED child records — preserve PENDING ones to prevent data loss
          await SyncEngineRepository.execute(
            "DELETE FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
            [taskId],
          );
          await SyncEngineRepository.execute(
            'DELETE FROM locations WHERE task_id = ?',
            [taskId],
          );
          await SyncEngineRepository.execute(
            "DELETE FROM form_submissions WHERE task_id = ? AND sync_status = 'SYNCED'",
            [taskId],
          );
          await SyncEngineRepository.execute(
            'DELETE FROM tasks WHERE id = ? OR verification_task_id = ?',
            [taskId, taskId],
          );
          await ProjectionUpdater.rebuildTask(taskId);
        }

        conflicts += payload.conflicts?.length || 0;
        latestSyncTimestamp = payload.syncTimestamp || latestSyncTimestamp;
        const pageSize = payload.cases.length;
        hasMore = Boolean(payload.hasMore);
        if (hasMore && pageSize === 0) {
          hasMore = false;
          break;
        }
        offset += pageSize;

        // Update sync timestamp per page so a mid-download crash doesn't
        // re-download all pages from scratch. Pages already processed won't
        // cause duplicates thanks to upsertTaskFromServer using INSERT OR REPLACE.
        await SyncEngineRepository.execute(
          `INSERT OR REPLACE INTO sync_metadata (id, last_download_sync_at, device_id, sync_in_progress)
           VALUES (1, ?, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1), 1)`,
          [latestSyncTimestamp],
        );
      }

      await ProjectionUpdater.rebuildDashboard();

      return { tasksDownloaded, conflicts, errors };
    } catch (error: unknown) {
      errors.push(
        `Download failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { tasksDownloaded: 0, conflicts: 0, errors };
    } finally {
      // ALWAYS clear sync_in_progress flag, even on mid-download errors, so the
      // watchdog / UI doesn't see a stuck "syncing" state on the next app launch.
      try {
        await SyncEngineRepository.execute(
          `INSERT OR REPLACE INTO sync_metadata (id, last_download_sync_at, device_id, sync_in_progress)
           VALUES (1, ?, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1), 0)`,
          [latestSyncTimestamp],
        );
      } catch (flagError) {
        Logger.error(TAG, 'Failed to clear sync_in_progress flag', flagError);
      }
    }
  }

  async downloadTemplates(): Promise<{ downloaded: number; errors: string[] }> {
    Logger.info(
      TAG,
      'Bulk template download skipped: backend exposes per-form templates only.',
    );
    return { downloaded: 0, errors: [] };
  }

  private async createLocalAssignmentNotification(
    task: MobileCaseResponse,
    taskId: string,
  ): Promise<void> {
    try {
      const existing = await SyncEngineRepository.query<{ id: string }>(
        "SELECT id FROM notifications WHERE type = 'CASE_ASSIGNED' AND task_id = ? LIMIT 1",
        [taskId],
      );
      if (existing.length > 0) {
        return;
      }

      const taskNumber =
        (task.verificationTaskNumber || '').trim() || taskId.slice(0, 8);
      const customerName = (task.customerName || '').trim() || 'Customer';
      const caseNumber =
        task.caseId !== undefined && task.caseId !== null
          ? String(task.caseId)
          : undefined;

      await notificationService.addNotification({
        type: 'CASE_ASSIGNED',
        title: 'New Task Assigned',
        message: `${taskNumber} - ${customerName}`,
        priority: 'HIGH',
        taskId,
        caseNumber,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      Logger.warn(
        TAG,
        `Failed to create local assignment notification for task ${taskId}`,
        error,
      );
    }
  }

  private async upsertTaskFromServer(task: MobileCaseResponse): Promise<void> {
    const canonicalTaskId = (task.verificationTaskId || task.id || '').trim();
    if (!canonicalTaskId) {
      Logger.warn(
        TAG,
        `Skipping task upsert due to missing task identifier for case ${task.caseId}`,
      );
      return;
    }

    // Wrap the entire upsert (stale row migration + insert/replace) in a
    // transaction to prevent orphaned FK records if a crash occurs mid-way.
    await DatabaseService.transaction(async () => {
      const staleRows = await SyncEngineRepository.query<{ id: string }>(
        `SELECT id
       FROM tasks
       WHERE case_id = ?
         AND id != ?`,
        [task.caseId, canonicalTaskId],
      );

      for (const stale of staleRows) {
        await SyncEngineRepository.execute(
          'UPDATE attachments SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await SyncEngineRepository.execute(
          'UPDATE locations SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await SyncEngineRepository.execute(
          'UPDATE form_submissions SET task_id = ? WHERE task_id = ?',
          [canonicalTaskId, stale.id],
        );
        await SyncEngineRepository.execute(
          "UPDATE sync_queue SET entity_id = ? WHERE entity_type IN ('TASK', 'TASK_STATUS') AND entity_id = ?",
          [canonicalTaskId, stale.id],
        );
        await SyncEngineRepository.execute('DELETE FROM tasks WHERE id = ?', [
          stale.id,
        ]);
      }

      const existingRows = await SyncEngineRepository.query<{
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

      // Check for in-flight queue items to avoid overwriting pending local changes
      const hasQueuedChanges = await syncConflictResolver.hasInFlightQueueItems(
        canonicalTaskId,
      );

      const mergedState = syncConflictResolver.resolveTaskState(
        task,
        existingRows[0]
          ? {
              status: existingRows[0].status,
              isSaved: existingRows[0].isSaved === 1,
              inProgressAt: existingRows[0].inProgressAt,
              savedAt: existingRows[0].savedAt,
              completedAt: existingRows[0].completedAt,
              syncStatus: existingRows[0].syncStatus,
            }
          : null,
        hasQueuedChanges,
      );

      const now = new Date().toISOString();
      await SyncEngineRepository.execute(
        `INSERT INTO tasks
        (id, case_id, verification_task_id, verification_task_number, title, description, customer_name, customer_calling_code,
         customer_phone, customer_email, address_street, address_city, address_state, address_pincode, latitude, longitude,
         status, priority, assigned_at, updated_at, completed_at, notes, verification_type, verification_outcome, applicant_type,
         backend_contact_number, created_by_backend_user, assigned_to_field_user, client_id, client_name, client_code,
         product_id, product_name, product_code, verification_type_id, verification_type_name, verification_type_code,
         form_data_json, is_revoked, revoked_at, revoked_by_name, revoke_reason,
         in_progress_at, saved_at, is_saved, attachment_count,
         sync_status, last_synced_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         case_id = excluded.case_id,
         verification_task_id = excluded.verification_task_id,
         verification_task_number = excluded.verification_task_number,
         title = excluded.title,
         description = excluded.description,
         customer_name = excluded.customer_name,
         customer_calling_code = excluded.customer_calling_code,
         customer_phone = excluded.customer_phone,
         customer_email = excluded.customer_email,
         address_street = excluded.address_street,
         address_city = excluded.address_city,
         address_state = excluded.address_state,
         address_pincode = excluded.address_pincode,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         status = excluded.status,
         priority = excluded.priority,
         assigned_at = excluded.assigned_at,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at,
         notes = excluded.notes,
         verification_type = excluded.verification_type,
         verification_outcome = excluded.verification_outcome,
         applicant_type = excluded.applicant_type,
         backend_contact_number = excluded.backend_contact_number,
         created_by_backend_user = excluded.created_by_backend_user,
         assigned_to_field_user = excluded.assigned_to_field_user,
         client_id = excluded.client_id,
         client_name = excluded.client_name,
         client_code = excluded.client_code,
         product_id = excluded.product_id,
         product_name = excluded.product_name,
         product_code = excluded.product_code,
         verification_type_id = excluded.verification_type_id,
         verification_type_name = excluded.verification_type_name,
         verification_type_code = excluded.verification_type_code,
         form_data_json = excluded.form_data_json,
         is_revoked = excluded.is_revoked,
         revoked_at = excluded.revoked_at,
         revoked_by_name = excluded.revoked_by_name,
         revoke_reason = excluded.revoke_reason,
         in_progress_at = excluded.in_progress_at,
         saved_at = excluded.saved_at,
         is_saved = excluded.is_saved,
         attachment_count = excluded.attachment_count,
         sync_status = 'SYNCED',
         last_synced_at = excluded.last_synced_at,
         local_updated_at = excluded.local_updated_at`,
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
          mergedState.status,
          task.priority || 'MEDIUM',
          task.assignedAt || now,
          task.updatedAt || now,
          mergedState.completedAt,
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
          mergedState.inProgressAt,
          mergedState.savedAt,
          mergedState.isSaved,
          task.attachmentCount || 0,
          now,
          now,
        ],
      );
    }); // end transaction
  }
}

export const SyncDownloadService = new SyncDownloadServiceClass();
