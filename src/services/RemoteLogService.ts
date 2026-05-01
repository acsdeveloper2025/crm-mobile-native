// RemoteLogService — Phase F3.
//
// Ship a tail of buffered log entries to the backend telemetry
// endpoint. The actual buffer lives in src/utils/logger.ts; this
// service is the drain.
//
// Called from:
//   - ErrorBoundary componentDidCatch
//   - The unhandled promise rejection handler in App.tsx
//   - Future "Report a bug" user flow
//
// Non-blocking. Every path catches its own errors because the
// telemetry endpoint is optional (some deployments don't run a
// telemetry receiver) and a logger that throws from its own drain
// is worse than a silent drop.

import RNFS from 'react-native-fs';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { Logger, type LogBufferEntry } from '../utils/logger';

const TAG = 'RemoteLogService';

// F-MD11 (audit 2026-04-28 deeper): degraded-state thresholds. When
// any one is breached, fire an automatic log upload so the support
// team has context before the agent submits a ticket.
const QUEUE_DEPTH_TRIGGER = 100;
const FREE_STORAGE_TRIGGER_BYTES = 200 * 1024 * 1024; // 200 MB
// 6 h cooldown between auto-uploads. Prevents the same degraded state
// (e.g. a stuck queue) from spamming the telemetry endpoint every tick.
const AUTO_UPLOAD_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface RemoteLogPayload {
  source: 'crash' | 'user' | 'manual' | 'auto_degraded';
  entries: LogBufferEntry[];
  capturedAt: string;
  reason?: string;
}

class RemoteLogServiceClass {
  private lastAutoUploadAt = 0;

  /**
   * Upload the most recent `count` log entries (default 100)
   * filtered to `minLevel` and above. Non-blocking — errors are
   * swallowed so this never cascades into another crash.
   */
  async upload(options: {
    source: RemoteLogPayload['source'];
    count?: number;
    minLevel?: Parameters<typeof Logger.getRecentLogs>[1];
    reason?: string;
  }): Promise<boolean> {
    const count = options.count ?? 100;
    const minLevel = options.minLevel ?? 'DEBUG';

    const entries = Logger.getRecentLogs(count, minLevel);
    if (entries.length === 0) {
      return true;
    }

    const payload: RemoteLogPayload = {
      source: options.source,
      entries,
      capturedAt: new Date().toISOString(),
      reason: options.reason,
    };

    try {
      // The telemetry endpoint already accepts arbitrary structured
      // events and is optional (404s are treated as non-fatal by
      // ApiClient). If the endpoint ever splits logs into its own
      // route, change the URL here and nothing else.
      await ApiClient.post(ENDPOINTS.TELEMETRY.INGEST, {
        kind: 'client_log_tail',
        payload,
      });
      return true;
    } catch {
      // S11 (audit 2026-04-21 round 2): can't call Logger here (would
      // feedback-loop a new error into the next upload batch), and
      // we don't log the error object — it can carry device
      // fingerprint / request headers. One-line console.warn is
      // enough for local debugging.
      console.warn(`[${TAG}] upload failed`);
      return false;
    }
  }

  /**
   * F-MD11 (audit 2026-04-28 deeper): inspect runtime state and trigger
   * an upload if any degraded threshold is breached. Caller (background
   * sync tick, app foreground, periodic timer) does not need to know
   * the thresholds — it just calls this. Cooldown prevents spam from
   * a sustained degradation.
   *
   * `queueDepth` is provided by the caller (sync engine) to avoid a
   * circular DatabaseService dependency from this service. Pass `null`
   * if the caller doesn't have it; only the storage check runs.
   */
  async checkDegradedAndUpload(queueDepth: number | null): Promise<void> {
    const now = Date.now();
    if (now - this.lastAutoUploadAt < AUTO_UPLOAD_COOLDOWN_MS) {
      return;
    }
    const reasons: string[] = [];
    if (queueDepth !== null && queueDepth > QUEUE_DEPTH_TRIGGER) {
      reasons.push(`queue_depth=${queueDepth}`);
    }
    try {
      const fs = await RNFS.getFSInfo();
      if (fs.freeSpace < FREE_STORAGE_TRIGGER_BYTES) {
        reasons.push(`free_space=${Math.round(fs.freeSpace / 1024 / 1024)}MB`);
      }
    } catch {
      // FS probe failure is non-fatal; just skip the storage signal.
    }
    if (reasons.length === 0) {
      return;
    }
    this.lastAutoUploadAt = now;
    await this.upload({
      source: 'auto_degraded',
      reason: reasons.join(','),
    });
  }
}

export const RemoteLogService = new RemoteLogServiceClass();
