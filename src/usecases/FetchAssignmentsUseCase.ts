import { TaskRepository } from '../repositories/TaskRepository';
import { RecoverOfflineStateUseCase } from './RecoverOfflineStateUseCase';

export const FetchAssignmentsUseCase = {
  async execute(): Promise<ReturnType<typeof TaskRepository.listTasks>> {
    await RecoverOfflineStateUseCase.execute();
    return TaskRepository.listTasks();
  },
};
