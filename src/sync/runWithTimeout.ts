/**
 * Race a promise against a hard timeout — the safety net that lets the SyncEngine
 * ALWAYS release its in-memory lock within a bounded time, even if the sync cycle
 * wedges on an await that never settles (the stalled-cycle bug: a wedged `_doSync`
 * never reached its `finally`, so `syncInProgress` stuck `true` forever and every
 * trigger/recovery — all gated on that flag — became a no-op until a force-stop).
 *
 * Contract: the returned promise NEVER rejects and NEVER hangs:
 *  - if `work` settles first  → `{ timedOut: false, value: <work's resolved value> }`
 *  - if the timeout fires first → `{ timedOut: true,  value: onTimeout() }`
 * A late settlement of `work` after the timeout is ignored (single-settle guard), and
 * the timer is always cleared so it cannot keep the JS runtime alive.
 *
 * Pure and dependency-free (only setTimeout/clearTimeout) so it is unit-testable under
 * `node --experimental-strip-types` without loading the React Native / op-sqlite tree.
 */
export interface TimeoutOutcome<T> {
  timedOut: boolean;
  value: T;
}

export function runWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T,
): Promise<TimeoutOutcome<T>> {
  return new Promise<TimeoutOutcome<T>>(resolve => {
    let settled = false;
    const finish = (outcome: TimeoutOutcome<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      finish({ timedOut: true, value: onTimeout() });
    }, timeoutMs);
    work.then(
      value => finish({ timedOut: false, value }),
      // `work` (SyncEngine._doSync) catches its own errors and resolves a result, so a
      // rejection here is unexpected; still release the lock with the fallback value.
      () => finish({ timedOut: false, value: onTimeout() }),
    );
  });
}
