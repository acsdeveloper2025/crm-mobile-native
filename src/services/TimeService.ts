// TimeService — tracks the offset between device clock and server
// clock so sync and conflict resolution can reason in monotonic time.
//
// Phase D5. The mobile app was comparing local `updatedAt` timestamps
// against server `updatedAt` using plain `Date.parse()` and treating
// the larger value as "fresher". That's broken when the device clock
// is skewed: a phone with its clock set 1 hour ahead would always
// "win" conflict resolution and silently overwrite newer server
// state, and a phone set in the past would always lose and discard
// local work.
//
// This service subscribes to the `Date` header on every authenticated
// response (wired in ApiClient) and maintains a rolling estimate of
// `offsetMs = serverNow - deviceNow`. Conflict resolution and sync
// metadata should compare timestamps via `serverNow()` / `isFresher()`
// here instead of calling Date.now() directly.
//
// If the offset exceeds MAX_ACCEPTABLE_SKEW_MS we log a loud warning
// and mark the device as "clock unreliable" so the sync engine can
// refuse to overwrite server state until the user corrects their
// clock. Refusing-over-drifting is the safer default on a field
// device that's about to push forms that reference the device's
// timestamps.

import { Logger } from '../utils/logger';

const TAG = 'TimeService';

/**
 * Hard ceiling on server↔device clock skew. Beyond this we treat the
 * device clock as unreliable and refuse to merge based on local
 * timestamps. 1 hour matches the Phase D5 spec.
 */
export const MAX_ACCEPTABLE_SKEW_MS = 60 * 60 * 1000;

/**
 * Tolerance window applied to "who is fresher" comparisons so a small
 * network delay (RTT) doesn't flip the winner. 5 minutes is generous
 * enough to absorb any realistic cellular latency while still catching
 * the hour-scale drift we actually care about.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

class TimeServiceClass {
  private offsetMs = 0;
  private lastSampleAt: number | null = null;
  private unreliable = false;

  /**
   * Record a server time sample taken from a response Date header.
   * Called from ApiClient after every successful HTTP response.
   */
  recordServerTime(serverEpochMs: number): void {
    if (!Number.isFinite(serverEpochMs) || serverEpochMs <= 0) {
      return;
    }
    const deviceNow = Date.now();
    const offset = serverEpochMs - deviceNow;
    this.offsetMs = offset;
    this.lastSampleAt = deviceNow;

    if (Math.abs(offset) > MAX_ACCEPTABLE_SKEW_MS) {
      if (!this.unreliable) {
        Logger.warn(
          TAG,
          `Device clock skew exceeds ${MAX_ACCEPTABLE_SKEW_MS}ms; timestamps marked unreliable`,
          { offsetMs: offset },
        );
      }
      this.unreliable = true;
    } else {
      if (this.unreliable) {
        Logger.info(TAG, 'Device clock skew back within tolerance');
      }
      this.unreliable = false;
    }
  }

  /**
   * Parse a `Date:` response header into epoch milliseconds. Exposed so
   * ApiClient can feed it straight into recordServerTime without
   * reimplementing the validation here.
   */
  parseDateHeader(header: string | null | undefined): number | null {
    if (!header) {
      return null;
    }
    const parsed = Date.parse(header);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Best-known current server time in epoch milliseconds. Falls back
   * to device time if no sample has been recorded yet.
   */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  /**
   * Return the current offset estimate. Positive means the server is
   * ahead of the device; negative means the device clock is ahead.
   */
  getOffsetMs(): number {
    return this.offsetMs;
  }

  /**
   * True if the most recent server-time sample showed the device clock
   * drifting beyond MAX_ACCEPTABLE_SKEW_MS. Sync engine and conflict
   * resolver should consult this before trusting any local timestamp.
   */
  isClockUnreliable(): boolean {
    return this.unreliable;
  }

  /**
   * Convert a timestamp string to epoch milliseconds, returning null
   * on any parse failure. Shared helper so every caller treats
   * malformed timestamps the same way.
   */
  parseTimestamp(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Decide whether `local` is fresher than `remote`, accounting for
   * clock skew. Returns false if either side fails to parse, if the
   * device clock is flagged unreliable, or if the difference is within
   * the tolerance window. Otherwise returns `local > remote` after
   * shifting `local` by the known offset.
   */
  isLocalFresher(
    localUpdatedAt: string | null | undefined,
    serverUpdatedAt: string | null | undefined,
  ): boolean {
    if (this.unreliable) {
      return false;
    }
    const local = this.parseTimestamp(localUpdatedAt);
    const server = this.parseTimestamp(serverUpdatedAt);
    if (local == null || server == null) {
      return false;
    }
    // Local timestamps are captured in device-clock space. Add the
    // offset so we compare against the server clock on equal footing.
    const localInServerSpace = local + this.offsetMs;
    return localInServerSpace - server > CLOCK_SKEW_TOLERANCE_MS;
  }

  /** Test hook — reset internal state. */
  reset(): void {
    this.offsetMs = 0;
    this.lastSampleAt = null;
    this.unreliable = false;
  }

  /** Test hook — most recent sample timestamp in device-local ms. */
  getLastSampleAt(): number | null {
    return this.lastSampleAt;
  }
}

export const TimeService = new TimeServiceClass();
