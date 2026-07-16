// Contract test for the DB_VERSION <-> MIGRATIONS invariant.
//
// 2026-07-17: DB_VERSION sat at 22 while MIGRATIONS ended at v23. That is not
// cosmetic — it breaks FRESH INSTALLS ONLY, which is why it survived on-device
// testing:
//
//   * Fresh install: runMigrations sees user_version = 0, stamps
//     user_version = DB_VERSION and RETURNS without running any migration —
//     correct, because SCHEMA_SQL's CREATE TABLEs already carry every column.
//     With DB_VERSION = 22, that stamps 22. On the SECOND launch
//     currentVersion = 22, so v23 is "pending" and runs
//     `ALTER TABLE task_list_projection ADD COLUMN sync_status` against a table
//     that already has it -> "duplicate column name" -> the transaction rolls
//     back -> `PRAGMA user_version = 23` never lands -> it re-runs and re-fails
//     on EVERY launch, rejecting migrationsReady each time.
//   * Upgrade: the device's older table genuinely lacks the column, so the
//     ALTER succeeds. Upgrades were the only path anyone tested.
//
// Keeping DB_VERSION == max(MIGRATIONS.version) makes both paths agree by
// construction. Run:
//
//     npm run contract:schema-version
//
// Dependency-free: schema.ts is pure constants + SQL strings, so it loads under
// `node --experimental-strip-types` with no native module.

import { DB_VERSION, MIGRATIONS, SCHEMA_SQL } from './schema.ts';

declare const process: { exitCode?: number };

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

const versions = MIGRATIONS.map(m => m.version);
const maxVersion = Math.max(...versions);

check('DB_VERSION equals the highest migration version', () => {
  // If this fails: you added a migration and did not bump DB_VERSION (or vice
  // versa). Fresh installs will re-run the trailing migration every launch.
  assert(
    DB_VERSION === maxVersion,
    `DB_VERSION=${DB_VERSION} but the highest migration is v${maxVersion}. ` +
      'A fresh install stamps user_version=DB_VERSION and runs no migrations, ' +
      'so any migration above DB_VERSION fires on the next launch against a ' +
      'schema that already has the change.',
  );
});

check('migration versions are unique', () => {
  const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
  assert(dupes.length === 0, `duplicate migration versions: ${dupes.join(',')}`);
});

check('migration versions are contiguous and ascending', () => {
  // A gap means a device sitting on the missing version can never advance past
  // it; out-of-order means `m.version > currentVersion` applies them wrongly.
  for (let i = 1; i < versions.length; i++) {
    assert(
      versions[i] === versions[i - 1] + 1,
      `migration order broken at index ${i}: v${versions[i - 1]} -> v${versions[i]}`,
    );
  }
});

check('every migration carries SQL and a description', () => {
  for (const m of MIGRATIONS) {
    assert(
      typeof m.sql === 'string' && m.sql.trim().length > 0,
      `migration v${m.version} has empty sql`,
    );
    assert(
      typeof m.description === 'string' && m.description.trim().length > 0,
      `migration v${m.version} has no description`,
    );
  }
});

check('no migration ADDs a column the CREATE TABLE already declares', () => {
  // The exact v23 trap, generalised: a fresh install builds from SCHEMA_SQL, so
  // an ADD COLUMN for a column already in the CREATE TABLE can only ever fail.
  // Such a migration is legitimate ONLY for the upgrade path — and it is
  // unreachable on a fresh install precisely because DB_VERSION covers it.
  // So: assert every ADD COLUMN target is <= DB_VERSION, i.e. never pending on
  // a fresh install.
  const addColumn =
    /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi;
  for (const m of MIGRATIONS) {
    if (m.version <= DB_VERSION) continue; // covered by the fresh-install stamp
    let match: RegExpExecArray | null;
    while ((match = addColumn.exec(m.sql)) !== null) {
      const [, table, column] = match;
      const createBlock = SCHEMA_SQL.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([^;]*?)\\)\\s*;`, 'is'),
      );
      assert(
        !createBlock || !new RegExp(`\\b${column}\\b`).test(createBlock[1]),
        `migration v${m.version} adds ${table}.${column}, but the CREATE TABLE ` +
          'already declares it — this fails on a fresh install.',
      );
    }
  }
});

if (failures.length > 0) {
  console.error(`\nschemaVersion contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nschemaVersion contract: ${passed} checks passed`);
}
