// 2026-07-16 (owner rule): the FIELD app's terminal state is SUBMITTED.
//
// ADR-0047 splits completion in two: the agent submits (SUBMITTED — their work
// is done), and later the OFFICE signs it off (COMPLETED). That second step is
// a backend job field. The agent does not act on it, cannot change it, and has
// no Completed tab to view it — so COMPLETED must never reach their eyes. Once
// they submit, their card says SUBMITTED and stays that way.
//
// Normalise at the DISPLAY boundary only. `tasks.status` keeps the true
// COMPLETED value because the retention sweep, the projections and sync
// reconciliation all depend on it — this is about what the agent is shown,
// not about lying in the database.

/** The status to SHOW a field agent. COMPLETED is the office's word for it. */
export const toFieldStatus = (status: string | null | undefined): string => {
  const raw = String(status ?? '');
  return raw.toUpperCase() === 'COMPLETED' ? 'SUBMITTED' : raw;
};

// 2026-07-17: THE "has the agent finished this task?" predicate — true for
// SUBMITTED and for the office's COMPLETED, since both mean the agent's own work
// is done and uploading.
//
// Import this instead of testing `task.status === 'COMPLETED'`. That test is the
// bug it replaces: the DEVICE NEVER WRITES COMPLETED (CompleteTaskUseCase and
// FormUploader write SUBMITTED; COMPLETED only arrives via down-sync when the
// office signs off), so it is false for the entire window that matters — from
// submit until sign-off. TaskDetailScreen gated its sync banner AND its Resubmit
// button on it, which made the only escape hatch for a DLQ'd submission
// unreachable exactly when it was needed, while TaskCard — correctly testing the
// field-terminal set — told the agent to "tap into TaskDetailScreen" to see the
// failure. By the time COMPLETED does arrive, the submission has obviously
// reached the server, so the banner could only ever say "synced".
export const isFieldSubmitted = (status: string | null | undefined): boolean =>
  toFieldStatus(status).toUpperCase() === 'SUBMITTED';
