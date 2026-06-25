// resolveTaskState — merge a server task payload with the local row during
// down-sync, deciding which status/saved fields win.
//
// Extracted from SyncConflictResolver so the decision is unit-testable without
// the RN runtime (the class module imports DatabaseService → op-sqlite, which
// can't load under Node). SyncConflictResolver computes the server-clock
// freshness flag and delegates here. Mirrors the reconcileTaskIdentity split.
//
// A2026-0623-11: a server REVOKED status was masked by the local status in the
// queued-changes and fresher-edits branches — the row stayed IN_PROGRESS with
// is_revoked=1, so the down-sync PII wipe (gated on the merged status) never
// ran and photos/form drafts lingered. The revoked short-circuit at the top
// makes a revoke authoritative: whenever the backend status is REVOKED OR the
// server revoked flag is set, the task resolves to REVOKED with the device-only
// "saved" state cleared, regardless of pending local edits.

export interface ExistingTaskState {
  status: string;
  isSaved: boolean;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  syncStatus: string | null;
  localUpdatedAt?: string | null;
}

export interface ResolvedTaskState {
  status: string;
  inProgressAt: string | null;
  savedAt: string | null;
  completedAt: string | null;
  isSaved: number;
}

/** The subset of the server task payload this merge reads. */
export interface ResolvableTask {
  status?: string;
  inProgressAt?: string | null;
  completedAt?: string | null;
  isRevoked?: boolean;
}

export function resolveTaskState(
  task: ResolvableTask,
  existing: ExistingTaskState | null | undefined,
  hasQueuedChanges: boolean,
  localHasFreshEdits: boolean,
): ResolvedTaskState {
  const backendStatus = (task.status || 'ASSIGNED').toUpperCase();

  // A2026-0623-11: a revoke is authoritative. Short-circuit BEFORE the
  // queued-changes / fresher-edits branches that would otherwise mask it with
  // the local status, and clear the device-only saved state so the row can't
  // sit in the Saved/In-Progress tabs holding un-purged PII.
  if (backendStatus === 'REVOKED' || task.isRevoked === true) {
    return {
      status: 'REVOKED',
      inProgressAt: task.inProgressAt || null,
      savedAt: null,
      completedAt: task.completedAt || null,
      isSaved: 0,
    };
  }

  let status = backendStatus;
  let inProgressAt = task.inProgressAt || null;
  // ADR-0054 Phase 1: `savedAt`/`isSaved` are no longer in the server payload —
  // "saved" is a device-only concept. They default to null/0 and are only ever
  // sourced from local state in the `existing` branches below.
  let savedAt: string | null = null;
  let completedAt = task.completedAt || null;
  let isSaved = 0;

  if (existing) {
    const localStatus = (existing.status || '').toUpperCase();
    const localSaved = existing.isSaved;

    // If there are queued changes that haven't synced yet, always preserve
    // local state to prevent silent data loss from overwriting pending work.
    if (hasQueuedChanges) {
      status = localStatus || status;
      inProgressAt = existing.inProgressAt || inProgressAt;
      savedAt = existing.savedAt || savedAt;
      completedAt = existing.completedAt || completedAt;
      isSaved = localSaved ? 1 : isSaved;
      return { status, inProgressAt, savedAt, completedAt, isSaved };
    }

    if (existing.syncStatus === 'PENDING') {
      // For PENDING sync status, use existing logic with status precedence.
      //
      // 2026-05-02: extended `shouldPreserveLocal` to cover local `is_saved=1`
      // (mobile-only state) against a backend status of IN_PROGRESS/ASSIGNED,
      // so pressing Save isn't bounced back to In-Progress by the next sync.
      // ADR-0047 two-stage completion: SUBMITTED is the field terminal — treat
      // it like COMPLETED so a not-yet-uploaded submit isn't bounced back.
      const shouldPreserveLocal =
        (backendStatus === 'ASSIGNED' &&
          (localStatus === 'IN_PROGRESS' ||
            localStatus === 'SUBMITTED' ||
            localStatus === 'COMPLETED' ||
            localSaved)) ||
        (backendStatus === 'IN_PROGRESS' &&
          (localStatus === 'SUBMITTED' ||
            localStatus === 'COMPLETED' ||
            localSaved)) ||
        (localSaved &&
          backendStatus !== 'COMPLETED' &&
          backendStatus !== 'REVOKED');

      if (shouldPreserveLocal) {
        status = localStatus || status;
        inProgressAt = existing.inProgressAt || inProgressAt;
        savedAt = existing.savedAt || savedAt;
        completedAt = existing.completedAt || completedAt;
        isSaved = localSaved ? 1 : isSaved;
      }
    } else if (localHasFreshEdits) {
      // For non-PENDING status: if local has fresher edits than server, preserve
      // local edits but still accept server-side administrative changes.
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
