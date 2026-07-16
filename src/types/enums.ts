// The task lifecycle status, as stored in `tasks.status`.
//
// 2026-07-17: this file used to be 468 lines and 57 enums — a parallel catalog
// of every verification form's option values (HouseStatus, WorkingStatus,
// Relation, DocumentType, the per-outcome ERT/Office/Business sets, …). All 56
// of them were DEAD: `TaskStatus` was the only one anything imported.
//
// They were also DRIFTED, which is why they were deleted rather than wired up:
//   * HouseStatus said `Opened = 'Opened'`. The form emits 'Open'
//     (LegacyFormTemplateBuilders: `houseStatus: ['Open', 'Closed']`), and every
//     live condition tests 'Open'. The string 'Opened' appears NOWHERE else in
//     the app.
//   * WorkingStatus listed 8 values (Retired, Unemployed, Student, House
//     Person, …) — none of which appear anywhere outside this file. The
//     residence form offers 3, and the OFFICE form offers a completely
//     different set ('Company Payroll', …) that one enum cannot represent.
//   * RevokeReason was a straight DUPLICATE of the live enum of the same name in
//     `types/api.ts` — same five members, and only the api.ts one is imported
//     (TaskRevokeModal uses it for FALLBACK_REASONS). The real reasons come from
//     the local `revoke_reasons` mirror of server master data (A2.4); the enum
//     is only the offline fallback before the first sync. Two identical copies,
//     one live, one dead: this file's.
//
// That made it the most dangerous kind of dead code: it READ as the domain
// catalog, so writing `HouseStatus.Opened` into a new condition would typecheck
// and then silently never match. The device form templates are the source of
// truth for option values (mobile form + the DB outcome catalog); nothing else
// gets to hold a competing copy.
export enum TaskStatus {
  Pending = 'PENDING',
  Assigned = 'ASSIGNED',
  InProgress = 'IN_PROGRESS',
  Submitted = 'SUBMITTED',
  // The OFFICE's sign-off (ADR-0047) — the device NEVER writes this; it only
  // arrives via down-sync. Kept because `tasks.status` really does hold it, and
  // code must be able to recognise it. To decide whether the agent has finished
  // a task, use `isFieldSubmitted` (utils/fieldStatus) — never a bare
  // comparison against this member.
  Completed = 'COMPLETED',
  Revoked = 'REVOKED',
  // 2026-07-17: `Saved = 'SAVED'` and `SubmittedPendingSync =
  // 'SUBMITTED_PENDING_SYNC'` were removed. Both were phantom statuses: nothing
  // ever wrote either to `tasks.status`. "Saved" is a device-only concept
  // carried by the `is_saved` COLUMN and used as a filter/tab id
  // (TaskListProjection, TaskListScreen), not a status; 'SUBMITTED_PENDING_SYNC'
  // appeared nowhere in the app at all. Declaring them here invited code to
  // test for a status the row can never hold.
}
