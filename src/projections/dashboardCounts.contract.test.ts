// Contract test for DASHBOARD_COUNTS_SELECT — the dashboard's counter rules.
//
// This runs the REAL query against REAL SQLite (node:sqlite) over the REAL
// CREATE TABLE from schema.ts. Nothing here re-types the rule: if the SQL is
// wrong, these assertions fail.
//
// Why it exists: these rules have drifted twice. First between two hand-typed
// SQL copies (rebuildAll vs rebuildDashboard, which disagreed on the Bug-31
// `is_saved` exclusion). Then — the case pinned below — between this SQL and the
// JS copy in TaskListProjection.getCounts, which feeds the tab badges.
//
//     npm run contract:dashboard-counts
//
// ⚠️ The same rules are expressed in JS over `task_list_projection` by
// TaskListProjection.getCounts()/list(). SQLite and JS cannot share one
// implementation, so they are kept in lockstep by hand. This test pins the SQL
// side; change one, change the other.

import { DASHBOARD_COUNTS_SELECT } from './dashboardCountsSql.ts';
import { SCHEMA_SQL } from '../database/schema.ts';

// node:sqlite has no types under the RN tsconfig (no @types/node); the surface
// we use is declared ambiently in src/types/node-sqlite.d.ts. Mirrors
// src/sync/reconcileTaskIdentity.contract.test.ts.
declare const process: { exitCode?: number };

import { DatabaseSync } from 'node:sqlite';

let passed = 0;
const failures: string[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(
      `${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

type Row = {
  status: string;
  is_saved?: number;
  is_revoked?: number;
};

type Counts = {
  assigned: number;
  inProgress: number;
  completed: number;
  saved: number;
  active: number;
  submitted: number;
};

/** Insert the given tasks into a fresh DB and run the REAL counter SQL. */
function countsFor(rows: Row[]): Counts {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(SCHEMA_SQL);
    const insert = db.prepare(
      `INSERT INTO tasks (id, case_id, verification_task_id, title, customer_name,
         status, is_saved, is_revoked, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    rows.forEach((row, i) => {
      insert.run(
        `t${i}`,
        1,
        `vt${i}`,
        'Title',
        'Customer',
        row.status,
        row.is_saved ?? 0,
        row.is_revoked ?? 0,
        '2026-07-17T00:00:00.000Z',
      );
    });
    // The real INSERT target, so the column order is exercised too.
    db.exec(`INSERT INTO dashboard_projection ${DASHBOARD_COUNTS_SELECT}`);
    const out = db
      .prepare('SELECT * FROM dashboard_projection WHERE id = 1')
      .all()[0] as Record<string, number>;
    return {
      assigned: out.assigned_count,
      inProgress: out.in_progress_count,
      completed: out.completed_count,
      saved: out.saved_count,
      active: out.active_count,
      submitted: out.submitted_count,
    };
  } finally {
    db.close();
  }
}

check('the SQL is valid against the real schema and column order', () => {
  const c = countsFor([{ status: 'ASSIGNED' }]);
  assert(c.assigned === 1, `assigned=${c.assigned}`);
});

check('a REVOKED + SAVED draft is NOT counted as Saved', () => {
  // THE drift this test exists for, and it is reachable: the agent saves a
  // draft (is_saved=1, status=IN_PROGRESS, status op queued), the office
  // revokes, and down-sync writes is_revoked=1 while the conflict resolver
  // keeps the local status. The Dashboard said "Saved: 1"; the tab badge said 0
  // and the tab was empty, so the agent tapped a card that led nowhere.
  const c = countsFor([{ status: 'IN_PROGRESS', is_saved: 1, is_revoked: 1 }]);
  assert(c.saved === 0, `revoked+saved counted as Saved (saved=${c.saved})`);
  assert(c.active === 0, `revoked task counted as active (active=${c.active})`);
});

check('a SUBMITTED task that still carries is_saved is NOT counted as Saved', () => {
  // getCounts/list() both exclude SUBMITTED from Saved. The SQL used to test
  // only `status != 'COMPLETED'`, so it counted this row and the badge did not.
  const c = countsFor([{ status: 'SUBMITTED', is_saved: 1 }]);
  assert(c.saved === 0, `submitted+saved counted as Saved (saved=${c.saved})`);
  assert(c.submitted === 1, `submitted=${c.submitted}`);
});

check('a genuine saved draft IS counted as Saved', () => {
  const c = countsFor([{ status: 'IN_PROGRESS', is_saved: 1 }]);
  assert(c.saved === 1, `saved=${c.saved}`);
});

check('a saved draft is NOT double-counted in IN_PROGRESS (Bug 31)', () => {
  // The original drift: the is_saved exclusion existed in one SQL copy only, so
  // the same task was counted in both buckets depending on which rebuild ran.
  const c = countsFor([{ status: 'IN_PROGRESS', is_saved: 1 }]);
  assert(c.inProgress === 0, `saved draft counted in IN_PROGRESS (${c.inProgress})`);
  assert(c.saved === 1, `saved=${c.saved}`);
});

check('revoked ASSIGNED / IN_PROGRESS are excluded everywhere', () => {
  const c = countsFor([
    { status: 'ASSIGNED', is_revoked: 1 },
    { status: 'IN_PROGRESS', is_revoked: 1 },
  ]);
  assert(c.assigned === 0, `assigned=${c.assigned}`);
  assert(c.inProgress === 0, `inProgress=${c.inProgress}`);
  assert(c.active === 0, `active=${c.active}`);
});

check("submitted_count = SUBMITTED + the office's COMPLETED", () => {
  // The device has no Completed tab: the office flipping SUBMITTED -> COMPLETED
  // must not make the task vanish from the agent's count (ADR-0047).
  const c = countsFor([{ status: 'SUBMITTED' }, { status: 'COMPLETED' }]);
  assert(c.submitted === 2, `submitted=${c.submitted}, expected 2`);
  assert(c.completed === 1, `completed=${c.completed}, expected 1`);
});

check('a revoked SUBMITTED task is not counted as submitted', () => {
  const c = countsFor([{ status: 'SUBMITTED', is_revoked: 1 }]);
  assert(c.submitted === 0, `submitted=${c.submitted}`);
});

if (failures.length > 0) {
  console.error(`\ndashboardCounts contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\ndashboardCounts contract: ${passed} checks passed`);
}
