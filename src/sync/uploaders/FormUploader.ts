import RNFS from 'react-native-fs';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { DatabaseService } from '../../database/DatabaseService';
import { SyncEngineRepository } from '../../repositories/SyncEngineRepository';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';
import { Logger } from '../../utils/logger';
import { resolveFormTypeKey, type FormTypeKey } from '../../utils/formTypeKey';
import { NetworkService } from '../../services/NetworkService';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'FormUploader';

class FormUploaderClass {
  private async updateLocalSubmissionState(
    taskId: string | null | undefined,
    status: 'pending' | 'submitting' | 'success' | 'failed',
    error?: string | null,
    markCompleted: boolean = false,
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const rows = await SyncEngineRepository.query<{
      formDataJson: string | null;
    }>('SELECT form_data_json FROM tasks WHERE id = ?', [taskId]);

    const existing = rows[0]?.formDataJson;
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

    const now = new Date().toISOString();
    if (markCompleted) {
      await SyncEngineRepository.execute(
        `UPDATE tasks
         SET status = 'COMPLETED',
             completed_at = ?,
             sync_status = 'SYNCED',
             last_synced_at = ?,
             local_updated_at = ?,
             form_data_json = ?
         WHERE id = ?`,
        [now, now, now, JSON.stringify(nextFormData), taskId],
      );
      return;
    }

    await SyncEngineRepository.execute(
      `UPDATE tasks
       SET form_data_json = ?, local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(nextFormData), now, taskId],
    );
  }

  private async resolveBackendAttachmentIds(
    localTaskId: string | null,
    fallbackIds: string[] = [],
  ): Promise<string[]> {
    if (!localTaskId) {
      return fallbackIds;
    }

    const rows = await SyncEngineRepository.query<{
      backendAttachmentId: string | null;
    }>(
      `SELECT backend_attachment_id
       FROM attachments
       WHERE task_id = ?
         AND sync_status = 'SYNCED'
         AND backend_attachment_id IS NOT NULL`,
      [localTaskId],
    );

    const ids = rows
      .map(row => row.backendAttachmentId)
      .filter((value): value is string => Boolean(value));

    return ids.length > 0 ? ids : fallbackIds;
  }

  private async cleanupSyncedPhotosForTask(taskId: string): Promise<void> {
    // Only clean up disk files for fully synced photos that also have a
    // backend_attachment_id (confirmed by server). Keep the DB records so the
    // PhotoGallery can still show them via remote URLs if needed.
    const photos = await SyncEngineRepository.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      "SELECT id, local_path, thumbnail_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED' AND backend_attachment_id IS NOT NULL",
      [taskId],
    );

    for (const photo of photos) {
      try {
        if (await RNFS.exists(photo.localPath)) {
          await RNFS.unlink(photo.localPath);
        }
        if (photo.thumbnailPath && (await RNFS.exists(photo.thumbnailPath))) {
          await RNFS.unlink(photo.thumbnailPath);
        }
        // Clear local paths but keep record for history — user can still see via remote URL
        await SyncEngineRepository.execute(
          "UPDATE attachments SET local_path = '', thumbnail_path = NULL WHERE id = ?",
          [photo.id],
        );
      } catch {
        Logger.warn(TAG, `Failed cleaning up photo ${photo.id}`);
      }
    }
  }

  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const payload = { ...operation.payload };
    const taskId = String(payload.taskId || payload.visitId || '');
    const localTaskId =
      typeof payload.localTaskId === 'string' ? payload.localTaskId : null;

    // 2026-05-01 retention v2: pre-upload existence guard. If the
    // form_submissions row was cascade-deleted by tier-2 task cleanup
    // between enqueue and dequeue, the queue item points at a ghost
    // entity. Drop it cleanly; the user-visible work the form
    // represented is already gone with its parent task.
    const formExists = await SyncEngineRepository.query<{ id: string }>(
      'SELECT id FROM form_submissions WHERE id = ? LIMIT 1',
      [operation.entityId],
    );
    if (formExists.length === 0) {
      Logger.info(
        TAG,
        `form_submission ${operation.entityId} cleanup-deleted; dropping sync_queue item`,
      );
      return { outcome: 'SUCCESS' };
    }

    if (localTaskId) {
      // Track defer count to prevent infinite blocking when photos permanently fail
      const deferCount =
        typeof payload._deferCount === 'number' ? payload._deferCount : 0;
      const MAX_DEFERS = 15; // After 15 defers (~75 min at 5-min sync), upload with available photos

      // Location sync removed — GPS is in photo watermarks only.
      // Only defer for pending photo uploads.
      const pendingPhotosCount = await SyncEngineRepository.count(
        'sync_queue',
        "entity_type IN ('VISIT_PHOTO', 'ATTACHMENT') AND status IN ('PENDING', 'IN_PROGRESS') AND (json_extract(payload_json, '$.visitId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
        [taskId, taskId],
      );
      if (pendingPhotosCount > 0 && deferCount < MAX_DEFERS) {
        // Go-live hardening: if we're offline right now, defer without
        // incrementing. A truly offline device must not burn through the
        // defer cap just by being disconnected — doing so used to trigger
        // a partial-attachment upload after ~75 min.
        const isOnline = NetworkService.getIsOnline();
        const nextDeferCount = isOnline ? deferCount + 1 : deferCount;
        const error = `Blocking form upload for ${taskId}: ${pendingPhotosCount} photos pending (defer ${nextDeferCount}/${MAX_DEFERS}${
          isOnline ? '' : ', offline — not counted'
        })`;
        payload._deferCount = nextDeferCount;
        // D2 (audit 2026-04-21 round 2): previously the counter was
        // mutated on a spread copy of `operation.payload` and the queue
        // row was never updated. On the next retry the old `deferCount`
        // was re-read from SQLite so `MAX_DEFERS` never tripped — forms
        // with permanently-failed attachments deferred forever and the
        // promised `'failed'` state never surfaced.
        await SyncQueueRepository.updatePayload(
          operation.queueId,
          JSON.stringify({ ...operation.payload, _deferCount: nextDeferCount }),
        );
        await this.updateLocalSubmissionState(localTaskId, 'pending');
        return { outcome: 'DEFER', error };
      }

      if (deferCount >= MAX_DEFERS) {
        // Reached the cap while online with photos still pending. Rather
        // than uploading an incomplete attachment set (which backend will
        // reject as < 5 photos anyway) we fail loudly so the user sees a
        // recoverable error and can retry once the photos sync.
        await this.updateLocalSubmissionState(
          localTaskId,
          'failed',
          'Photos could not be uploaded after repeated retries — please retry submission once all photos have uploaded',
        );
        return {
          outcome: 'FAILURE',
          error: `Exceeded max defers (${MAX_DEFERS}) for ${taskId} with photos still pending`,
        };
      }
    }

    await this.updateLocalSubmissionState(localTaskId, 'submitting');
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

    if (!formType || !endpointMap[formType]) {
      return { outcome: 'FAILURE', error: 'Unsupported form type for sync' };
    }

    payload.attachmentIds = await this.resolveBackendAttachmentIds(
      localTaskId,
      Array.isArray(payload.attachmentIds)
        ? (payload.attachmentIds as string[])
        : [],
    );
    delete payload.images;

    if (localTaskId) {
      await SyncEngineRepository.execute(
        'UPDATE form_submissions SET attachment_ids_json = ? WHERE id = ?',
        [JSON.stringify(payload.attachmentIds), operation.entityId],
      );
    }

    // 2026-05-02 diagnostic: log the form payload keys before posting
    // to surface the empty-formData bug we're chasing.
    const fdKeys = payload.formData
      ? Object.keys(payload.formData as Record<string, unknown>)
      : [];
    Logger.info(
      TAG,
      `🔍 POST formData keys (count=${fdKeys.length}): ${fdKeys.join(',')}`,
    );
    Logger.info(
      TAG,
      `🔍 POST finalStatus: ${JSON.stringify(
        (payload.formData as Record<string, unknown> | undefined)?.finalStatus,
      )}`,
    );

    let response: { success: boolean };
    try {
      response = await ApiClient.post<{ success: boolean }>(
        endpointMap[formType](taskId),
        payload,
        idempotencyHeaders(operation.operationId),
      );
    } catch (uploadError: unknown) {
      // 2026-04-26: removed blanket `if (status === 409) → SUCCESS` swallow.
      //
      // The previous logic assumed every 409 from a form-submission endpoint
      // meant "your form is already on the server, safe to mark SYNCED."
      // That invariant was false on every actual 409 source:
      //   - controller TASK_SUPERSEDED_OR_REVOKED (4 sites in mobileFormController) — task was killed, no submission exists
      //   - middleware IDEMPOTENCY_KEY_CONFLICT — same key, different body, real conflict
      //   - middleware IDEMPOTENCY_KEY_IN_PROGRESS — orphan reservation from a prior 5xx (data NOT committed)
      //
      // Successful idempotent replays return 200 with the cached success
      // body, NOT 409 — the success path is unaffected by removing this
      // branch. See project_form_field_mapping_drift_audit.md for the
      // case 1 incident (2026-04-25) where the swallow caused silent
      // data loss + photo deletion.
      //
      // All non-2xx are now thrown to SyncProcessor's catch, which routes
      // through markFailed → exponential backoff → eventual DLQ. The user
      // sees "Upload Failed" badge on TaskDetail and can tap Resubmit.
      throw uploadError;
    }

    if (!response.success) {
      await this.updateLocalSubmissionState(
        localTaskId,
        'failed',
        'Form upload returned failure',
      );
      return { outcome: 'FAILURE', error: 'Form upload returned failure' };
    }

    // 2026-04-27 deep-audit fix (D1): the prior wrap looked atomic but
    // wasn't — `updateLocalSubmissionState` and `SyncEngineRepository.execute`
    // both route through `DatabaseService.execute` (the main pool), NOT
    // through `tx.execute`, so the writes fired OUTSIDE the transaction
    // context while the wrap waited (see DatabaseService.ts:493-498). A
    // crash between the `tasks` UPDATE and the `form_submissions` UPDATE
    // left the task COMPLETED but form_submissions still PENDING — exactly
    // the cross-table state-machine divergence the wrap was supposed to
    // prevent. Now uses `tx.execute` for both writes inside one real
    // atomic transaction. The SELECT-then-UPDATE on `tasks.form_data_json`
    // is inlined here because `tx.execute` returns op-sqlite raw column
    // names (snake_case), while `updateLocalSubmissionState` consumed
    // camelCased rows from `SyncEngineRepository.query`.
    await DatabaseService.transaction(async tx => {
      if (localTaskId) {
        const existingResult = await tx.execute(
          'SELECT form_data_json FROM tasks WHERE id = ?',
          [localTaskId],
        );
        const existing =
          existingResult.rows.length > 0
            ? (
                existingResult.rows[0] as {
                  form_data_json: string | null;
                }
              ).form_data_json
            : null;
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
            status: 'success' as const,
            error: null,
            updatedAt: new Date().toISOString(),
          },
        };
        const now = new Date().toISOString();
        await tx.execute(
          `UPDATE tasks
             SET status = 'COMPLETED',
                 completed_at = ?,
                 sync_status = 'SYNCED',
                 last_synced_at = ?,
                 local_updated_at = ?,
                 form_data_json = ?
           WHERE id = ?`,
          [now, now, now, JSON.stringify(nextFormData), localTaskId],
        );
      }

      await tx.execute(
        "UPDATE form_submissions SET sync_status = 'SYNCED', status = 'SYNCED' WHERE id = ?",
        [operation.entityId],
      );
      // Don't delete autosave — keep for 7 days so user can resubmit if needed
    });

    // Cleanup photos only after database has been updated successfully
    if (localTaskId) {
      await this.cleanupSyncedPhotosForTask(localTaskId);
    }

    return { outcome: 'SUCCESS' };
  }
}

export const FormUploader = new FormUploaderClass();
