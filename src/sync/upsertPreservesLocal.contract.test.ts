// Contract test for the task pull upsert (UPSERT_TASK_FROM_SERVER_SQL).
//
// Runner-free (frozen stack, no jest); run via Node type-stripping, mirroring
// src/sync/syncMetadata.contract.test.ts:
//
//     npm run contract:pull-preserves-local
//
// THE BUG THIS PINS (CASE-000008 / CASE-000004-2, prod, 2026-07-15/16):
// form_data_json and verification_outcome are written by the DEVICE at submit
// (SubmitVerificationUseCase) and do NOT flow through SyncConflictResolver the
// way status/is_saved/saved_at do. The server echoes them only once the
// submission actually lands — so while a submission was stuck (photos through,
// form leg failed), every 5-minute background pull carried NULL for both and
// wiped the device's own copy, leaving the autosave blob as the ONLY surviving
// copy of the agent's answers. The fix: both columns COALESCE in the ON
// CONFLICT clause — server-null preserves local, server-non-null still wins.
//
// Unlike the syncMetadata precedent (which mirrors its SQL), this test imports
// the PRODUCTION statement itself, so the two can never drift.

declare const process: { exitCode?: number };

import { DatabaseSync } from 'node:sqlite';
import { UPSERT_TASK_FROM_SERVER_SQL } from './upsertTaskSql.ts';

// Minimal tasks table: every column the upsert names, TEXT/INTEGER affinity.
const SCHEMA = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT, case_number TEXT, verification_task_id TEXT, verification_task_number TEXT,
  title TEXT, description TEXT, customer_name TEXT, customer_calling_code TEXT,
  customer_phone TEXT, customer_email TEXT, company_name TEXT, address_street TEXT,
  address_city TEXT, address_state TEXT, address_pincode TEXT, latitude REAL, longitude REAL,
  status TEXT, priority TEXT, assigned_at TEXT, updated_at TEXT, completed_at TEXT,
  notes TEXT, verification_type TEXT, verification_outcome TEXT, applicant_type TEXT,
  backend_contact_number TEXT, created_by_backend_user TEXT, assigned_to_field_user TEXT,
  client_id TEXT, client_name TEXT, client_code TEXT,
  product_id TEXT, product_name TEXT, product_code TEXT,
  verification_type_id TEXT, verification_type_name TEXT, verification_type_code TEXT,
  form_data_json TEXT, is_revoked INTEGER, revoked_at TEXT, revoked_by_name TEXT,
  revoke_reason TEXT, in_progress_at TEXT, saved_at TEXT, is_saved INTEGER,
  attachment_count INTEGER, sync_status TEXT, last_synced_at TEXT, local_updated_at TEXT
);
`;

/** Bind list in the exact order the production call site builds it
 *  (SyncDownloadService.upsertTaskFromServer). 50 placeholders — sync_status
 *  is the literal 'SYNCED' in the SQL. */
function binds(o: {
  status?: string;
  formDataJson?: string | null;
  verificationOutcome?: string | null;
}): unknown[] {
  return [
    'task-1', // id
    'case-1', // case_id
    'CASE-1', // case_number
    'task-1', // verification_task_id
    'CASE-1-1', // verification_task_number
    'CASE-1-1', // title
    '', // description
    'CUSTOMER', // customer_name
    null, // customer_calling_code
    null, // customer_phone
    null, // customer_email
    null, // company_name
    'ADDR', // address_street
    '', // address_city
    '', // address_state
    '400001', // address_pincode
    null, // latitude
    null, // longitude
    o.status ?? 'ASSIGNED', // status (mergedState)
    'MEDIUM', // priority
    't0', // assigned_at
    't0', // updated_at
    null, // completed_at (mergedState)
    null, // notes
    'BUSINESS', // verification_type
    o.verificationOutcome ?? null, // verification_outcome
    null, // applicant_type
    null, // backend_contact_number
    null, // created_by_backend_user
    null, // assigned_to_field_user
    null, // client_id
    null, // client_name
    null, // client_code
    null, // product_id
    null, // product_name
    null, // product_code
    null, // verification_type_id
    null, // verification_type_name
    null, // verification_type_code
    o.formDataJson ?? null, // form_data_json
    0, // is_revoked
    null, // revoked_at
    null, // revoked_by_name
    null, // revoke_reason
    null, // in_progress_at (mergedState)
    null, // saved_at (mergedState)
    0, // is_saved (mergedState)
    0, // attachment_count
    't1', // last_synced_at
    't1', // local_updated_at
  ];
}

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}
function upsert(
  db: DatabaseSync,
  o: Parameters<typeof binds>[0],
): void {
  db.prepare(UPSERT_TASK_FROM_SERVER_SQL).run(
    ...(binds(o) as (string | number | null)[]),
  );
}
function row(db: DatabaseSync): Record<string, unknown> {
  return db.prepare("SELECT * FROM tasks WHERE id = 'task-1'").all()[0] ?? {};
}

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}
async function check(name: string, fn: () => void): Promise<void> {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(
      `${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main(): Promise<void> {
  await check(
    'a pull with NO server form PRESERVES the local form + outcome (the bug)',
    () => {
      const db = openDb();
      // Device state: agent submitted locally — form + outcome written.
      upsert(db, {
        status: 'IN_PROGRESS',
        formDataJson: '{"answers":{"metPerson":"YES"}}',
        verificationOutcome: 'POSITIVE',
      });
      // Background pull while the submission is stuck: server has neither.
      upsert(db, { status: 'IN_PROGRESS' });
      const r = row(db);
      assert(
        r.form_data_json === '{"answers":{"metPerson":"YES"}}',
        `local form was wiped: ${String(r.form_data_json)}`,
      );
      assert(
        r.verification_outcome === 'POSITIVE',
        `local outcome was wiped: ${String(r.verification_outcome)}`,
      );
    },
  );

  await check('the same pull still updates the resolver-fed fields', () => {
    const db = openDb();
    upsert(db, { status: 'ASSIGNED', formDataJson: '{"a":1}' });
    upsert(db, { status: 'IN_PROGRESS' });
    const r = row(db);
    assert(
      r.status === 'IN_PROGRESS',
      `status must follow the merged value, got ${String(r.status)}`,
    );
    assert(r.form_data_json === '{"a":1}', 'form must survive that update');
  });

  await check(
    'a NON-null server copy still wins (post-submit echo / office completion)',
    () => {
      const db = openDb();
      upsert(db, {
        formDataJson: '{"local":true}',
        verificationOutcome: 'REFER',
      });
      upsert(db, {
        formDataJson: '{"server":true}',
        verificationOutcome: 'NEGATIVE',
      });
      const r = row(db);
      assert(
        r.form_data_json === '{"server":true}',
        'server form must win when present',
      );
      assert(
        r.verification_outcome === 'NEGATIVE',
        'server outcome must win when present',
      );
    },
  );

  await check('a fresh insert takes the server payload verbatim', () => {
    const db = openDb();
    upsert(db, { formDataJson: null, verificationOutcome: null });
    const r = row(db);
    assert(r.form_data_json === null, 'no phantom form on fresh insert');
    assert(r.sync_status === 'SYNCED', 'insert stamps SYNCED');
  });

  if (failures.length) {
    for (const f of failures) {
      console.error(`  not ok - ${f}`);
    }
    console.error(
      `upsertPreservesLocal contract: ${failures.length} FAILED, ${passed} passed`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`upsertPreservesLocal contract: ${passed} checks passed`);
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
