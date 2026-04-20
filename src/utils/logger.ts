// Simple logger utility with tagged output + in-memory ring buffer
// (Phase F3). Every call is echoed to the native console AND stored
// in a bounded ring buffer so the app can ship a tail of recent log
// entries to the backend when a crash is reported.
//
// This is intentionally not file-backed. A true persistent log store
// would need SQLite schema/migration coordination and a separate
// drain service; the in-memory ring covers the common case (errors
// that happen within minutes of a recoverable issue) without any
// startup overhead. A follow-up commit can layer SQLite persistence
// on top without changing the public Logger API.

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Single log entry as captured in the ring buffer. The `level` is
 * stored as the numeric value (0-3) so consumers can filter / sort
 * without string comparison. `data` is serialized to a JSON string
 * at capture time so the buffer's memory footprint is predictable
 * and later serialization to the backend is a no-op.
 */
export interface LogBufferEntry {
  level: number;
  levelName: LogLevel;
  tag: string;
  message: string;
  data: string | null;
  timestamp: string;
}

/**
 * Maximum number of entries kept in memory. A 500-entry ring at
 * ~400 bytes per entry is ~200KB — small enough to keep forever
 * on a phone, large enough to capture the last few minutes of
 * activity around an error.
 */
const MAX_BUFFER_SIZE = 500;

/**
 * Case-insensitive pattern matching keys whose values should be
 * redacted before the entry lands in the ring buffer (and therefore
 * before they can be shipped to the backend telemetry collector
 * via RemoteLogService).
 *
 * M29: the prior serializer stringified arbitrary data objects,
 * including well-meaning `Logger.error(tag, msg, { response })` calls
 * that embedded full axios responses with Authorization headers and
 * user PII. The buffer's entire purpose is to flush to the server
 * on crash, so every captured token was one network hop from living
 * in a log aggregator. This filter is the minimum viable guardrail:
 * it redacts values for keys whose name looks sensitive, regardless
 * of how deep they are in the object.
 */
const SENSITIVE_KEY_PATTERN =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|auth(?:orization)?|password|passcode|pin(?![a-z])|secret|api[_-]?key|private[_-]?key|ssn|aadhaar|pan(?:[_-]?card)?|credit[_-]?card|cvv|otp|session[_-]?id|cookie|bearer|\blat(?:itude)?\b|\blon(?:g|gitude)?\b|\blng\b|\bcoord(?:s|inate|inates)?\b|\bgps\b|\bgeo[_-]?location\b)/i;

const REDACTED = '[REDACTED]';
// Bound recursion on deeply nested or cyclic inputs.
const MAX_REDACT_DEPTH = 6;

/**
 * Deep-clone an arbitrary value, redacting any object property
 * whose key name matches SENSITIVE_KEY_PATTERN. Returns the value
 * unchanged if it is a primitive. Gracefully handles cycles,
 * Error instances, and depth overruns so the logger never throws.
 */
function redactSensitiveFields(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') {
    return value;
  }
  if (depth >= MAX_REDACT_DEPTH) {
    return '[max depth]';
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (t !== 'object') {
    return String(value);
  }
  const obj = value as object;
  if (seen.has(obj)) {
    return '[circular]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(entry => redactSensitiveFields(entry, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactSensitiveFields(entry, depth + 1, seen);
  }
  return out;
}

/**
 * Safely serialize arbitrary `data` argument. Falls back to a
 * constant string on circular references or unserializable values
 * so the logger never throws when called from an error handler.
 *
 * Before serialization, runs the structure through a sensitive-key
 * redactor (M29) so tokens, PINs, API keys, and similar fields
 * never land in the buffer.
 */
function serializeData(data: unknown): string | null {
  if (data === undefined || data === null) {
    return null;
  }
  if (typeof data === 'string') {
    return data;
  }
  try {
    const redacted = redactSensitiveFields(data, 0, new WeakSet());
    return JSON.stringify(redacted);
  } catch {
    return '[unserializable]';
  }
}

class LoggerClass {
  private level: LogLevel = __DEV__ ? 'INFO' : 'WARN';
  private buffer: LogBufferEntry[] = [];

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private append(
    levelName: LogLevel,
    tag: string,
    message: string,
    data?: unknown,
  ): void {
    const entry: LogBufferEntry = {
      level: LOG_LEVELS[levelName],
      levelName,
      tag,
      message,
      data: serializeData(data),
      timestamp: new Date().toISOString(),
    };
    this.buffer.push(entry);
    // Ring-buffer trim: drop oldest when over capacity so the memory
    // footprint stays bounded.
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE);
    }
  }

  debug(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.DEBUG) {
      console.debug(`[${tag}] ${message}`, data ?? '');
    }
    this.append('DEBUG', tag, message, data);
  }

  info(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.INFO) {
      console.info(`[${tag}] ${message}`, data ?? '');
    }
    this.append('INFO', tag, message, data);
  }

  warn(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.WARN) {
      console.warn(`[${tag}] ${message}`, data ?? '');
    }
    this.append('WARN', tag, message, data);
  }

  error(tag: string, message: string, error?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.ERROR) {
      console.error(`[${tag}] ${message}`, error ?? '');
    }
    this.append('ERROR', tag, message, error);
  }

  /**
   * Phase F3: return a shallow copy of the in-memory log ring
   * buffer. Callers can filter by level, tag, or timestamp, and
   * serialize for remote upload. Returning a copy prevents a
   * future remote-logging service from mutating the live buffer
   * during iteration.
   */
  getBufferedLogs(): LogBufferEntry[] {
    return this.buffer.slice();
  }

  /**
   * Return the last N log entries above a minimum level. Typical
   * usage from a crash handler or a user-triggered "Report a bug"
   * screen:
   *
   *   const tail = Logger.getRecentLogs(100, 'WARN');
   *   await RemoteLogService.upload(tail);
   */
  getRecentLogs(count: number, minLevel: LogLevel = 'DEBUG'): LogBufferEntry[] {
    const threshold = LOG_LEVELS[minLevel];
    const filtered = this.buffer.filter(entry => entry.level >= threshold);
    return filtered.slice(-count);
  }

  /**
   * Drop every buffered entry. Used after a successful remote
   * flush so the same logs aren't uploaded twice, or from the
   * logout path so a previous user's logs don't leak into the
   * next session.
   */
  clearBuffer(): void {
    this.buffer = [];
  }
}

export const Logger = new LoggerClass();
export default Logger;
