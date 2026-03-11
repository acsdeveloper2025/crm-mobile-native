import { TaskRepository } from '../repositories/TaskRepository';
import { TaskStatus } from '../types/enums';

const parseFormData = (raw?: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const SaveDraftUseCase = {
  async execute(taskId: string, patch: Record<string, unknown>): Promise<void> {
    const task = await TaskRepository.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const nextFormData = {
      ...parseFormData(task.formDataJson),
      ...patch,
    };
    const nextStatus = task.status === TaskStatus.Assigned ? TaskStatus.InProgress : task.status;
    await TaskRepository.updateFormData(taskId, nextFormData, nextStatus);
  },
};
