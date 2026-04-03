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
      [input.id, input.taskId, input.caseId, input.formType, JSON.stringify(input.formData), input.submittedAt],
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
      [JSON.stringify(metadata), JSON.stringify(attachmentIds), JSON.stringify(photos), id],
    );
  }

  async updateSubmissionAttachmentIds(id: string, attachmentIds: string[]): Promise<void> {
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

  async getSubmissionSyncStatus(taskId: string): Promise<{ status: string; syncStatus: string; syncError?: string } | null> {
    // Check form_submissions table first
    const rows = await DatabaseService.query<{ status: string; sync_status: string; sync_error: string | null }>(
      `SELECT status, sync_status, sync_error FROM form_submissions WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1`,
      [taskId],
    );
    if (!rows[0]) return null;

    // If form_submissions says SYNCED, trust it
    if (rows[0].sync_status === 'SYNCED') {
      return { status: rows[0].status, syncStatus: 'SYNCED' };
    }

    // Check sync_queue for failed FORM_SUBMISSION items for this task
    const failedQueue = await DatabaseService.query<{ status: string; error: string | null }>(
      `SELECT status, error FROM sync_queue WHERE entity_type = 'FORM_SUBMISSION' AND json_extract(payload_json, '$.localTaskId') = ? ORDER BY created_at DESC LIMIT 1`,
      [taskId],
    );

    if (failedQueue[0]) {
      if (failedQueue[0].status === 'FAILED') {
        return { status: 'FAILED', syncStatus: 'FAILED', syncError: failedQueue[0].error || 'Upload failed' };
      }
      if (failedQueue[0].status === 'PENDING' || failedQueue[0].status === 'IN_PROGRESS') {
        return { status: 'PENDING', syncStatus: 'PENDING' };
      }
      if (failedQueue[0].status === 'COMPLETED') {
        return { status: 'SYNCED', syncStatus: 'SYNCED' };
      }
    }

    return { status: rows[0].status, syncStatus: rows[0].sync_status, syncError: rows[0].sync_error || undefined };
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
