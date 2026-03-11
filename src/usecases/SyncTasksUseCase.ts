import { SyncService } from '../services/SyncService';
import { TaskRepository } from '../repositories/TaskRepository';

export const SyncTasksUseCase = {
  async execute() {
    const result = await SyncService.performSync();
    const tasks = await TaskRepository.listTasks();
    return { result, tasks };
  },
};
