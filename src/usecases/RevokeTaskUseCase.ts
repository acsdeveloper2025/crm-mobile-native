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

    // The earlier D4 wrap (`DatabaseService.transaction(...)`) deadlocked on
    // op-sqlite (nested transaction via replaceLatestStatusItem + projection
    // rebuild). Order matters: enqueue first, then local revoke. If enqueue
    // throws, nothing locally changed — user retries cleanly. If the local
    // revoke throws after enqueue, the queue still carries the REVOKED action
    // and next sync-down converges via the conflict resolver. Reversing the
    // order would leave the row locally REVOKED with no queue entry, and the
    // conflict resolver (which prefers the fresher local timestamp) would
    // permanently hide the revoke from the backend — ops would never know.
    await SyncGateway.enqueueTaskStatus(
      resolveBackendTaskId(task.id, task.verificationTaskId),
      task.id,
      'REVOKED',
      { reason, revokeReason: reason },
      SYNC_PRIORITY.CRITICAL,
    );
    await TaskRepository.revokeTask(taskId, reason);
  },
};
