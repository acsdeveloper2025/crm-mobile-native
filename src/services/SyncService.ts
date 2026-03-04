// SyncService - Orchestrates data sync between device and server
// Enforces strict ordering: Location -> Photos -> Form Payload -> Mark Sync -> Delete Local

import RNFS from 'react-native-fs';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { DatabaseService } from '../database/DatabaseService';
import { SyncQueue } from './SyncQueue';
import { NetworkService } from './NetworkService';
import { AuthService } from './AuthService';
import { LocationService } from './LocationService';
import { Logger } from '../utils/logger';
import { resolveFormTypeKey, type FormTypeKey } from '../utils/formTypeKey';
import { config } from '../config';
import type {
  MobileSyncDownloadResponse,
  MobileCaseResponse,
} from '../types/api';

const TAG = 'SyncService';

export interface SyncResult {
  success: boolean;
  uploadedItems: number;
  downloadedTasks: number;
  conflicts: number;
  errors: string[];
}

class SyncServiceClass {
  private syncInProgress = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  private async updateLocalSubmissionState(
    taskId: string | null | undefined,
    status: 'pending' | 'submitting' | 'success' | 'failed',
    error?: string | null,
    markCompleted: boolean = false,
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const rows = await DatabaseService.query<{ form_data_json: string | null }>(
      'SELECT form_data_json FROM tasks WHERE id = ?',
      [taskId],
    );

    const existing = rows[0]?.form_data_json;
    let formData: Record<string, unknown> = {};
    if (existing) {
      try {
        formData = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        formData = {};
      }
    }

    const nextFormData = {
      ...formData,
      __submission: {
        status,
        error: error || null,
        updatedAt: new Date().toISOString(),
      },
    };

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
        [
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
          JSON.stringify(nextFormData),
          taskId,
        ],
      );
      return;
    }

    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?, local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(nextFormData), new Date().toISOString(), taskId],
    );
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void {
    this.stopPeriodicSync();
    NetworkService.onNetworkChange(isOnline => {
      if (isOnline) {
        Logger.info(TAG, 'Network restored - triggering sync');
        this.performSync();
      }
    });

    this.syncTimer = setInterval(() => {
      if (NetworkService.getIsOnline()) {
        this.performSync();
      }
    }, intervalMs);

    Logger.info(TAG, `Periodic sync started (interval: ${intervalMs}ms)`);
  }

  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Verify internet by pinging backend health endpoint
   */
  private async isBackendReachable(): Promise<boolean> {
    try {
      if (!NetworkService.getIsOnline()) return false;
      const response = await ApiClient.get<{ status: string }>(ENDPOINTS.HEALTH, { timeout: 3000 });
      return response.status === 'OK' || response.status === 'ok';
    } catch {
      Logger.warn(TAG, 'Backend is unreachable despite network connection');
      return false;
    }
  }

  /**
   * Start Visit Location Validation
   * Validates if the agent's current location is within 100 meters of the case address.
   */
  async validateVisitStart(taskId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const taskRows = await DatabaseService.query<{ latitude: number | null; longitude: number | null }>(
        'SELECT latitude, longitude FROM tasks WHERE id = ?',
        [taskId],
      );

      if (taskRows.length === 0) {
        return { allowed: false, reason: 'Task not found' };
      }

      const caseLat = taskRows[0].latitude;
      const caseLng = taskRows[0].longitude;

      if (!caseLat || !caseLng) {
        // Fallback: If bank didn't provide coordinates, allow start (or block, depending on strictness)
        Logger.warn(TAG, `Task ${taskId} has no target coordinates. Allowing start.`);
        return { allowed: true };
      }

      const currentLocation = await LocationService.getCurrentLocation();
      if (!currentLocation) {
        return { allowed: false, reason: 'Unable to get current location' };
      }

      const distanceInMeters = LocationService.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        caseLat,
        caseLng,
      );

      Logger.info(TAG, `Distance to task ${taskId}: ${distanceInMeters.toFixed(2)} meters`);

      if (distanceInMeters > 100) {
        return { 
          allowed: false, 
          reason: `You are ${distanceInMeters.toFixed(0)} meters away. Must be within 100 meters to start.` 
        };
      }

      return { allowed: true };
    } catch (error) {
      Logger.error(TAG, 'Distance validation failed', error);
      return { allowed: false, reason: 'Failed to validate location geometry' };
    }
  }

  /**
   * Perform a full queue sync cycle
   */
  async performSync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { success: false, uploadedItems: 0, downloadedTasks: 0, conflicts: 0, errors: ['Sync in progress'] };
    }

    const reachable = await this.isBackendReachable();
    if (!reachable) {
      return { success: false, uploadedItems: 0, downloadedTasks: 0, conflicts: 0, errors: ['Backend unreachable'] };
    }

    this.syncInProgress = true;
    const errors: string[] = [];
    let uploadedItems = 0;
    let downloadedTasks = 0;
    let conflicts = 0;

    try {
      await this.updateSyncStatus(true);

      const uploadResult = await this.uploadPendingChanges();
      uploadedItems = uploadResult.uploaded;
      errors.push(...uploadResult.errors);

      const downloadResult = await this.downloadServerChanges();
      downloadedTasks = downloadResult.tasksDownloaded;
      conflicts = downloadResult.conflicts;
      errors.push(...downloadResult.errors);

      const templateResult = await this.downloadTemplates();
      errors.push(...templateResult.errors);

      await SyncQueue.cleanup(24);
      await this.updateSyncStatus(false);

      return { success: errors.length === 0, uploadedItems, downloadedTasks, conflicts, errors };
    } catch (error: any) {
      Logger.error(TAG, 'Sync failed', error);
      errors.push(error.message || 'Unknown error');
      return { success: false, uploadedItems, downloadedTasks, conflicts, errors };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Upload pending queue changes based on strict ordering
   */
  private async uploadPendingChanges(): Promise<{ uploaded: number; errors: string[] }> {
    const errors: string[] = [];
    let uploaded = 0;

    const pendingItems = await SyncQueue.getPendingItems(50);
    if (pendingItems.length === 0) return { uploaded: 0, errors: [] };

    // Group items by Visit/Task ID to enforce upload ordering.
    // Form submission must wait for both location sync and photo sync.

    for (const item of pendingItems) {
      try {
        await SyncQueue.markInProgress(item.id);
        const payload = JSON.parse(item.payloadJson);
        const taskId = item.entityType === 'FORM_SUBMISSION' || item.entityType === 'VISIT_PHOTO' ? payload.visitId || payload.taskId || item.entityId : null;

        // Strict Rule: If it's a form, Ensure NO pending photos exist for this task
        if (item.entityType === 'FORM_SUBMISSION' && taskId) {
           const pendingLocationsCount = await DatabaseService.count(
             'sync_queue',
             "entity_type = 'LOCATION' AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS') AND json_extract(payload_json, '$.taskId') = ?",
             [payload.localTaskId || taskId]
           );

           if (pendingLocationsCount > 0) {
             const msg = `Blocking form upload for ${taskId}: ${pendingLocationsCount} locations pending`;
             Logger.info(TAG, msg);
             await this.updateLocalSubmissionState(payload.localTaskId || null, 'pending');
             await SyncQueue.markPending(item.id, msg);
             continue;
           }

           const pendingPhotosCount = await DatabaseService.count(
             'sync_queue', 
             "entity_type IN ('VISIT_PHOTO', 'ATTACHMENT') AND status IN ('PENDING', 'FAILED', 'IN_PROGRESS') AND (json_extract(payload_json, '$.visitId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
             [taskId, taskId]
           );
           
           if (pendingPhotosCount > 0) {
             const msg = `Blocking form upload for ${taskId}: ${pendingPhotosCount} photos pending`;
             Logger.info(TAG, msg);
             await this.updateLocalSubmissionState(payload.localTaskId || null, 'pending');
             await SyncQueue.markPending(item.id, msg);
             continue; // Skip form, wait for photos
           }
         }

        if (item.entityType === 'FORM_SUBMISSION') {
          await this.updateLocalSubmissionState(payload.localTaskId || null, 'submitting');
        }

        let success = false;
        switch (item.entityType) {
          case 'FORM_SUBMISSION': success = await this.uploadFormSubmission(item.entityId, payload); break;
          case 'VISIT_PHOTO':
          case 'ATTACHMENT': success = await this.uploadAttachment(item.entityId, payload); break;
          case 'LOCATION': success = await this.uploadLocation(item.entityId, payload); break;
          case 'TASK': success = await this.uploadTaskUpdate(item.entityId, payload); break;
        }

        if (success) {
          await SyncQueue.markCompleted(item.id);
          uploaded++;
        } else {
          if (item.entityType === 'FORM_SUBMISSION') {
            await this.updateLocalSubmissionState(
              payload.localTaskId || null,
              'failed',
              'Form upload returned failure',
            );
          }
          await SyncQueue.markFailed(item.id, 'Upload returned failure');
        }
      } catch (error: any) {
         try {
           const payload = JSON.parse(item.payloadJson);
           if (item.entityType === 'FORM_SUBMISSION') {
             await this.updateLocalSubmissionState(
               payload.localTaskId || null,
               'failed',
               error.message || 'Upload crashed',
             );
           }
         } catch {
           // Ignore payload parse failures while handling upload errors
         }
         await SyncQueue.markFailed(item.id, error.message || 'Upload crashed');
         errors.push(`${item.entityType}/${item.entityId}: ${error.message}`);
      }
    }

    return { uploaded, errors };
  }

  private async resolveBackendAttachmentIds(
    localTaskId: string | null,
    fallbackIds: string[] = [],
  ): Promise<string[]> {
    if (!localTaskId) {
      return fallbackIds;
    }

    const rows = await DatabaseService.query<{ backend_attachment_id: string | null }>(
      `SELECT backend_attachment_id
       FROM attachments
       WHERE task_id = ?
         AND sync_status = 'SYNCED'
         AND backend_attachment_id IS NOT NULL`,
      [localTaskId],
    );

    const ids = rows
      .map(row => row.backend_attachment_id)
      .filter((value): value is string => Boolean(value));

    return ids.length > 0 ? ids : fallbackIds;
  }

  private async uploadFormSubmission(entityId: string, payload: any): Promise<boolean> {
    const taskId = payload.taskId || payload.visitId;
    const localTaskId = payload.localTaskId || null;
    const formType = resolveFormTypeKey({
      formType: typeof payload.formType === 'string' ? payload.formType : null,
      verificationTypeCode:
        typeof payload.verificationTypeCode === 'string'
          ? payload.verificationTypeCode
          : null,
      verificationTypeName:
        typeof payload.verificationTypeName === 'string'
          ? payload.verificationTypeName
          : null,
      verificationType:
        typeof payload.verificationType === 'string'
          ? payload.verificationType
          : null,
    });
    
    const endpointMap: Record<FormTypeKey, (id: string) => string> = {
      residence: ENDPOINTS.FORMS.RESIDENCE,
      office: ENDPOINTS.FORMS.OFFICE,
      business: ENDPOINTS.FORMS.BUSINESS,
      'residence-cum-office': ENDPOINTS.FORMS.RESIDENCE_CUM_OFFICE,
      'dsa-connector': ENDPOINTS.FORMS.DSA_CONNECTOR,
      builder: ENDPOINTS.FORMS.BUILDER,
      'property-individual': ENDPOINTS.FORMS.PROPERTY_INDIVIDUAL,
      'property-apf': ENDPOINTS.FORMS.PROPERTY_APF,
      noc: ENDPOINTS.FORMS.NOC,
    };

    if (!formType) return false;
    const getEndpoint = endpointMap[formType];
    if (!getEndpoint) return false;

    payload.attachmentIds = await this.resolveBackendAttachmentIds(
      localTaskId,
      Array.isArray(payload.attachmentIds) ? payload.attachmentIds : [],
    );
    delete payload.images;

    if (localTaskId) {
      await DatabaseService.execute(
        'UPDATE form_submissions SET attachment_ids_json = ? WHERE id = ?',
        [JSON.stringify(payload.attachmentIds), entityId],
      );
    }

    // Strict Rule: Upload Form
    const response = await ApiClient.post<{ success: boolean }>(getEndpoint(taskId), payload);
    
    // Strict Rule: Cleanup local photos ONLY on success
    if (response.success && taskId) {
      if (localTaskId) {
        await this.cleanupSyncedPhotosForTask(localTaskId);
      }
      await DatabaseService.execute(
        "UPDATE form_submissions SET sync_status = 'SYNCED', status = 'SYNCED' WHERE id = ?",
        [entityId]
      );
      if (localTaskId) {
        await this.updateLocalSubmissionState(localTaskId, 'success', null, true);
      }
      // D3: Clean up auto-saved form data from SQLite key_value_store
      await DatabaseService.execute(
        "DELETE FROM key_value_store WHERE key = ?",
        [`auto_save_${localTaskId || taskId}`]
      );
    }
    
    return response.success;
  }

  private async cleanupSyncedPhotosForTask(taskId: string): Promise<void> {
    const photos = await DatabaseService.query<{ id: string; local_path: string }>(
      "SELECT id, local_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
      [taskId]
    );

    for (const photo of photos) {
      try {
        const exists = await RNFS.exists(photo.local_path);
        if (exists) await RNFS.unlink(photo.local_path);
        await DatabaseService.execute("DELETE FROM attachments WHERE id = ?", [photo.id]);
      } catch {
        Logger.warn(TAG, `Failed cleaning up photo ${photo.id}`);
      }
    }
  }

  private async uploadAttachment(entityId: string, payload: any): Promise<boolean> {
    const taskId = payload.visitId || payload.taskId;
    const localPath = payload.localPath;
    
    try {
      const exists = await RNFS.exists(localPath);
      if (!exists) {
        // Mark as synced if file already gone, to unblock queue
        Logger.warn(TAG, `Photo file missing: ${localPath}`);
        await DatabaseService.execute("UPDATE attachments SET sync_status = 'SYNCED' WHERE id = ?", [payload.id]);
        return true; 
      }

      // Read file directly from path using multipart form data
      const formData = new FormData();
      formData.append('files', {
        uri: `file://${localPath}`,
        type: payload.mimeType || 'image/jpeg',
        name: payload.filename || `${payload.id}.jpg`
      } as any);
      formData.append(
        'photoType',
        payload.photoType || (payload.componentType === 'selfie' ? 'selfie' : 'verification'),
      );
      if (payload.verificationType) {
        formData.append('verificationType', String(payload.verificationType));
      }
      if (payload.submissionId) {
        formData.append('submissionId', String(payload.submissionId));
      }

      // Support both flat and nested geo data structures
      const lat = payload.geoLocation?.latitude ?? payload.latitude;
      const lng = payload.geoLocation?.longitude ?? payload.longitude;
      formData.append('geoLocation', JSON.stringify({
        latitude: lat ?? null,
        longitude: lng ?? null,
        accuracy: payload.geoLocation?.accuracy ?? payload.accuracy ?? 0,
        timestamp: payload.geoLocation?.timestamp || new Date().toISOString(),
      }));

      // NOTE: Configure your ApiClient or fetch directly here
      // For now we use ApiClient which must be made capable of FormData
      const response = await ApiClient.post<{
        success: boolean;
        data?: {
          attachments?: Array<{
            id: string;
            url?: string;
          }>;
        };
      }>(
        ENDPOINTS.ATTACHMENTS.UPLOAD(taskId),
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      if (response.success) {
        const uploadedAttachment = response.data?.attachments?.[0];
        await DatabaseService.execute(
          `UPDATE attachments
           SET sync_status = 'SYNCED',
               backend_attachment_id = COALESCE(?, backend_attachment_id),
               remote_path = COALESCE(?, remote_path),
               last_sync_attempt_at = ?
           WHERE id = ?`,
          [
            uploadedAttachment?.id || null,
            uploadedAttachment?.url || null,
            new Date().toISOString(),
            payload.id,
          ],
        );
        return true;
      }
      return false;
    } catch (e) {
      Logger.error(TAG, 'Photo upload failed', e);
      return false;
    }
  }

  private async uploadLocation(entityId: string, payload: any): Promise<boolean> {
    try {
      const response = await ApiClient.post<{ success: boolean }>(
        ENDPOINTS.LOCATION.CAPTURE,
        payload,
      );

      if (response.success) {
        await DatabaseService.execute(
          "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), entityId],
        );
      }

      return response.success;
    } catch (error: any) {
      const errorCode = error?.response?.data?.error?.code;
      const statusCode = error?.response?.status;

      if (
        statusCode === 409 &&
        errorCode === 'LOCATION_ALREADY_CAPTURED_FOR_TASK'
      ) {
        Logger.info(
          TAG,
          `Location ${entityId} already exists on backend; marking as synced locally.`,
        );
        await DatabaseService.execute(
          "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
          [new Date().toISOString(), entityId],
        );
        return true;
      }

      throw error;
    }
  }

  private async uploadTaskUpdate(entityId: string, payload: any): Promise<boolean> {
    let response: { success: boolean } | null = null;

    if (payload.action === 'start') {
      response = await ApiClient.post<{ success: boolean }>(ENDPOINTS.TASKS.START(entityId), payload);
    } else if (payload.action === 'complete') {
      response = await ApiClient.post<{ success: boolean }>(ENDPOINTS.TASKS.COMPLETE(entityId), payload);
    } else if (payload.action === 'revoke') {
      response = await ApiClient.post<{ success: boolean }>(ENDPOINTS.TASKS.REVOKE(entityId), payload);
    } else if (payload.action === 'priority') {
      response = await ApiClient.put<{ success: boolean }>(
        ENDPOINTS.TASKS.PRIORITY(entityId),
        { priority: payload.priority },
      );
    }

    if (!response?.success) {
      return false;
    }

    if (payload.localTaskId) {
      await DatabaseService.execute(
        "UPDATE tasks SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?",
        [new Date().toISOString(), payload.localTaskId],
      );
    }

    return true;
  }

  private async downloadServerChanges(): Promise<{ tasksDownloaded: number; conflicts: number; errors: string[] }> {
    const errors: string[] = [];
    try {
      const syncMeta = await DatabaseService.query<{ last_download_sync_at: string | null }>('SELECT last_download_sync_at FROM sync_metadata WHERE id = 1');
      const lastSyncAt = syncMeta[0]?.last_download_sync_at || '';
      let tasksDownloaded = 0;
      let conflicts = 0;
      let offset = 0;
      let hasMore = true;
      let latestSyncTimestamp = lastSyncAt;
      const limit = config.syncBatchSize;

      while (hasMore) {
        const response = await ApiClient.get<{
          success: boolean;
          data?: MobileSyncDownloadResponse;
        }>(
          `${ENDPOINTS.SYNC.DOWNLOAD}?lastSyncTimestamp=${encodeURIComponent(lastSyncAt)}&limit=${limit}&offset=${offset}`,
        );
        const payload = response.data;

        if (!response.success || !payload) {
          throw new Error('Invalid sync download response');
        }

        for (const task of payload.cases) {
          await this.upsertTaskFromServer(task);
          tasksDownloaded++;
        }

        for (const taskId of payload.revokedAssignmentIds || []) {
          await DatabaseService.execute(
            "DELETE FROM tasks WHERE verification_task_id = ?",
            [taskId],
          );
        }

        for (const taskId of payload.deletedTaskIds || []) {
          await DatabaseService.execute(
            'DELETE FROM tasks WHERE id = ? OR verification_task_id = ?',
            [taskId, taskId],
          );
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
      }

      await DatabaseService.execute(
        `INSERT OR REPLACE INTO sync_metadata (id, last_download_sync_at, device_id, sync_in_progress)
         VALUES (1, ?, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1), 0)`,
        [latestSyncTimestamp],
      );

      return { tasksDownloaded, conflicts, errors };
    } catch (error: any) {
      errors.push(`Download failed: ${error.message}`);
      return { tasksDownloaded: 0, conflicts: 0, errors };
    }
  }

  private async downloadTemplates(): Promise<{ downloaded: number; errors: string[] }> {
    Logger.info(
      TAG,
      'Bulk template download skipped: backend exposes per-form templates only.',
    );
    return { downloaded: 0, errors: [] };
  }

  private async upsertTaskFromServer(task: MobileCaseResponse): Promise<void> {
    const now = new Date().toISOString();
    await DatabaseService.execute(
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
        task.id, task.caseId, task.verificationTaskId || task.id, task.verificationTaskNumber || '', task.title, task.description || '', task.customerName, task.customerCallingCode || null,
        task.customerPhone || null, task.customerEmail || null, task.addressStreet || '', task.addressCity || '', task.addressState || '', task.addressPincode || '', task.latitude || null, task.longitude || null,
        task.status, task.priority || 'MEDIUM', task.assignedAt || now, task.updatedAt || now, task.completedAt || null, task.notes || null, task.verificationType || null, task.verificationOutcome || null, task.applicantType || null,
        task.backendContactNumber || null, task.createdByBackendUser || null, task.assignedToFieldUser || null, task.client?.id || null, task.client?.name || null, task.client?.code || null,
        task.product?.id || null, task.product?.name || null, task.product?.code || null, task.verificationTypeDetails?.id || null, task.verificationTypeDetails?.name || null, task.verificationTypeDetails?.code || null,
        task.formData ? JSON.stringify(task.formData) : null, task.isRevoked ? 1 : 0, task.revokedAt || null, task.revokedByName || null, task.revokeReason || null,
        task.inProgressAt || null, task.savedAt || null, task.isSaved ? 1 : 0, task.attachmentCount || 0,
        now, now,
      ],
    );
  }

  private async updateSyncStatus(inProgress: boolean): Promise<void> {
    const deviceInfo = await AuthService.getDeviceInfo();
    const now = new Date().toISOString();
    await DatabaseService.execute(
      `INSERT OR REPLACE INTO sync_metadata (id, device_id, sync_in_progress, last_upload_sync_at)
       VALUES (1, ?, ?, ?)`,
      [deviceInfo.deviceId, inProgress ? 1 : 0, now],
    );
  }

  isSyncing(): boolean { return this.syncInProgress; }

  async getSyncStatus(): Promise<{ pendingItems: number; lastSyncAt: string | null; isSyncing: boolean }> {
    const pendingItems = await SyncQueue.getPendingCount();
    const syncMeta = await DatabaseService.query<{ last_download_sync_at: string | null }>('SELECT last_download_sync_at FROM sync_metadata WHERE id = 1');
    return { pendingItems, lastSyncAt: syncMeta[0]?.last_download_sync_at || null, isSyncing: this.syncInProgress };
  }
}

export const SyncService = new SyncServiceClass();
export default SyncService;
