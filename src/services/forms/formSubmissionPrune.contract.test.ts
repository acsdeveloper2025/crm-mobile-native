// Contract test for pruneFormDataToTemplate — the submit-boundary guard that
// stops fields from an ABANDONED outcome reaching the server and the report.
//
// Switching outcome mid-form keeps formValues (shared fields carry over, and
// switching back preserves work), so the local blob accumulates every outcome's
// fields — measured: residence POSITIVE -> UNTRACEABLE leaves 31 orphans.
// crm2's report filters by verification TYPE, not outcome, and has a
// never-lose-a-field catch-all, so those orphans render.
//
// Runs against the REAL legacy templates, not a mock — the whole point is that
// the field sets are the ones the device actually ships.
//
//     npm run contract:form-prune

import {
  pruneFormDataToTemplate,
  templateFieldKeys,
} from './FormValidationEngine.ts';
import {
  buildLegacyTemplateForFormType,
  getAllowedOutcomesForFormType,
} from '../../screens/forms/LegacyFormTemplateBuilders.ts';
import type { FormTemplate } from '../../types/api';

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

const tpl = (outcome: string): FormTemplate =>
  buildLegacyTemplateForFormType('residence', outcome) as FormTemplate;

/** Fill every field of an outcome's form with a marker value. */
const fillAll = (outcome: string): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const key of templateFieldKeys(tpl(outcome))) {
    values[key] = `filled:${key}`;
  }
  return values;
};

check('remarks survives — it is derived at submit and is in NO template', () => {
  // Regression guard: `remarks` is built by FormSubmissionService from
  // remarks || otherObservation. A naive prune drops it and every report
  // loses its remarks line.
  assert(
    !templateFieldKeys(tpl('POSITIVE')).has('remarks'),
    'precondition failed: remarks unexpectedly IS a template field',
  );
  const out = pruneFormDataToTemplate(tpl('POSITIVE'), {
    remarks: 'MET THE APPLICANT',
    addressLocatable: 'Yes',
  });
  assert(out.remarks === 'MET THE APPLICANT', 'remarks was pruned away');
});

check('POSITIVE -> UNTRACEABLE: every abandoned-outcome orphan is dropped', () => {
  const filledAsPositive = fillAll('POSITIVE');
  const untraceable = tpl('UNTRACEABLE');
  const out = pruneFormDataToTemplate(untraceable, filledAsPositive);

  const allowed = templateFieldKeys(untraceable);
  for (const key of Object.keys(out)) {
    assert(allowed.has(key), `orphan "${key}" survived the prune`);
  }
  // The POSITIVE-only fields that made the report self-contradicting.
  for (const orphan of ['houseStatus', 'totalFamilyMembers', 'metPersonName']) {
    assert(
      filledAsPositive[orphan] !== undefined,
      `precondition: ${orphan} should be a POSITIVE field`,
    );
    assert(!(orphan in out), `${orphan} must not reach an UNTRACEABLE report`);
  }
});

check('shared fields are KEPT — no retyping, no data loss', () => {
  const filledAsPositive = fillAll('POSITIVE');
  const out = pruneFormDataToTemplate(tpl('SHIFTED'), filledAsPositive);
  const shared = [...templateFieldKeys(tpl('POSITIVE'))].filter(k =>
    templateFieldKeys(tpl('SHIFTED')).has(k),
  );
  assert(shared.length > 20, `expected many shared fields, got ${shared.length}`);
  for (const key of shared) {
    assert(out[key] === `filled:${key}`, `shared field ${key} was lost`);
  }
});

check('the device-internal __submission marker never reaches the server', () => {
  const out = pruneFormDataToTemplate(tpl('POSITIVE'), {
    addressLocatable: 'Yes',
    __submission: { status: 'pending' },
  });
  assert(!('__submission' in out), '__submission leaked into the payload');
});

check('a form filled for its OWN outcome passes through untouched', () => {
  for (const outcome of getAllowedOutcomesForFormType('residence')) {
    const filled = fillAll(outcome);
    const out = pruneFormDataToTemplate(tpl(outcome), filled);
    assert(
      Object.keys(out).length === Object.keys(filled).length,
      `${outcome}: prune dropped its own fields (${Object.keys(filled).length} -> ${Object.keys(out).length})`,
    );
  }
});

check('prune never invents a key', () => {
  const out = pruneFormDataToTemplate(tpl('POSITIVE'), { addressLocatable: 'Yes' });
  assert(Object.keys(out).length === 1, `expected 1 key, got ${Object.keys(out).length}`);
});

check('falsy values are preserved (not treated as absent)', () => {
  const out = pruneFormDataToTemplate(tpl('POSITIVE'), {
    addressLocatable: '',
    totalFamilyMembers: 0,
  });
  assert('addressLocatable' in out, 'empty string was dropped');
  assert(out.totalFamilyMembers === 0, 'zero was dropped');
});

if (failures.length > 0) {
  console.error(`\nformSubmissionPrune contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nformSubmissionPrune contract: ${passed} checks passed`);
}
