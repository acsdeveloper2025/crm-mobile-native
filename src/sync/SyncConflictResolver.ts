import type { MobileCaseResponse } from '../types/api';

interface ExistingTaskState {
  status: string;
  isSaved: boolean;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  syncStatus: string | null;
}

interface ResolvedTaskState {
  status: string;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  isSaved: number;
}

class SyncConflictResolver {
  resolveTaskState(task: MobileCaseResponse, existing?: ExistingTaskState | null): ResolvedTaskState {
    const backendStatus = (task.status || 'ASSIGNED').toUpperCase();
    let status = backendStatus;
    let inProgressAt = task.inProgressAt || null;
    let savedAt = task.savedAt || null;
    let completedAt = task.completedAt || null;
    let isSaved = task.isSaved ? 1 : 0;

    if (existing && existing.syncStatus === 'PENDING') {
      const localStatus = (existing.status || '').toUpperCase();
      const localSaved = existing.isSaved;
      const shouldPreserveLocal =
        (backendStatus === 'ASSIGNED' &&
          (localStatus === 'IN_PROGRESS' || localStatus === 'COMPLETED' || localSaved)) ||
        (backendStatus === 'IN_PROGRESS' && localStatus === 'COMPLETED');

      if (shouldPreserveLocal) {
        status = localStatus || status;
        inProgressAt = existing.inProgressAt || inProgressAt;
        savedAt = existing.savedAt || savedAt;
        completedAt = existing.completedAt || completedAt;
        isSaved = localSaved ? 1 : isSaved;
      }
    }

    return {
      status,
      inProgressAt,
      savedAt,
      completedAt,
      isSaved,
    };
  }
}

export const syncConflictResolver = new SyncConflictResolver();
