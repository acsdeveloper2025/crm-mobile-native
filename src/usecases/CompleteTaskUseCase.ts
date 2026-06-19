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

    // ADR-0047 two-stage completion: the device is a field terminal — its
    // "finish my work" action produces SUBMITTED (field executive done), NEVER
    // COMPLETED. Only the OFFICE turns SUBMITTED → COMPLETED on the web, which
    // arrives back via down-sync. The task lands in the new Submitted tab.
    //
    // The earlier D4 wrap (`DatabaseService.transaction(...)`) deadlocked on
    // op-sqlite (nested transactions via projection rebuild + replaceLatestStatusItem).
    // Order matters: enqueue first, then local update. If enqueue throws,
    // nothing locally changed — user retries cleanly. If the local update
    // throws after enqueue, the queue still carries the SUBMITTED action and
    // next sync-down converges via the conflict resolver. Reversing the order
    // would leave the row locally SUBMITTED with no queue entry — backend
    // never learns the field work is submitted.
    await SyncGateway.enqueueTaskStatus(
      resolveBackendTaskId(task.id, task.verificationTaskId),
      task.id,
      TaskStatus.Submitted,
    );
    await TaskRepository.updateTaskStatus(taskId, TaskStatus.Submitted);
  },
};
