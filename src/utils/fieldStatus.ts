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
