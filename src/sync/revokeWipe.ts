// revokeWipe — purge a revoked task's local PII (photos + form drafts) during
// down-sync, and decide when that purge should run.
//
// Extracted from SyncDownloadService.upsertTaskFromServer so the SQL is
// unit-testable without the RN runtime, mirroring reconcileTaskIdentity.
//
// A2026-0623-11: previously the wipe was gated on the MERGED status, which a
// queued/fresher local edit could mask back to IN_PROGRESS — so a server-side
// revoke left is_revoked=1 but never purged the photos/drafts. The gate now
// keys off the SERVER revoked signal so the revoked column and the wipe can't
// diverge, and is idempotent once the row is already REVOKED.

import type { IdentityReconcileExecutor } from './reconcileTaskIdentity.ts';

/**
 * Whether this down-sync tick just revoked the task and must purge its PII.
 * `serverRevoked` is the authoritative server signal (revoked flag OR a merged
 * status of REVOKED). The `previousStatus` guard keeps it idempotent: once the
 * local row is already REVOKED the purge has run, so it does not re-fire.
 */
export function isJustRevoked(
  serverRevoked: boolean,
  previousStatus: string | null | undefined,
): boolean {
  return serverRevoked && previousStatus !== 'REVOKED';
}

/**
 * Delete the revoked task's attachments (photos) and form_submissions (drafts)
 * and return the on-disk file paths to unlink after the transaction commits
 * (RNFS is non-transactional, so the caller defers the unlinks).
 */
export async function purgeRevokedTaskPii(
  db: IdentityReconcileExecutor,
  taskId: string,
): Promise<string[]> {
  const rows = await db.query<{
    local_path?: string;
    thumbnail_path?: string;
  }>('SELECT local_path, thumbnail_path FROM attachments WHERE task_id = ?', [
    taskId,
  ]);
  const orphanPaths = rows.flatMap(r =>
    [r.local_path, r.thumbnail_path].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    ),
  );
  await db.execute('DELETE FROM attachments WHERE task_id = ?', [taskId]);
  await db.execute('DELETE FROM form_submissions WHERE task_id = ?', [taskId]);
  return orphanPaths;
}
