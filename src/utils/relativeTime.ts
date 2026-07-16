// 2026-07-16: signed relative-time formatting for the Diagnostics screen.
//
// Extracted from DiagnosticsScreen so it is unit-testable — the screen
// imports react-native, which the node --experimental-strip-types contract
// harness cannot resolve.
//
// WHY SIGNED: Diagnostics renders BOTH directions — `lastSyncAt` is always
// in the past, `tokenExpiresAt` is normally in the future. The previous
// implementation only handled the past (it clamped negatives to zero) and
// the call site faked the future by string-replacing " ago" → " from now".
// That inverted the truth in both directions:
//   * a VALID token (future)   → clamped to 0 → "0s from now"  (looks expired)
//   * an EXPIRED token (past)  → "35m ago"    → "35m from now" (looks valid)
// on the one screen support asks agents to read aloud.

/** Rendered when a timestamp is unparseable. Mirrors DiagnosticsScreen's NA. */
export const RELATIVE_TIME_UNAVAILABLE = '(unavailable)';

/**
 * Human relative time with direction.
 * Past → "5m ago". Future → "5m from now". Missing → "never".
 * Unparseable → RELATIVE_TIME_UNAVAILABLE (never "NaNd ago").
 */
export const formatRelativeTime = (
  iso: string | null | undefined,
  now: number = Date.now(),
): string => {
  if (!iso) {
    return 'never';
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return RELATIVE_TIME_UNAVAILABLE;
  }
  const diffMs = now - then;
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const diffSec = Math.round(Math.abs(diffMs) / 1000);
  if (diffSec < 60) {
    return `${diffSec}s ${suffix}`;
  }
  if (diffSec < 3600) {
    return `${Math.round(diffSec / 60)}m ${suffix}`;
  }
  if (diffSec < 86400) {
    return `${Math.round(diffSec / 3600)}h ${suffix}`;
  }
  return `${Math.round(diffSec / 86400)}d ${suffix}`;
};
