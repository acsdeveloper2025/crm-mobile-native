import { SyncService } from '../services/SyncService';
import { LocationService } from '../services/LocationService';
import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { TaskStatus } from '../types/enums';

export interface StartVisitResult {
  success: true;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveBackendTaskId = (taskId: string, verificationTaskId?: string | null): string => {
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

  const validation = await SyncService.validateVisitStart(taskId);
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Distance validation failed.');
  }

  const recordedLocation = await LocationService.recordLocation(taskId, 'CASE_START');
  if (!recordedLocation) {
    throw new Error('Location capture is required before starting the visit.');
  }

  await TaskRepository.updateTaskStatus(taskId, TaskStatus.InProgress);
  await SyncGateway.enqueueTaskStatus(
    resolveBackendTaskId(task.id, task.verificationTaskId),
    task.id,
    TaskStatus.InProgress,
  );
  return { success: true };
};
