// Contract test for runWithTimeout — the SyncEngine stalled-cycle safety net.
//
// The repo has no jest/vitest runner (frozen stack), so this is a self-contained
// assertion script run through Node's type-stripping, mirroring
// src/api/schemas/sync.schema.contract.test.ts:
//
//     npm run contract:sync-lock
//
// It exits non-zero on the first failed assertion. Dependency-free (only the pure
// helper under test); assertions use a tiny local helper so it typechecks under the
// RN tsconfig while running under plain Node.

import { runWithTimeout, type TimeoutOutcome } from './runWithTimeout.ts';

// The RN tsconfig's `types` is jest-only (no @types/node), so declare the one
// Node global we use — mirrors src/api/schemas/sync.schema.contract.test.ts.
declare const process: { exitCode?: number };

let passed = 0;
const failures: string[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const never = new Promise<string>(() => {}); // a wedged cycle: settles never

async function main(): Promise<void> {
  await check('work that resolves before the timeout returns its value (timedOut=false)', async () => {
    const outcome: TimeoutOutcome<string> = await runWithTimeout(
      Promise.resolve('done'),
      1000,
      () => 'fallback',
    );
    assert(outcome.timedOut === false, `expected timedOut=false, got ${outcome.timedOut}`);
    assert(outcome.value === 'done', `expected value="done", got "${outcome.value}"`);
  });

  await check('a WEDGED cycle releases via the timeout fallback (the stall fix)', async () => {
    const started = Date.now();
    const outcome = await runWithTimeout(never, 30, () => 'released');
    const elapsed = Date.now() - started;
    assert(outcome.timedOut === true, 'a never-settling cycle must time out');
    assert(outcome.value === 'released', `expected the onTimeout fallback, got "${outcome.value}"`);
    assert(elapsed < 1000, `must release promptly (~timeoutMs), took ${elapsed}ms`);
  });

  await check('a late settlement after the timeout does NOT change the outcome', async () => {
    let lateResolve: (v: string) => void = () => {};
    const slow = new Promise<string>(res => {
      lateResolve = res;
    });
    const outcome = await runWithTimeout(slow, 20, () => 'timeout-value');
    assert(outcome.timedOut === true, 'should have timed out first');
    lateResolve('too-late'); // resolve AFTER the timeout already won
    await delay(20);
    // The already-returned outcome is immutable; the single-settle guard holds.
    assert(outcome.value === 'timeout-value', 'late settlement must not mutate the returned outcome');
  });

  await check('a rejecting cycle still releases the lock (defensive, timedOut=false)', async () => {
    const outcome = await runWithTimeout(Promise.reject(new Error('boom')), 1000, () => 'fallback');
    assert(outcome.timedOut === false, 'a rejection is not a timeout');
    assert(outcome.value === 'fallback', 'a rejection must still resolve with the fallback so the lock releases');
  });

  if (failures.length > 0) {
    console.error(`\nrunWithTimeout contract: ${failures.length} FAILED`);
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`\nrunWithTimeout contract: ${passed} checks passed`);
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
