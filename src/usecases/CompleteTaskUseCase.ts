import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { TaskStatus } from '../types/enums';

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

export const CompleteTaskUseCase = {
  async execute(taskId: string): Promise<void> {
    const task = await TaskRepository.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // The earlier D4 wrap (`DatabaseService.transaction(...)`) deadlocked on
    // op-sqlite (nested transactions via projection rebuild + replaceLatestStatusItem).
    // Order matters: enqueue first, then local update. If enqueue throws,
    // nothing locally changed — user retries cleanly. If the local update
    // throws after enqueue, the queue still carries the COMPLETED action and
    // next sync-down converges via the conflict resolver. Reversing the order
    // would leave the row locally COMPLETED with no queue entry — backend
    // never learns the task is done.
    await SyncGateway.enqueueTaskStatus(
      resolveBackendTaskId(task.id, task.verificationTaskId),
      task.id,
      TaskStatus.Completed,
    );
    await TaskRepository.updateTaskStatus(taskId, TaskStatus.Completed);
  },
};
