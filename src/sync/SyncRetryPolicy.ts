export interface RetryWindow {
  nextRetryAt: string;
  backoffMs: number;
}

class SyncRetryPolicy {
  private readonly baseSeconds = 5;
  private readonly maxSeconds = 10 * 60;

  getRetryWindow(attempts: number, fromDate: Date = new Date()): RetryWindow {
    const safeAttempts = Math.max(1, attempts);
    const backoffSeconds = Math.min(
      Math.pow(this.baseSeconds, safeAttempts),
      this.maxSeconds,
    );
    const backoffMs = backoffSeconds * 1000;
    return {
      backoffMs,
      nextRetryAt: new Date(fromDate.getTime() + backoffMs).toISOString(),
    };
  }
}

export const syncRetryPolicy = new SyncRetryPolicy();
