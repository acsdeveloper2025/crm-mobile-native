import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { TaskStatus } from '../types/enums';

export interface StartVisitResult {
  success: true;
}

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

export const startVisitUseCase = async (
  taskId: string,
): Promise<StartVisitResult> => {
  const task = await TaskRepository.getTaskById(taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  // The earlier D4 wrap (`DatabaseService.transaction(...)`) deadlocked on
  // op-sqlite: TaskRepository.updateTaskStatus + SyncGateway.enqueueTaskStatus
  // both call DatabaseService.execute / DatabaseService.transaction internally,
  // and the connection is single-writer — a nested transaction inside the
  // outer callback never resolves, so the Accept spinner stuck forever.
  //
  // Order matters: enqueue first, then local update. If enqueue throws (e.g.
  // device storage exhausted, SQLite BUSY), nothing local changed and the
  // user retries cleanly. If the local update throws after the enqueue, the
  // queue still carries the status change — next sync-down converges via the
  // conflict resolver (server fresher than local). Reversing this order would
  // mean a failed enqueue leaves the row locally mutated with no queue entry,
  // causing permanent backend divergence (local IN_PROGRESS, server stays
  // ASSIGNED forever — the conflict resolver keeps the fresher local row).
  await SyncGateway.enqueueTaskStatus(
    resolveBackendTaskId(task.id, task.verificationTaskId),
    task.id,
    TaskStatus.InProgress,
  );
  await TaskRepository.updateTaskStatus(taskId, TaskStatus.InProgress);
  return { success: true };
};
