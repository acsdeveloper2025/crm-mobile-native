// reconcileTaskIdentity — fold any local rows that represent THIS task under a
// stale local id into the canonical id, re-pointing their child rows and then
// removing the stale parent.
//
// WHY (root cause of the recurring down-sync failure): the previous inline
// version in upsertTaskFromServer matched stale rows by `case_id`. After
// ADR-0054 the down-sync sends the case UUID in `case_id`, which is SHARED by
// every sibling task of a case (the backend down-sync is `case_tasks JOIN cases`
// keyed on the assignee). Matching on it therefore treated legitimate sibling
// tasks as "stale" — re-pointing their attachments/locations/forms onto the
// task being synced and DELETEing the sibling task row (silent data loss), and,
// because the re-point ran BEFORE the canonical task row was inserted, throwing
// `FOREIGN KEY constraint failed` (PRAGMA foreign_keys = ON) whenever a sibling
// had child rows — which aborted the entire download cycle.
//
// Correct identity key: a row representing THIS task under an older local id has
// the same `verification_task_id` (the canonical backend task UUID) but a
// different `id`. This mirrors TaskRepository.repairTaskIdentity exactly.
//
// MUST be called AFTER the canonical task row has been inserted/upserted, so the
// re-pointed child FKs always resolve. In steady state (id == verification_task_id)
// this matches zero rows and is a no-op.

type SqlParam = string | number | null;

/**
 * Minimal executor surface this helper needs. SyncEngineRepository satisfies it;
 * a test can pass any object with the same `query` / `execute` shape (e.g. a
 * node:sqlite-backed adapter) so the SQL logic is unit-testable without the RN
 * runtime.
 */
export interface IdentityReconcileExecutor {
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  execute(sql: string, params?: SqlParam[]): Promise<unknown>;
}

export async function reconcileTaskIdentity(
  db: IdentityReconcileExecutor,
  canonicalTaskId: string,
): Promise<void> {
  const staleRows = await db.query<{ id: string }>(
    'SELECT id FROM tasks WHERE verification_task_id = ? AND id != ?',
    [canonicalTaskId, canonicalTaskId],
  );

  for (const stale of staleRows) {
    await db.execute('UPDATE attachments SET task_id = ? WHERE task_id = ?', [
      canonicalTaskId,
      stale.id,
    ]);
    await db.execute('UPDATE locations SET task_id = ? WHERE task_id = ?', [
      canonicalTaskId,
      stale.id,
    ]);
    await db.execute('UPDATE form_submissions SET task_id = ? WHERE task_id = ?', [
      canonicalTaskId,
      stale.id,
    ]);
    await db.execute(
      "UPDATE sync_queue SET entity_id = ? WHERE entity_type IN ('TASK', 'TASK_STATUS') AND entity_id = ?",
      [canonicalTaskId, stale.id],
    );
    await db.execute('DELETE FROM tasks WHERE id = ?', [stale.id]);
  }
}
