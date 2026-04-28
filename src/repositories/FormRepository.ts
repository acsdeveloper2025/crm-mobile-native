import { DatabaseService } from '../database/DatabaseService';

class FormRepositoryClass {
  async createSubmission(input: {
    id: string;
    taskId: string;
    caseId: string;
    formType: string;
    formData: Record<string, unknown>;
    submittedAt: string;
  }): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO form_submissions
        (id, task_id, case_id, form_type, form_data_json, status, submitted_at, metadata_json, attachment_ids_json, photo_data_json, sync_status, sync_attempts)
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED_LOCALLY', ?, '{}', '[]', '[]', 'PENDING', 0)`,
      [
        input.id,
        input.taskId,
        input.caseId,
        input.formType,
        JSON.stringify(input.formData),
        input.submittedAt,
      ],
    );
  }

  async updateSubmissionPayload(
    id: string,
    metadata: Record<string, unknown>,
    attachmentIds: string[],
    photos: unknown[],
  ): Promise<void> {
    await DatabaseService.execute(
      `UPDATE form_submissions
       SET metadata_json = ?, attachment_ids_json = ?, photo_data_json = ?
       WHERE id = ?`,
      [
        JSON.stringify(metadata),
        JSON.stringify(attachmentIds),
        JSON.stringify(photos),
        id,
      ],
    );
  }

  async updateSubmissionAttachmentIds(
    id: string,
    attachmentIds: string[],
  ): Promise<void> {
    await DatabaseService.execute(
      'UPDATE form_submissions SET attachment_ids_json = ? WHERE id = ?',
      [JSON.stringify(attachmentIds), id],
    );
  }

  async markSubmissionSynced(id: string): Promise<void> {
    await DatabaseService.execute(
      "UPDATE form_submissions SET sync_status = 'SYNCED', status = 'SYNCED' WHERE id = ?",
      [id],
    );
  }

  /**
   * 2026-04-27 audit fix F3: keep `form_submissions.sync_status` in lockstep
   * with the DLQ status of its sync_queue row. Previously, only the queue
   * row flipped to FAILED; the form_submissions table was stuck on
   * `sync_status='PENDING'` forever — two state machines disagreed and any
   * reader trusting form_submissions alone never saw the failure.
   *
   * Looks up the latest form_submissions row for the given taskId
   * (matches getSubmissionSyncStatus() ordering) and marks it FAILED.
   */
  async markSubmissionFailedByTaskId(
    taskId: string,
    syncError: string,
  ): Promise<void> {
    await DatabaseService.execute(
      `UPDATE form_submissions
         SET sync_status = 'FAILED', sync_error = ?
         WHERE id = (
           SELECT id FROM form_submissions
            WHERE task_id = ?
            ORDER BY submitted_at DESC
            LIMIT 1
         )`,
      [syncError, taskId],
    );
  }

  async getSubmissionSyncStatus(taskId: string): Promise<{
    status: string;
    syncStatus: string;
    syncError?: string;
  } | null> {
    // Check form_submissions table first
    const rows = await DatabaseService.query<{
      status: string;
      syncStatus: string;
      syncError: string | null;
    }>(
      `SELECT status, sync_status, sync_error FROM form_submissions WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1`,
      [taskId],
    );
    if (!rows[0]) return null;

    // If form_submissions says SYNCED, trust it
    if (rows[0].syncStatus === 'SYNCED') {
      return { status: rows[0].status, syncStatus: 'SYNCED' };
    }

    // Check sync_queue for failed FORM_SUBMISSION items for this task.
    // Schema column is `last_error` (not `error`); the prior SELECT was
    // referencing a non-existent column, which left syncError always
    // defaulted to 'Upload failed' and hid the real server reason.
    const failedQueue = await DatabaseService.query<{
      status: string;
      lastError: string | null;
    }>(
      `SELECT status, last_error FROM sync_queue WHERE entity_type = 'FORM_SUBMISSION' AND json_extract(payload_json, '$.localTaskId') = ? ORDER BY created_at DESC LIMIT 1`,
      [taskId],
    );

    if (failedQueue[0]) {
      if (failedQueue[0].status === 'FAILED') {
        return {
          status: 'FAILED',
          syncStatus: 'FAILED',
          syncError: failedQueue[0].lastError || 'Upload failed',
        };
      }
      if (
        failedQueue[0].status === 'PENDING' ||
        failedQueue[0].status === 'IN_PROGRESS'
      ) {
        return { status: 'PENDING', syncStatus: 'PENDING' };
      }
      if (failedQueue[0].status === 'COMPLETED') {
        return { status: 'SYNCED', syncStatus: 'SYNCED' };
      }
    }

    return {
      status: rows[0].status,
      syncStatus: rows[0].syncStatus,
      syncError: rows[0].syncError || undefined,
    };
  }

  async getCachedTemplate(verificationType: string, outcome: string) {
    const rows = await DatabaseService.query<any>(
      `SELECT sections_json, name, description
       FROM form_templates
       WHERE verification_type = ? AND outcome = ?
       LIMIT 1`,
      [verificationType, outcome],
    );
    return rows[0] ?? null;
  }

  async saveTemplate(input: {
    id: string;
    formType: string;
    verificationType: string;
    outcome: string;
    name: string;
    description: string;
    sections: unknown[];
    version: string;
  }): Promise<void> {
    await DatabaseService.execute(
      `INSERT OR REPLACE INTO form_templates
        (id, form_type, verification_type, outcome, name, description, sections_json, version, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.formType,
        input.verificationType,
        input.outcome,
        input.name,
        input.description,
        JSON.stringify(input.sections),
        input.version,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
  }
}

export const FormRepository = new FormRepositoryClass();
