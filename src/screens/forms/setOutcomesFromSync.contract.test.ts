// Contract test for setOutcomesFromSync — the server→device outcome mirror.
//
// The repo has no jest/vitest runner (frozen stack), so this is a self-contained
// assertion script run through Node's type-stripping, mirroring
// src/sync/reconcileTaskIdentity.contract.test.ts:
//
//     npm run contract:outcome-sync
//
// It proves audit finding A2026-0623-02: the crm2 reference feed sends LONG
// verification-type codes (RESIDENCE … PROPERTY_APF), but setOutcomesFromSync
// keyed a short-code map (RV/RC/…/PAV) so every synced row was dropped and the
// picker silently fell back to the hardcoded outcomes. After the fix the long
// codes resolve via resolveFormTypeKey for all 9 form types, the picker is
// driven by the server feed, and PROPERTY_APF shows no phantom NEGATIVE
// (crm2 mig 0090 dropped it from the feed).
//
// It exits non-zero on the first failed assertion.

import {
  setOutcomesFromSync,
  getAllowedOutcomesForFormType,
  getOutcomeLabelForFormType,
} from './LegacyFormTemplateBuilders.ts';
import type { FormTypeKey } from '../../utils/formTypeKey.ts';

declare const process: { exitCode?: number };

// Every LONG verification-type code the crm2 feed emits, paired with the
// device form-type key it must resolve to (all 9 types).
const LONG_CODE_TO_KEY: ReadonlyArray<readonly [string, FormTypeKey]> = [
  ['RESIDENCE', 'residence'],
  ['RESIDENCE_CUM_OFFICE', 'residence-cum-office'],
  ['OFFICE', 'office'],
  ['BUSINESS', 'business'],
  ['BUILDER', 'builder'],
  ['NOC', 'noc'],
  ['DSA_CONNECTOR', 'dsa-connector'],
  ['PROPERTY_INDIVIDUAL', 'property-individual'],
  ['PROPERTY_APF', 'property-apf'],
];

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
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// All 9 LONG codes carry a server-edited POSITIVE label. Before the fix the
// short-code lookup drops every row, so getOutcomeLabel falls back to the
// hardcoded label and never returns the server string for any type.
check(
  'every LONG verification-type code populates the synced label (all 9 types)',
  () => {
    setOutcomesFromSync(
      LONG_CODE_TO_KEY.map(([code]) => ({
        verificationTypeCode: code,
        outcomeCode: 'POSITIVE',
        displayLabel: `${code}-SERVER-LABEL`,
        sortOrder: 0,
      })),
    );
    for (const [code, key] of LONG_CODE_TO_KEY) {
      const label = getOutcomeLabelForFormType(key, 'POSITIVE');
      assert(
        label === `${code}-SERVER-LABEL`,
        `${key}: expected synced label "${code}-SERVER-LABEL", got "${label}"`,
      );
    }
  },
);

// The synced allowed-outcome list — in server sort order — drives the picker.
// PROPERTY_APF's embedded fallback is [UNTRACEABLE, ENTRY_RESTRICTED, POSITIVE];
// the server feed (post crm2 mig 0090) is [POSITIVE, ENTRY_RESTRICTED,
// UNTRACEABLE] with NO NEGATIVE. A different order proves the synced list wins.
check(
  'PROPERTY_APF picker is driven by the server feed, sorted, with no phantom NEGATIVE',
  () => {
    setOutcomesFromSync([
      { verificationTypeCode: 'PROPERTY_APF', outcomeCode: 'POSITIVE', displayLabel: 'Positive', sortOrder: 0 },
      { verificationTypeCode: 'PROPERTY_APF', outcomeCode: 'ENTRY_RESTRICTED', displayLabel: 'ERT', sortOrder: 1 },
      { verificationTypeCode: 'PROPERTY_APF', outcomeCode: 'UNTRACEABLE', displayLabel: 'Untraceable', sortOrder: 2 },
    ]);
    const outcomes = getAllowedOutcomesForFormType('property-apf');
    assert(
      JSON.stringify(outcomes) ===
        JSON.stringify(['POSITIVE', 'ENTRY_RESTRICTED', 'UNTRACEABLE']),
      `expected synced order [POSITIVE, ENTRY_RESTRICTED, UNTRACEABLE], got ${JSON.stringify(outcomes)}`,
    );
    assert(!outcomes.includes('NEGATIVE' as never), 'PROPERTY_APF must not surface a phantom NEGATIVE');
  },
);

// An unknown verification-type code is skipped (resolveFormTypeKey → null) and
// must neither throw nor pollute another type's picker.
check('an unknown verification-type code is skipped without throwing', () => {
  setOutcomesFromSync([
    { verificationTypeCode: 'TOTALLY_UNKNOWN', outcomeCode: 'POSITIVE', displayLabel: 'x', sortOrder: 0 },
    { verificationTypeCode: 'RESIDENCE', outcomeCode: 'POSITIVE', displayLabel: 'R-SRV', sortOrder: 0 },
    { verificationTypeCode: 'RESIDENCE', outcomeCode: 'NSP', displayLabel: 'NSP-SRV', sortOrder: 1 },
  ]);
  const residence = getAllowedOutcomesForFormType('residence');
  assert(
    JSON.stringify(residence) === JSON.stringify(['POSITIVE', 'NSP']),
    `residence should reflect only its synced rows, got ${JSON.stringify(residence)}`,
  );
});

if (failures.length > 0) {
  console.error(`\nsetOutcomesFromSync contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nsetOutcomesFromSync contract: ${passed} checks passed`);
}
