// Contract test for formatRelativeTime — the Diagnostics relative-time line.
//
// Pins the bug this replaced: the old helper clamped negatives to zero and the
// call site string-replaced " ago" → " from now", so a VALID token read
// "0s from now" and an EXPIRED one read "35m from now" — inverted, on the
// screen support asks agents to read aloud.
//
//     npm run contract:relative-time

import {
  formatRelativeTime,
  RELATIVE_TIME_UNAVAILABLE,
} from './relativeTime.ts';

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

// Fixed clock so the assertions are deterministic.
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

check('FUTURE token expiry reads "from now" — not "0s"', () => {
  // The exact live case: token expiring in ~4 minutes previously showed
  // "0s from now", which reads as already-expired.
  assert(
    formatRelativeTime(at(4 * MIN), NOW) === '4m from now',
    `got "${formatRelativeTime(at(4 * MIN), NOW)}"`,
  );
  assert(
    formatRelativeTime(at(30_000), NOW) === '30s from now',
    `got "${formatRelativeTime(at(30_000), NOW)}"`,
  );
});

check('EXPIRED token reads "ago" — never "from now"', () => {
  const out = formatRelativeTime(at(-35 * MIN), NOW);
  assert(out === '35m ago', `got "${out}"`);
  assert(!out.includes('from now'), 'an expired token must not read as future');
});

check('past timestamps (lastSyncAt) still read "ago" — unchanged', () => {
  assert(formatRelativeTime(at(-45_000), NOW) === '45s ago', 'seconds');
  assert(formatRelativeTime(at(-5 * MIN), NOW) === '5m ago', 'minutes');
  assert(formatRelativeTime(at(-3 * HOUR), NOW) === '3h ago', 'hours');
  assert(formatRelativeTime(at(-2 * DAY), NOW) === '2d ago', 'days');
});

check('future crosses every unit boundary', () => {
  assert(formatRelativeTime(at(2 * HOUR), NOW) === '2h from now', 'hours');
  assert(formatRelativeTime(at(3 * DAY), NOW) === '3d from now', 'days');
});

check('missing → "never"', () => {
  assert(formatRelativeTime(null, NOW) === 'never', 'null');
  assert(formatRelativeTime(undefined, NOW) === 'never', 'undefined');
  assert(formatRelativeTime('', NOW) === 'never', 'empty string');
});

check('unparseable → unavailable, never "NaNd ago"', () => {
  const out = formatRelativeTime('not-a-date', NOW);
  assert(out === RELATIVE_TIME_UNAVAILABLE, `got "${out}"`);
  assert(!out.includes('NaN'), 'NaN leaked into the UI');
});

check('exact now is treated as past, not future', () => {
  assert(formatRelativeTime(at(0), NOW) === '0s ago', 'boundary at zero');
});

if (failures.length > 0) {
  console.error(`\nrelativeTime contract: ${failures.length} FAILED`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nrelativeTime contract: ${passed} checks passed`);
}
