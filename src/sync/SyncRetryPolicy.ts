export interface RetryWindow {
  nextRetryAt: string;
  backoffMs: number;
}

// M24/M25: the prior formula was `5^attempts` — attempt 1 = 5s,
// attempt 2 = 25s, attempt 3 = 125s, attempt 4 = 625s (capped at
// 600s). That leaves a form submission stuck for 10+ minutes after
// just three failed retries even on a flaky-then-recovered network,
// and because every queued item retried on the same schedule, a
// 503 outage caused a thundering herd the moment the server came
// back. New formula:
//
//   base * 2^(attempts-1), capped at maxSeconds, plus ±50% jitter.
//
//   attempt 1:   5s ± 2.5s      (2.5 – 7.5s)
//   attempt 2:  10s ± 5s        (5 – 15s)
//   attempt 3:  20s ± 10s       (10 – 30s)
//   attempt 4:  40s ± 20s       (20 – 60s)
//   attempt 5:  80s ± 40s       (40 – 120s)
//   attempt 6+: 120s ± 60s      (60 – 180s, capped)
//
// Jitter is applied symmetrically around the nominal backoff so a
// batch of 50 queued items spreads across a ~2x window instead of
// all firing at the same instant.
class SyncRetryPolicy {
  private readonly baseSeconds = 5;
  private readonly maxSeconds = 2 * 60;
  private readonly jitterRatio = 0.5;

  getRetryWindow(attempts: number, fromDate: Date = new Date()): RetryWindow {
    const safeAttempts = Math.max(1, attempts);
    const nominalSeconds = Math.min(
      this.baseSeconds * Math.pow(2, safeAttempts - 1),
      this.maxSeconds,
    );
    const jitterSpan = nominalSeconds * this.jitterRatio;
    // Math.random() is fine for dispersion — this is not a security
    // primitive, just a decorrelation knob. Produces a value in
    // [nominal - jitterSpan, nominal + jitterSpan].
    const jitteredSeconds =
      nominalSeconds + (Math.random() * 2 - 1) * jitterSpan;
    const backoffSeconds = Math.max(1, jitteredSeconds);
    const backoffMs = Math.round(backoffSeconds * 1000);
    return {
      backoffMs,
      nextRetryAt: new Date(fromDate.getTime() + backoffMs).toISOString(),
    };
  }
}

export const syncRetryPolicy = new SyncRetryPolicy();
