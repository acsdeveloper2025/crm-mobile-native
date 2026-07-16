import { DatabaseService } from '../database/DatabaseService';
import { TaskRepository } from '../repositories/TaskRepository';

const parseFormData = (raw?: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const SaveDraftUseCase = {
  async execute(taskId: string, patch: Record<string, unknown>): Promise<void> {
    // 2026-07-17: read the SOURCE table, not TaskRepository.getTaskById — that
    // returns task_detail_projection first, and the projection is rebuilt
    // ASYNCHRONOUSLY (scheduleTaskRebuild) after every write. A read here could
    // therefore see a stale or empty form_data_json, and the merge below would
    // silently drop the agent's earlier answers. That is bug 37/39, which
    // AutoSubmitSavedTasksUseCase bypasses for exactly this reason; this path —
    // the one every autosave debounce, unmount and background flush runs
    // through — never got the fix.
    //
    // `query` normalizes rows to camelCase alongside the raw columns
    // (DatabaseService.normalizeRow), so formDataJson reads straight off.
    const rows = await DatabaseService.query<{ formDataJson?: string | null }>(
      'SELECT form_data_json FROM tasks WHERE id = ? LIMIT 1',
      [taskId],
    );
    if (!rows[0]) {
      throw new Error('Task not found');
    }

    const nextFormData = {
      ...parseFormData(rows[0].formDataJson),
      ...patch,
    };

    // No status is passed. The only transition a draft-save may make is
    // ASSIGNED -> IN_PROGRESS, and it is now decided inside the UPDATE. Reading
    // the status here and handing it back to `updateFormData` (which writes
    // `status = ?` unconditionally) is what let a revoke landing mid-save be
    // overwritten with a stale IN_PROGRESS, resurrecting a REVOKED task.
    await TaskRepository.saveDraftFormData(taskId, nextFormData);
  },
};
