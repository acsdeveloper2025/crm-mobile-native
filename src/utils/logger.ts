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
 * Safely serialize arbitrary `data` argument. Falls back to a
 * constant string on circular references or unserializable values
 * so the logger never throws when called from an error handler.
 */
function serializeData(data: unknown): string | null {
  if (data === undefined || data === null) {
    return null;
  }
  try {
    return typeof data === 'string' ? data : JSON.stringify(data);
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
