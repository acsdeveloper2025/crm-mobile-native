import { TaskRepository } from '../repositories/TaskRepository';
import { SyncQueue } from '../services/SyncQueue';

// C13 (audit 2026-04-20): the previous module-level `recovered` flag was a
// one-shot — once the first FetchAssignments call triggered recovery, no
// subsequent call in the same session could run it again. Mid-session
// orphans (PENDING attachments with no queue entry) and task-identity
// mismatches (server-pushed id changes) stayed broken until app restart.
//
// Replaced with a time-based throttle: re-run at most every 30 s. All
// three ops are idempotent — `recoverExpiredLeases` updates only
// expired-lease rows, `reconcileOrphanAttachments` uses a LEFT JOIN to
// pick up true orphans only, and `repairTaskIdentity` only touches rows
// where id != verification_task_id. Zero-match overhead is ~10-50 ms.
// `force: true` bypasses the throttle for explicit recovery calls.
const RECOVERY_THROTTLE_MS = 30_000;
let lastRunAt = 0;

export const RecoverOfflineStateUseCase = {
  async execute(force: boolean = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastRunAt < RECOVERY_THROTTLE_MS) {
      return;
    }
    lastRunAt = now;
    await SyncQueue.recoverExpiredLeases();
    await SyncQueue.reconcileOrphanAttachments();
    // 2026-04-27 audit fix F4: closes the SubmitVerificationUseCase silent-
    // loss window (form_submissions row written, then crash before queue
    // enqueue). See SyncQueue.reconcileOrphanFormSubmissions.
    await SyncQueue.reconcileOrphanFormSubmissions();
    await TaskRepository.repairTaskIdentity();
  },
};
