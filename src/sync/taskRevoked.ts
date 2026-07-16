// THE "did the office revoke this task?" predicate for a down-synced payload.
//
// 2026-07-17: this fact had TWO readers in SyncDownloadService, 25 lines apart,
// and they disagreed:
//   * the `is_revoked` column was bound straight from `task.isRevoked`;
//   * `justRevoked` — which gates the B-148 wipe of local photos and drafts —
//     was read off the CONFLICT-RESOLVED status.
// SyncConflictResolver preserves the local status whenever anything is queued,
// so an office revoke landing while the agent had a queued change produced
// is_revoked=1 with status='IN_PROGRESS'. That row is invisible to every list
// (they all filter is_revoked) AND unreapable by retention (which requires a
// terminal status), so its photos and form drafts stayed on the device forever
// — defeating B-145's "a reassign forces fresh re-capture" — and the wipe never
// fired.
//
// On the wire the two signals are ONE fact: crm2 derives `isRevoked` from
// `status === 'REVOKED'` (apps/api/src/modules/sync/service.ts), and its API
// test pins both. Accept either here so a payload can never be half-revoked,
// and have both writers call this.
//
// Dependency-free on purpose: SyncConflictResolver imports DatabaseService ->
// op-sqlite and cannot be loaded by the contract harness.
export const isRevokedByServer = (task: {
  status?: string | null;
  isRevoked?: boolean;
}): boolean =>
  task.isRevoked === true ||
  String(task.status ?? '').toUpperCase() === 'REVOKED';
