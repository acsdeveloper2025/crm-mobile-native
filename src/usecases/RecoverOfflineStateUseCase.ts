import { TaskRepository } from '../repositories/TaskRepository';
import { SyncQueue } from '../services/SyncQueue';

let recovered = false;

export const RecoverOfflineStateUseCase = {
  async execute(force: boolean = false): Promise<void> {
    if (recovered && !force) {
      return;
    }
    await SyncQueue.recoverExpiredLeases();
    await TaskRepository.repairTaskIdentity();
    recovered = true;
  },
};
