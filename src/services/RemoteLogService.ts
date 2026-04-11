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

import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { Logger, type LogBufferEntry } from '../utils/logger';

const TAG = 'RemoteLogService';

export interface RemoteLogPayload {
  source: 'crash' | 'user' | 'manual';
  entries: LogBufferEntry[];
  capturedAt: string;
}

class RemoteLogServiceClass {
  /**
   * Upload the most recent `count` log entries (default 100)
   * filtered to `minLevel` and above. Non-blocking — errors are
   * swallowed so this never cascades into another crash.
   */
  async upload(options: {
    source: RemoteLogPayload['source'];
    count?: number;
    minLevel?: Parameters<typeof Logger.getRecentLogs>[1];
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
    } catch (error) {
      // Can't Logger.error here without risking a feedback loop
      // where the failed upload generates a new error entry that
      // triggers another upload attempt. Log via console only.
      console.warn(`[${TAG}] Failed to upload log tail`, error);
      return false;
    }
  }
}

export const RemoteLogService = new RemoteLogServiceClass();
