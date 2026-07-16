// THE dashboard counter definition. Feeds `dashboard_projection` (column order:
// id, assigned, in_progress, completed, saved, active, last_sync_at, updated_at,
// submitted).
//
// 2026-07-16: it used to be two hand-typed copies — `rebuildAll` and
// `rebuildDashboard` — and they had ALREADY drifted: the Bug-31 `is_saved`
// exclusion was applied to the rebuildAll copy only, so a saved-but-IN_PROGRESS
// task was counted in BOTH IN_PROGRESS and SAVED, or in SAVED alone, depending
// purely on which rebuild path happened to run last. One definition, imported by
// both.
//
// `submitted_count` counts SUBMITTED + COMPLETED so the Dashboard card matches
// the Submitted tab (TaskListProjection.list's SUBMITTED branch): the device has
// no Completed tab, so the office signing a task off (ADR-0047) must not make it
// vanish from the agent's count. `completed_count` still tracks the
// office-signed-off subset on its own — nothing renders it.
//
// 2026-07-17: `saved_count` gained the `is_revoked` guard and the SUBMITTED
// exclusion it was missing. It read `is_saved = 1 AND status != 'COMPLETED'`,
// while the JS copy (TaskListProjection.getCounts) skips revoked rows and
// excludes SUBMITTED — so the two disagreed on a REACHABLE row: save a draft,
// have the office revoke it, and the down-sync writes is_revoked=1 while the
// conflict resolver keeps status='IN_PROGRESS' and is_saved=1. The Dashboard
// then said "Saved: 1" while the badge said 0 and the tab was empty — the agent
// tapping a card that leads nowhere. The JS copy was right.
//
// Split out of ProjectionUpdater on 2026-07-17 for one reason: that module
// imports DatabaseService -> op-sqlite, so it cannot be loaded by the contract
// harness. These rules had already drifted twice, and the copy nobody tests is
// the one that lies — so the SQL lives here, dependency-free, and
// dashboardCounts.contract.test.ts runs it against real SQLite.
//
// ⚠️ These rules are ALSO expressed in JS, over `task_list_projection`, by
// TaskListProjection.getCounts()/list() — which feed the tab badges and the
// tabs themselves. SQLite and JS cannot share one implementation, so they must
// be kept in lockstep BY HAND. If you change a rule here, change it there, and
// vice versa. The contract test pins this side.
//
// Column order is positional — it must match the dashboard_projection INSERT
// in ProjectionUpdater and the CREATE TABLE in schema.ts (note submitted_count
// is LAST so a fresh-install CREATE matches the v21 ALTER, which appends).
export const DASHBOARD_COUNTS_SELECT = `SELECT
     1,
     COALESCE(SUM(CASE WHEN status = 'ASSIGNED' AND (is_revoked IS NULL OR is_revoked = 0) AND (is_saved IS NULL OR is_saved = 0) THEN 1 ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' AND (is_revoked IS NULL OR is_revoked = 0) AND (is_saved IS NULL OR is_saved = 0) THEN 1 ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN is_saved = 1 AND status NOT IN ('COMPLETED','SUBMITTED') AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
     (SELECT last_download_sync_at FROM sync_metadata WHERE id = 1),
     CURRENT_TIMESTAMP,
     COALESCE(SUM(CASE WHEN status IN ('SUBMITTED','COMPLETED') AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0)
   FROM tasks`;
