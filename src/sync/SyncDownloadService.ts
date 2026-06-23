import RNFS from 'react-native-fs';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { validateResponse } from '../api/schemas/runtime';
import { MobileSyncDownloadResponseSchema } from '../api/schemas/sync.schema';
import { config } from '../config';
import { DatabaseService } from '../database/DatabaseService';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { SyncEngineRepository } from '../repositories/SyncEngineRepository';
import {
  VerificationTypeOutcomesRepository,
  type VerificationTypeOutcomeRow,
} from '../repositories/VerificationTypeOutcomesRepository';
import {
  RevokeReasonsRepository,
  type RevokeReasonRow,
} from '../repositories/RevokeReasonsRepository';
import { DataCleanupService } from '../services/DataCleanupService';
import { Logger } from '../utils/logger';
import { syncConflictResolver } from './SyncConflictResolver';
import { reconcileTaskIdentity } from './reconcileTaskIdentity';
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
  async downloadServerChanges(
    opts?: { shouldAbort?: () => boolean },
  ): Promise<SyncDownloadResult> {
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
        // Watchdog/hard-timeout interrupt: stop paginating cleanly. The watermark
        // below persists only the fully-processed pages (idempotent upserts), so the
        // next cycle resumes from here — a wedged download can no longer hang the
        // whole sync cycle (and thus the in-memory lock).
        if (opts?.shouldAbort?.()) {
          errors.push('Download interrupted by sync watchdog');
          break;
        }
        // ADR-0054 Phase 1: `/api/v2/sync/download` now returns a BARE
        // v2-native body `{ tasks, revokedAssignmentIds, syncTimestamp,
        // hasMore, nextCursor }` — no `{ success, data }` wrapper. ADR-0054
        // Phase 5: the adapter is gone, so the bare v2-native body IS the
        // response — read it directly (no `.data` unwrap, no `.success` gate).
        const payload = await ApiClient.get<MobileSyncDownloadResponse>(
          `${ENDPOINTS.SYNC.DOWNLOAD}?lastSyncTimestamp=${encodeURIComponent(
            lastSyncAt,
          )}&limit=${limit}&offset=${offset}`,
        );
        if (!payload || !Array.isArray(payload.tasks)) {
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

        // 2026-05-01 retention v2 anti-flap: skip re-hydrating tasks
        // that local cleanup recently purged. Without this, a task we
        // deleted at 45d gets re-pushed by backend on the next sync
        // cycle (backend has its own retention) and the cleanup never
        // takes effect. Window is 30 days (CLEANED_TASK_TTL_MS in
        // DataCleanupService).
        const recentlyCleaned = new Set(
          await DataCleanupService.listRecentlyCleanedTaskIds(),
        );

        for (const task of payload.tasks) {
          // ADR-0054 Phase 1: the canonical backend task UUID is now the
          // top-level `id` (= case_tasks.id, NOT NULL). It still maps onto
          // the local `verification_task_id` column (column name kept to
          // avoid a DB rebuild), so all downstream keying is unchanged.
          const canonicalTaskId = (task.id || '').trim();
          if (canonicalTaskId && recentlyCleaned.has(canonicalTaskId)) {
            // Skip — local cleanup purged this within the TTL window.
            continue;
          }

          await this.upsertTaskFromServer(task);
          await ProjectionUpdater.rebuildTask(canonicalTaskId);
          tasksDownloaded++;

          // Bug 43 (2026-05-04): self-generation of "New Task Assigned"
          // notifications removed. Previously this branch fired whenever the
          // local `tasks` table had no row for `canonicalTaskId` — which
          // re-fired EVERY active/completed/revoked task as "new" any time
          // local SQLite was wiped (recovery, retention, fresh-install).
          // Notifications now flow exclusively from backend
          // `notifications` table via NotificationService.refreshFromBackend
          // → GET /api/mobile/notifications. Server-keyed, dedupe by id,
          // is_read state survives local wipes. Backend writer landed in
          // casesController.createCase (bug 42).
        }

        // ADR-0054 Phase 1: server-side removals now flow ONLY through
        // `revokedAssignmentIds` (the v2-native body no longer carries
        // `deletedTaskIds`/`deletedCaseIds`/`conflicts`). The
        // `revokedAssignmentIds` entries are backend task UUIDs, which we
        // match against the local `verification_task_id` column.
        // purgeTaskTransactional commits per task atomically and unlinks
        // files only after the DB writes succeed.
        for (const backendTaskId of payload.revokedAssignmentIds || []) {
          const taskRows = await SyncEngineRepository.query<{ id: string }>(
            'SELECT id FROM tasks WHERE verification_task_id = ?',
            [backendTaskId],
          );
          for (const row of taskRows) {
            await this.purgeTaskTransactional(row.id, backendTaskId);
          }
          await ProjectionUpdater.rebuildTask(backendTaskId);
        }

        latestSyncTimestamp = payload.syncTimestamp || latestSyncTimestamp;
        const pageSize = payload.tasks.length;
        hasMore = Boolean(payload.hasMore);
        if (hasMore && pageSize === 0) {
          hasMore = false;
          break;
        }
        offset += pageSize;

        // H2 (audit 2026-04-21): last_download_sync_at is NOT persisted
        // per page any more. Previous impl updated it at the end of every
        // page, so a mid-cycle crash in page N+1 on restart would ask the
        // server for rows newer than page N's end-timestamp and SKIP any
        // rows between the cycle's original lastSyncAt and page N's end.
        // Full-cycle persist (below, after the loop) is the correctness
        // fix; `upsertTaskFromServer` is INSERT OR REPLACE so re-
        // downloading a few pages on crash recovery is cheap and idempotent.
      }

      // Cycle succeeded — NOW persist the new watermark. If we error out
      // before this line, last_download_sync_at stays at its pre-cycle
      // value and the next cycle re-downloads from there. No skip,
      // upserts are idempotent.
      await SyncEngineRepository.execute(
        `INSERT OR REPLACE INTO sync_metadata (id, last_download_sync_at, device_id, sync_in_progress)
         VALUES (1, ?, (SELECT COALESCE(device_id, 'unknown') FROM sync_metadata WHERE id = 1), 1)`,
        [latestSyncTimestamp],
      );

      // F2.7.1: refresh local verification_type_outcomes mirror.
      // Non-fatal — if this fails (e.g. server hiccup), keep the previous
      // local rows; LegacyFormTemplateBuilders will fall back to embedded
      // defaults if the table is empty (e.g. fresh install offline).
      try {
        await this.refreshVerificationTypeOutcomes();
      } catch (refErr) {
        Logger.warn(
          TAG,
          'Reference data refresh failed (verification_type_outcomes); using last-synced rows',
          refErr,
        );
      }

      // A2.4 (audit 2026-05-25): refresh local revoke_reasons mirror.
      // Non-fatal — TaskRevokeModal falls back to the compiled-in
      // RevokeReason enum when the local table is empty.
      try {
        await this.refreshRevokeReasons();
      } catch (refErr) {
        Logger.warn(
          TAG,
          'Reference data refresh failed (revoke_reasons); using last-synced rows',
          refErr,
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
      // ALWAYS clear sync_in_progress flag, even on mid-download errors, so
      // the watchdog / UI doesn't see a stuck "syncing" state on the next
      // app launch. H2: this UPDATE is scoped to sync_in_progress ONLY and
      // must NOT touch last_download_sync_at — otherwise a mid-cycle error
      // would stamp a partial watermark and cause the skip the main fix
      // above is designed to prevent.
      try {
        await SyncEngineRepository.execute(
          `UPDATE sync_metadata SET sync_in_progress = 0 WHERE id = 1`,
        );
      } catch (flagError) {
        Logger.error(TAG, 'Failed to clear sync_in_progress flag', flagError);
      }
    }
  }

  /**
   * F2.7.1: fetch verification_type_outcomes from backend and replace the
   * local mirror atomically. Called once per successful download cycle.
   * Endpoint shape: { success: boolean, data: VerificationTypeOutcomeRow[] }.
   * ADR-0054 Phase 5 — KEEP the `{ success, data }` reads: the crm2 reference
   * service emits this v1 envelope at the backend (referenceService, NOT the
   * removed adapter), so this is the true native v2 shape. Do NOT "fix" it.
   */
  private async refreshVerificationTypeOutcomes(): Promise<void> {
    const response = await ApiClient.get<{
      success: boolean;
      data?: VerificationTypeOutcomeRow[];
    }>(ENDPOINTS.REFERENCE.VERIFICATION_TYPE_OUTCOMES);
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error('Invalid verification-type-outcomes response');
    }
    await VerificationTypeOutcomesRepository.replaceAll(response.data);
    // Push into the in-memory cache used by LegacyFormTemplateBuilders
    // so the dropdown reflects synced data without an app reboot.
    const { setOutcomesFromSync } = await import(
      '../screens/forms/LegacyFormTemplateBuilders'
    );
    setOutcomesFromSync(
      response.data.map(r => ({
        verificationTypeCode: r.verificationTypeCode,
        outcomeCode: r.outcomeCode,
        displayLabel: r.displayLabel,
        sortOrder: r.sortOrder,
      })),
    );
    Logger.info(TAG, 'verification_type_outcomes mirror refreshed', {
      count: response.data.length,
    });
  }

  /**
   * A2.4 (audit 2026-05-25): fetch revoke_reasons from backend and
   * replace the local mirror atomically. Called once per successful
   * download cycle. Endpoint shape: { success, data: RevokeReasonRow[] }.
   * ADR-0054 Phase 5 — KEEP the `{ success, data }` reads: the crm2 reference
   * service emits this v1 envelope at the backend (referenceService, NOT the
   * removed adapter), so this is the true native v2 shape. Do NOT "fix" it.
   */
  private async refreshRevokeReasons(): Promise<void> {
    const response = await ApiClient.get<{
      success: boolean;
      data?: RevokeReasonRow[];
    }>(ENDPOINTS.REFERENCE.REVOKE_REASONS);
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error('Invalid revoke-reasons response');
    }
    // Coerce to our row shape — endpoint returns active rows only, so
    // mark them isActive=true.
    const rows: RevokeReasonRow[] = response.data.map(r => ({
      id: r.id,
      code: r.code,
      label: r.label,
      sortOrder: r.sortOrder,
      isActive: true,
    }));
    await RevokeReasonsRepository.replaceAll(rows);
    Logger.info(TAG, 'revoke_reasons mirror refreshed', {
      count: rows.length,
    });
  }

  /**
   * Unlink local photo files for SYNCED attachments of a given local task id
   * before the DB rows are deleted. Without this, revoked or server-deleted
   * tasks leak their photo files into DocumentDirectoryPath/photos forever.
   * Failures to unlink are logged but not thrown — stale files are a storage
   * cost, not a data-integrity problem.
   */
  /**
   * DB2 (audit 2026-04-21 round 2): transactional per-task purge used
   * by the revoke/delete loops. Captures file paths first (SELECT),
   * does every DB write in a single transaction, then unlinks files
   * AFTER commit — mirrors the H5 fix pattern (never delete disk files
   * while the DB rows referring to them are still alive).
   *
   * `deleteMatchOnVerificationTaskId` controls whether the final tasks
   * DELETE also matches on `verification_task_id` — matters for the
   * legacy `deletedTaskIds` path which uses backend task UUID as the
   * key rather than the local task id.
   */
  private async purgeTaskTransactional(
    localTaskId: string,
    backendTaskId: string,
    options: { deleteMatchOnVerificationTaskId?: boolean } = {},
  ): Promise<void> {
    const photos = await SyncEngineRepository.query<{
      localPath: string | null;
      thumbnailPath: string | null;
    }>(
      "SELECT local_path, thumbnail_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
      [localTaskId],
    );

    await DatabaseService.transaction(async tx => {
      await tx.execute(
        "DELETE FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
        [localTaskId],
      );
      // Purge means the task (and therefore all its local children) is gone.
      // DELETE the PENDING children rather than marking them ABANDONED: under
      // ON DELETE CASCADE they'd be removed by the tasks DELETE below anyway,
      // and DELETEing them explicitly keeps the purge orphan-proof even if FK
      // enforcement is ever off (legacy DB) — they can never be re-uploaded to
      // a revoked/removed task. Mirrors the just-revoked wipe in upsert.
      await tx.execute(
        "DELETE FROM attachments WHERE task_id = ? AND sync_status = 'PENDING'",
        [localTaskId],
      );
      await tx.execute('DELETE FROM locations WHERE task_id = ?', [
        localTaskId,
      ]);
      await tx.execute(
        "DELETE FROM form_submissions WHERE task_id = ? AND sync_status = 'SYNCED'",
        [localTaskId],
      );
      await tx.execute(
        "DELETE FROM form_submissions WHERE task_id = ? AND sync_status = 'PENDING'",
        [localTaskId],
      );
      await tx.execute(
        `DELETE FROM sync_queue
          WHERE (
            entity_type IN ('TASK', 'TASK_STATUS')
            AND entity_id IN (?, ?)
          )
             OR (
            entity_type IN ('ATTACHMENT', 'VISIT_PHOTO', 'LOCATION', 'FORM_SUBMISSION')
            AND (
              json_extract(payload_json, '$.taskId') IN (?, ?)
              OR json_extract(payload_json, '$.localTaskId') IN (?, ?)
            )
          )`,
        [
          localTaskId,
          backendTaskId,
          localTaskId,
          backendTaskId,
          localTaskId,
          backendTaskId,
        ],
      );
      if (options.deleteMatchOnVerificationTaskId) {
        await tx.execute(
          'DELETE FROM tasks WHERE id = ? OR verification_task_id = ?',
          [localTaskId, backendTaskId],
        );
      } else {
        await tx.execute('DELETE FROM tasks WHERE id = ?', [localTaskId]);
      }
    });

    for (const photo of photos) {
      try {
        if (photo.localPath && (await RNFS.exists(photo.localPath))) {
          await RNFS.unlink(photo.localPath);
        }
        if (photo.thumbnailPath && (await RNFS.exists(photo.thumbnailPath))) {
          await RNFS.unlink(photo.thumbnailPath);
        }
      } catch (error) {
        Logger.warn(
          TAG,
          `Failed to unlink attachment file for task ${localTaskId}`,
          error,
        );
      }
    }
  }

  private async unlinkSyncedAttachmentFiles(
    localTaskId: string,
  ): Promise<void> {
    const photos = await SyncEngineRepository.query<{
      localPath: string | null;
      thumbnailPath: string | null;
    }>(
      "SELECT local_path, thumbnail_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
      [localTaskId],
    );
    for (const photo of photos) {
      try {
        if (photo.localPath && (await RNFS.exists(photo.localPath))) {
          await RNFS.unlink(photo.localPath);
        }
        if (photo.thumbnailPath && (await RNFS.exists(photo.thumbnailPath))) {
          await RNFS.unlink(photo.thumbnailPath);
        }
      } catch (error) {
        Logger.warn(
          TAG,
          `Failed to unlink attachment file for task ${localTaskId}`,
          error,
        );
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

  private async upsertTaskFromServer(task: MobileCaseResponse): Promise<void> {
    // ADR-0054 Phase 1: the canonical backend task UUID is the top-level
    // `id` (= case_tasks.id, NOT NULL). It is written into BOTH the `id`
    // PK and the `verification_task_id` column (column name kept), so all
    // existing keying on `verification_task_id` is unaffected.
    const canonicalTaskId = (task.id || '').trim();
    if (!canonicalTaskId) {
      Logger.warn(
        TAG,
        `Skipping task upsert due to missing task identifier for case ${task.caseId}`,
      );
      return;
    }

    // ADR-0047 two-stage completion: the server now drives the real task
    // lifecycle — the device's submit lands the task in SUBMITTED (field
    // executive done), and the OFFICE later turns SUBMITTED → COMPLETED on
    // the web. Persist whatever status the server sends verbatim (SUBMITTED
    // or COMPLETED); no client-side status rewrite. The server no longer
    // emits SUBMITTED_FOR_REVIEW, so the old normalize-to-COMPLETED block is
    // gone — SUBMITTED flows through to its own tab automatically.

    // B-148: collected inside the tx, unlinked after commit (RNFS is
    // non-transactional; deferring keeps the SQLite tx pure).
    const deferredUnlinks: string[] = [];

    // Wrap insert/replace + the task-identity fold in a transaction so a crash
    // mid-way can't leave orphaned FK records. The fold (reconcileTaskIdentity)
    // runs AFTER the insert below, keyed on verification_task_id rather than the
    // shared case_id — see reconcileTaskIdentity for the root cause it fixes.
    await DatabaseService.transaction(async () => {
      const existingRows = await SyncEngineRepository.query<{
        status: string;
        isSaved: number;
        inProgressAt: string | null;
        savedAt: string | null;
        completedAt: string | null;
        syncStatus: string | null;
        localUpdatedAt: string | null;
      }>(
        // D1 (audit 2026-04-21 round 2): include `local_updated_at`
        // in the SELECT so the conflict resolver's "local fresher than
        // server" branch can actually fire. Without it, `isLocalFresher`
        // always saw undefined and returned false, silently overwriting
        // fresh local status/isSaved/etc. with stale server payload.
        `SELECT status, is_saved, in_progress_at, saved_at, completed_at, sync_status, local_updated_at
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
              localUpdatedAt: existingRows[0].localUpdatedAt,
            }
          : null,
        hasQueuedChanges,
      );

      const now = new Date().toISOString();
      await SyncEngineRepository.execute(
        `INSERT INTO tasks
        (id, case_id, case_number, verification_task_id, verification_task_number, title, description, customer_name, customer_calling_code,
         customer_phone, customer_email, company_name, address_street, address_city, address_state, address_pincode, latitude, longitude,
         status, priority, assigned_at, updated_at, completed_at, notes, verification_type, verification_outcome, applicant_type,
         backend_contact_number, created_by_backend_user, assigned_to_field_user, client_id, client_name, client_code,
         product_id, product_name, product_code, verification_type_id, verification_type_name, verification_type_code,
         form_data_json, is_revoked, revoked_at, revoked_by_name, revoke_reason,
         in_progress_at, saved_at, is_saved, attachment_count,
         sync_status, last_synced_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         case_id = excluded.case_id,
         case_number = excluded.case_number,
         verification_task_id = excluded.verification_task_id,
         verification_task_number = excluded.verification_task_number,
         title = excluded.title,
         description = excluded.description,
         customer_name = excluded.customer_name,
         customer_calling_code = excluded.customer_calling_code,
         customer_phone = excluded.customer_phone,
         customer_email = excluded.customer_email,
         company_name = excluded.company_name,
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
          // ADR-0054 Phase 1 source remap (bind order matches the column
          // list above). The local `tasks` column names are unchanged; only
          // the v2-native payload source fields differ:
          //   verification_task_id      <- task.id  (was task.verificationTaskId)
          //   verification_task_number  <- task.taskNumber
          //   title                     <- task.taskNumber (column is NOT NULL;
          //                                 v1's separate `title` is gone)
          //   description / address_city / address_state  <- '' (server dropped them;
          //                                 columns kept device-local with defaults)
          //   address_street            <- task.address
          //   verification_type + the verification_type_{id,name,code} catalog
          //                             <- task.verificationUnit
          //   case_number               <- task.caseNumber (case display number)
          //   case_id                   <- task.caseId (now a uuid string)
          // is_saved / saved_at are no longer in the payload — resolveTaskState
          // supplies them from local state (mergedState).
          canonicalTaskId,
          task.caseId,
          task.caseNumber != null ? String(task.caseNumber) : null,
          canonicalTaskId,
          task.taskNumber || '',
          task.taskNumber || '',
          '',
          task.customerName,
          task.customerCallingCode || null,
          task.customerPhone || null,
          null,
          task.companyName || null,
          task.address || '',
          '',
          '',
          task.addressPincode || '',
          task.latitude || null,
          task.longitude || null,
          mergedState.status,
          task.priority || 'MEDIUM',
          task.assignedAt || now,
          task.updatedAt || now,
          mergedState.completedAt,
          task.notes || null,
          task.verificationUnit?.name || null,
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
          task.verificationUnit?.id || null,
          task.verificationUnit?.name || null,
          task.verificationUnit?.code || null,
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

      // Fold any local rows that hold this same task under a stale local id
      // (id != verification_task_id) into the canonical id. Runs AFTER the
      // upsert above so the canonical row exists and re-pointed child FKs
      // resolve under PRAGMA foreign_keys = ON. Steady state matches nothing.
      await reconcileTaskIdentity(SyncEngineRepository, canonicalTaskId);

      // B-148 (2026-05-16): if this sync tick flipped the task to REVOKED
      // (server-side revoke that mobile missed via WS push), wipe local
      // attachments + form drafts inside the same tx. FS unlinks are
      // deferred until after commit because RNFS is non-transactional.
      const previousStatus = existingRows[0]?.status;
      const justRevoked =
        mergedState.status === 'REVOKED' && previousStatus !== 'REVOKED';
      if (justRevoked) {
        const orphanPaths = await SyncEngineRepository.query<{
          local_path?: string;
          thumbnail_path?: string;
        }>(
          'SELECT local_path, thumbnail_path FROM attachments WHERE task_id = ?',
          [canonicalTaskId],
        );
        deferredUnlinks.push(
          ...orphanPaths.flatMap(r =>
            [r.local_path, r.thumbnail_path].filter(
              (p): p is string => typeof p === 'string' && p.length > 0,
            ),
          ),
        );
        await SyncEngineRepository.execute(
          'DELETE FROM attachments WHERE task_id = ?',
          [canonicalTaskId],
        );
        await SyncEngineRepository.execute(
          'DELETE FROM form_submissions WHERE task_id = ?',
          [canonicalTaskId],
        );
      }
    }); // end transaction

    // Post-commit FS cleanup. Errors swallowed — DB delete is authority.
    for (const p of deferredUnlinks) {
      try {
        if (await RNFS.exists(p)) {
          await RNFS.unlink(p);
        }
      } catch {
        // missing file or permission — fine
      }
    }
  }
}

export const SyncDownloadService = new SyncDownloadServiceClass();
