// Contract test for toFieldStatus — the field app has no Completed concept.
//
// Owner rule (2026-07-16): "mobile app work is done after submitted, they do
// not care about completion — complete is a backend job field, we do not show
// that." The office flipping SUBMITTED → COMPLETED (ADR-0047) must not change
// what the agent sees.
//
//     npm run contract:field-status

import { isFieldSubmitted, toFieldStatus } from './fieldStatus.ts';

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

check('COMPLETED is shown to the agent as SUBMITTED', () => {
  assert(toFieldStatus('COMPLETED') === 'SUBMITTED', `got "${toFieldStatus('COMPLETED')}"`);
});

check('the word COMPLETED can never reach the agent', () => {
  for (const input of ['COMPLETED', 'completed', 'Completed']) {
    const out = toFieldStatus(input);
    assert(
      out.toUpperCase() !== 'COMPLETED',
      `"${input}" leaked as "${out}"`,
    );
  }
});

check('SUBMITTED stays SUBMITTED', () => {
  assert(toFieldStatus('SUBMITTED') === 'SUBMITTED', 'submitted changed');
});

check('every other status is passed through untouched', () => {
  for (const s of ['ASSIGNED', 'IN_PROGRESS', 'REVOKED', 'PENDING']) {
    assert(toFieldStatus(s) === s, `${s} was rewritten to ${toFieldStatus(s)}`);
  }
});

check('null / undefined / empty do not crash or invent a status', () => {
  assert(toFieldStatus(null) === '', 'null');
  assert(toFieldStatus(undefined) === '', 'undefined');
  assert(toFieldStatus('') === '', 'empty');
});

// --- isFieldSubmitted: "has the agent finished this task?" 2026-07-17.
// The field executive does not complete tasks — that is back-office work. Their
// final state is SUBMITTED. Any UI gated on `status === 'COMPLETED'` is gated on
// a status the DEVICE NEVER WRITES, so it is dead for the whole window that
// matters.

check('isFieldSubmitted: SUBMITTED is the field terminal', () => {
  assert(isFieldSubmitted('SUBMITTED'), 'SUBMITTED must count as finished');
});

check("isFieldSubmitted: the office's COMPLETED still reads as submitted", () => {
  // COMPLETED only arrives via down-sync. To the agent it is still "I submitted
  // it" — they must never be shown, or gated on, a completion they had no part
  // in. This is the case `status === 'COMPLETED'` got backwards.
  assert(isFieldSubmitted('COMPLETED'), 'COMPLETED must read as submitted');
  assert(isFieldSubmitted('completed'), 'case-insensitive');
});

check('isFieldSubmitted: unfinished states are NOT submitted', () => {
  for (const s of ['ASSIGNED', 'IN_PROGRESS', 'PENDING', 'REVOKED']) {
    assert(!isFieldSubmitted(s), `${s} must not count as submitted`);
  }
});

check('isFieldSubmitted: null / undefined / empty are not submitted', () => {
  assert(!isFieldSubmitted(null), 'null');
  assert(!isFieldSubmitted(undefined), 'undefined');
  assert(!isFieldSubmitted(''), 'empty');
});

if (failures.length > 0) {
  console.error(`\nfieldStatus contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nfieldStatus contract: ${passed} checks passed`);
}
