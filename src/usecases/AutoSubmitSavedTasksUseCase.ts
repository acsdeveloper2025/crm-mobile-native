import { Logger } from '../utils/logger';
import { TaskRepository } from '../repositories/TaskRepository';
import { SubmitVerificationUseCase } from './SubmitVerificationUseCase';
import { resolveFormTypeKey } from '../utils/formTypeKey';
import { DatabaseService } from '../database/DatabaseService';
import { mapSqliteTask } from '../utils/mapSqliteTask';

const TAG = 'AutoSubmitSavedTasksUseCase';

export interface AutoSubmitResult {
  submitted: number;
  skippedDrafts: number;
  failed: number;
  errors: string[];
}

/**
 * 2026-05-03 user request: when "Sync with Server" is pressed, auto-submit
 * any locally-saved tasks whose forms are fully filled. Drafts (forms with
 * insufficient photos, missing geo, missing outcome, or anything that the
 * SubmitVerificationUseCase rejects) stay saved untouched.
 *
 * SubmitVerificationUseCase already enforces every "fully filled" guard
 * we care about — ≥5 verification photos, ≥1 selfie, geo on every photo,
 * valid outcome, valid form type. Anything that throws during execute is
 * by definition a draft, and we keep it saved so the user can finish it
 * later. Manual submit-from-saved-tab path (TaskListScreen.handleTaskPress)
 * is unaffected.
 */
export const AutoSubmitSavedTasksUseCase = {
  async execute(): Promise<AutoSubmitResult> {
    const result: AutoSubmitResult = {
      submitted: 0,
      skippedDrafts: 0,
      failed: 0,
      errors: [],
    };

    let savedTasks;
    try {
      savedTasks = await TaskRepository.listSavedTasks();
    } catch (err) {
      Logger.error(TAG, 'Failed to list saved tasks', err);
      return result;
    }

    if (savedTasks.length === 0) {
      return result;
    }

    Logger.info(TAG, `Found ${savedTasks.length} saved task(s) to evaluate`);

    for (const task of savedTasks) {
      try {
        // 2026-05-03 (bug 37): bypass `TaskRepository.getTaskById` which
        // reads from `task_detail_projection` — that projection is rebuilt
        // ASYNCHRONOUSLY (`scheduleTaskRebuild`) after `updateTaskFormData`,
        // so on Sync-fired right after Save, the projection still has
        // empty `formDataJson`. Read directly from the source-of-truth
        // `tasks` table to guarantee we see the user's saved values.
        const rawRows = await DatabaseService.query<Record<string, unknown>>(
          'SELECT * FROM tasks WHERE id = ? LIMIT 1',
          [task.id],
        );
        const fresh = rawRows[0]
          ? mapSqliteTask(rawRows[0] as never)
          : null;
        if (!fresh) {
          continue;
        }
        const formData = fresh.formDataJson
          ? (JSON.parse(fresh.formDataJson) as Record<string, unknown>)
          : {};
        const formType =
          resolveFormTypeKey({
            formType: '',
            verificationTypeCode: fresh.verificationTypeCode || null,
            verificationTypeName: fresh.verificationTypeName || null,
            verificationType: fresh.verificationType || null,
          }) ||
          fresh.verificationType ||
          '';

        await SubmitVerificationUseCase.execute({
          taskId: fresh.id,
          formType,
          formData,
          verificationOutcome: fresh.verificationOutcome,
        });

        result.submitted += 1;
        Logger.info(TAG, `Auto-submitted saved task ${fresh.id}`);
      } catch (err) {
        // Per the contract: drafts naturally fail validation in
        // SubmitVerificationUseCase. We treat ALL throws as "stay saved",
        // log for diagnostics, and continue to the next saved task.
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('At least 5 verification photos') ||
          message.includes('At least 1 selfie') ||
          message.includes('must include geo-location') ||
          message.includes('Unsupported form type') ||
          message.includes('Invalid task identifier')
        ) {
          result.skippedDrafts += 1;
          Logger.info(
            TAG,
            `Skipped saved task ${task.id} (draft): ${message}`,
          );
        } else {
          result.failed += 1;
          result.errors.push(`${task.verificationTaskNumber || task.id}: ${message}`);
          Logger.warn(TAG, `Auto-submit failed for ${task.id}`, err);
        }
      }
    }

    return result;
  },
};
