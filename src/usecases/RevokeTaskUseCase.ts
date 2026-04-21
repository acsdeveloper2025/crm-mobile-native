import { DatabaseService } from '../database/DatabaseService';
import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { SYNC_PRIORITY } from '../services/SyncQueue';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveBackendTaskId = (
  taskId: string,
  verificationTaskId?: string | null,
): string => {
  if (verificationTaskId && UUID_REGEX.test(verificationTaskId.trim())) {
    return verificationTaskId.trim();
  }
  if (UUID_REGEX.test(taskId.trim())) {
    return taskId.trim();
  }
  throw new Error('Invalid task identifier');
};

export const RevokeTaskUseCase = {
  async execute(taskId: string, reason: string): Promise<void> {
    const task = await TaskRepository.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // D4 (audit 2026-04-21 round 2): atomic local-write + enqueue.
    await DatabaseService.transaction(async () => {
      await TaskRepository.revokeTask(taskId, reason);
      await SyncGateway.enqueueTaskStatus(
        resolveBackendTaskId(task.id, task.verificationTaskId),
        task.id,
        'REVOKED',
        { reason, revokeReason: reason },
        SYNC_PRIORITY.CRITICAL,
      );
    });
  },
};
