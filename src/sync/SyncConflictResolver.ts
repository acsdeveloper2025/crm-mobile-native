import type { MobileCaseResponse } from '../types/api';

interface ExistingTaskState {
  status: string;
  isSaved: boolean;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  syncStatus: string | null;
  local_updated_at?: string | null;
}

interface ResolvedTaskState {
  status: string;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  isSaved: number;
}

class SyncConflictResolver {
  private isLocalFresher(localUpdatedAt: string | null | undefined, serverUpdatedAt: string | null | undefined): boolean {
    if (!localUpdatedAt || !serverUpdatedAt) {
      return false;
    }
    try {
      return new Date(localUpdatedAt) > new Date(serverUpdatedAt);
    } catch {
      return false;
    }
  }

  resolveTaskState(task: MobileCaseResponse, existing?: ExistingTaskState | null): ResolvedTaskState {
    const backendStatus = (task.status || 'ASSIGNED').toUpperCase();
    let status = backendStatus;
    let inProgressAt = task.inProgressAt || null;
    let savedAt = task.savedAt || null;
    let completedAt = task.completedAt || null;
    let isSaved = task.isSaved ? 1 : 0;

    if (existing) {
      const localStatus = (existing.status || '').toUpperCase();
      const localSaved = existing.isSaved;

      // Check if local edits are newer than server state
      const localHasFreshEdits = this.isLocalFresher(existing.local_updated_at, task.updatedAt);

      if (existing.syncStatus === 'PENDING') {
        // For PENDING sync status, use existing logic with status precedence
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
      } else if (localHasFreshEdits) {
        // For non-PENDING status: if local has fresher edits than server, preserve local edits
        // but still accept server-side administrative changes (status revocations, reassignments)
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
