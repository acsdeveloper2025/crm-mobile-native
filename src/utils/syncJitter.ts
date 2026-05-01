const DEFAULT_JITTER_MAX_MS = 30_000;

export function jitterDelayMs(maxMs: number = DEFAULT_JITTER_MAX_MS): number {
  if (maxMs <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * maxMs);
}

export function applyJitter(
  maxMs: number = DEFAULT_JITTER_MAX_MS,
): Promise<void> {
  const ms = jitterDelayMs(maxMs);
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}
