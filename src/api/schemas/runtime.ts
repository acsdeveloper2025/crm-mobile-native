// Runtime response validation helper for the mobile client.
//
// Phase B7: the mobile app historically trusted every API response and
// passed it straight into SQLite. Contract drift on a sync payload is
// particularly painful because bad rows silently corrupt the offline
// store and surface as mysterious crashes hours later when the UI tries
// to render the cached data.
//
// This helper wraps `zod` with a safe-parse pattern matching the frontend
// `services/schemas/runtime.ts`. Validation failures are logged via the
// existing `Logger` facade without throwing in non-strict mode so a new
// backend field never breaks a field agent mid-shift — it just gets
// flagged in the next telemetry batch.
//
// Strict mode (`{ strict: true }`) throws on drift; use it for endpoints
// where corrupt data must be rejected outright (e.g. auth tokens).

import type { ZodType, ZodError } from 'zod';
import { Logger } from '../../utils/logger';

export interface ValidateOptions {
  /** Service name for log grouping — e.g. 'auth', 'sync'. */
  service: string;
  /** Endpoint path or method name — e.g. '/auth/me', 'downloadTasks'. */
  endpoint: string;
  /** When true, throw on validation failure instead of warn-and-pass. */
  strict?: boolean;
}

function summariseSample(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    return json.length > 400 ? `${json.slice(0, 400)}…(truncated)` : json;
  } catch {
    return '[unserializable]';
  }
}

export function validateResponse<T>(
  schema: ZodType<T>,
  data: unknown,
  options: ValidateOptions,
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const issues: ZodError['issues'] = result.error.issues;
  const payload = {
    service: options.service,
    endpoint: options.endpoint,
    issues,
    sample: summariseSample(data),
  };

  if (options.strict) {
    Logger.error('ApiSchema', 'Response validation failed (strict)', payload);
    throw result.error;
  }

  Logger.warn('ApiSchema', 'API response shape drift detected', payload);
  // Non-strict: accept the raw data so the sync loop keeps running until
  // the drift is addressed upstream.
  return data as T;
}
