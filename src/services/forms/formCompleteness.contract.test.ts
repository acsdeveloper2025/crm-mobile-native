// Contract test for evaluateFormCompleteness — the ONE "is this form
// complete?" predicate shared by the Save button, Submit, the Saved-tab
// submit path and auto-submit (2026-07-16: Save shipped with no validation
// because it didn't share Submit's copy).
//
// The repo has no jest/vitest runner (frozen stack), so this is a
// self-contained assertion script run through Node's type-stripping:
//
//     npm run contract:form-completeness
//
// It exits non-zero on the first failed assertion. Dependency-free (only the
// pure engine under test).

import {
  evaluateFormCompleteness,
  MIN_VERIFICATION_PHOTOS,
  MIN_SELFIE_PHOTOS,
} from './FormValidationEngine.ts';
import type { FormTemplate } from '../../types/api';

// The RN tsconfig's `types` is jest-only (no @types/node), so declare the one
// Node global we use — mirrors src/sync/runWithTimeout.contract.test.ts.
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

// Minimal template exercising: plain required, optional, conditional-hidden
// required, and requiredWhen — the shapes LegacyFormTemplateBuilders emits.
const template = {
  sections: [
    {
      id: 's1',
      title: 'Main',
      fields: [
        { id: 'addressConfirmed', name: 'addressConfirmed', label: 'Address Confirmed', type: 'radio', required: true, order: 1, options: [ { label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' } ] },
        { id: 'remarks', name: 'remarks', label: 'Remarks', type: 'text', required: false, order: 2 },
        {
          id: 'shiftedTo', name: 'shiftedTo', label: 'Shifted To', type: 'text', required: true, order: 3,
          conditional: { field: 'addressConfirmed', operator: 'equals', value: 'No' },
        },
        {
          id: 'callConfirmation', name: 'callConfirmation', label: 'Call Confirmation', type: 'select', order: 4,
          options: [{ label: 'Loan Cancel', value: 'Loan Cancel' }],
          conditional: { field: 'callRemark', operator: 'equals', value: 'Pickup call & confirm' },
          requiredWhen: { field: 'callRemark', operator: 'equals', value: 'Pickup call & confirm' },
        },
      ],
    },
  ],
} as unknown as FormTemplate;

const completeValues = { addressConfirmed: 'Yes', callRemark: 'Ring' };
const PHOTOS = MIN_VERIFICATION_PHOTOS;
const SELFIES = MIN_SELFIE_PHOTOS;

check('evidence minimums are the owner rule: 5 photos + 1 selfie', () => {
  assert(MIN_VERIFICATION_PHOTOS === 5, `photos min = ${MIN_VERIFICATION_PHOTOS}`);
  assert(MIN_SELFIE_PHOTOS === 1, `selfie min = ${MIN_SELFIE_PHOTOS}`);
});

check('all required filled + evidence met => complete', () => {
  const r = evaluateFormCompleteness(template, completeValues, PHOTOS, SELFIES);
  assert(r.isComplete, `expected complete, missing: ${r.missingFields.join(',')} photos:${r.missingPhotos} selfies:${r.missingSelfies}`);
  assert(r.requiredCount === 1 && r.filledRequiredCount === 1, `progress ${r.filledRequiredCount}/${r.requiredCount}`);
});

check('one mandatory field blank => incomplete, key reported', () => {
  const r = evaluateFormCompleteness(template, { callRemark: 'Ring' }, PHOTOS, SELFIES);
  assert(!r.isComplete, 'expected incomplete');
  assert(r.missingKeys.includes('addressConfirmed'), `missingKeys=${r.missingKeys.join(',')}`);
  assert(r.filledRequiredCount === 0 && r.requiredCount === 1, `progress ${r.filledRequiredCount}/${r.requiredCount}`);
});

check('photos short => incomplete even with all fields filled', () => {
  const r = evaluateFormCompleteness(template, completeValues, PHOTOS - 1, SELFIES);
  assert(!r.isComplete, 'expected incomplete');
  assert(r.missingPhotos === 1 && r.missingFields.length === 0, `missingPhotos=${r.missingPhotos}`);
});

check('selfie short => incomplete even with all fields filled', () => {
  const r = evaluateFormCompleteness(template, completeValues, PHOTOS, 0);
  assert(!r.isComplete, 'expected incomplete');
  assert(r.missingSelfies === 1, `missingSelfies=${r.missingSelfies}`);
});

check('HIDDEN conditional required field must NOT block', () => {
  // addressConfirmed=Yes hides shiftedTo — its blank value is irrelevant.
  const r = evaluateFormCompleteness(template, completeValues, PHOTOS, SELFIES);
  assert(r.isComplete, 'hidden conditional blocked completeness');
  assert(!r.missingKeys.includes('shiftedTo'), 'shiftedTo wrongly required');
});

check('VISIBLE conditional required field blank => blocks', () => {
  const r = evaluateFormCompleteness(template, { addressConfirmed: 'No', callRemark: 'Ring' }, PHOTOS, SELFIES);
  assert(!r.isComplete, 'expected incomplete');
  assert(r.missingKeys.includes('shiftedTo'), `missingKeys=${r.missingKeys.join(',')}`);
  assert(r.requiredCount === 2, `requiredCount=${r.requiredCount}`);
});

check('requiredWhen triggered + blank => blocks; filled => complete', () => {
  const triggered = { addressConfirmed: 'Yes', callRemark: 'Pickup call & confirm' };
  const r1 = evaluateFormCompleteness(template, triggered, PHOTOS, SELFIES);
  assert(!r1.isComplete && r1.missingKeys.includes('callConfirmation'), 'requiredWhen did not block');
  const r2 = evaluateFormCompleteness(template, { ...triggered, callConfirmation: 'Loan Cancel' }, PHOTOS, SELFIES);
  assert(r2.isComplete, `still missing: ${r2.missingFields.join(',')}`);
});

check('null template (no outcome / unknown type) => incomplete', () => {
  const r = evaluateFormCompleteness(null, completeValues, PHOTOS, SELFIES);
  assert(!r.isComplete, 'null template must be incomplete');
});

if (failures.length > 0) {
  console.error(`\nformCompleteness contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nformCompleteness contract: ${passed} checks passed`);
}
