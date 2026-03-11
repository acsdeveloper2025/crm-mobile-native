// Simple logger utility with tagged output
// In production, this could be extended to write to a file or remote service

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

class LoggerClass {
  private level: LogLevel = __DEV__ ? 'INFO' : 'WARN';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.DEBUG) {
      console.debug(`[${tag}] ${message}`, data ?? '');
    }
  }

  info(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.INFO) {
      console.info(`[${tag}] ${message}`, data ?? '');
    }
  }

  warn(tag: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.WARN) {
      console.warn(`[${tag}] ${message}`, data ?? '');
    }
  }

  error(tag: string, message: string, error?: unknown): void {
    if (LOG_LEVELS[this.level] <= LOG_LEVELS.ERROR) {
      console.error(`[${tag}] ${message}`, error ?? '');
    }
  }
}

export const Logger = new LoggerClass();
export default Logger;
