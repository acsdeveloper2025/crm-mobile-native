import { KeyValueRepository } from '../repositories/KeyValueRepository';

const WATCHDOG_KEY = 'sync_watchdog_state';

interface SyncWatchdogState {
  running: boolean;
  startedAt: string;
  lastProgressAt: string;
}

class SyncWatchdogServiceClass {
  private async readState(): Promise<SyncWatchdogState | null> {
    const raw = await KeyValueRepository.get(WATCHDOG_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as SyncWatchdogState;
    } catch {
      return null;
    }
  }

  private async writeState(state: SyncWatchdogState): Promise<void> {
    await KeyValueRepository.set(WATCHDOG_KEY, JSON.stringify(state));
  }

  async start(): Promise<void> {
    const now = new Date().toISOString();
    await this.writeState({
      running: true,
      startedAt: now,
      lastProgressAt: now,
    });
  }

  async heartbeat(): Promise<void> {
    const current = (await this.readState()) || {
      running: true,
      startedAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
    };
    await this.writeState({
      ...current,
      running: true,
      lastProgressAt: new Date().toISOString(),
    });
  }

  async stop(): Promise<void> {
    const current = await this.readState();
    if (!current) {
      return;
    }
    await this.writeState({
      ...current,
      running: false,
      lastProgressAt: new Date().toISOString(),
    });
  }

  async recoverIfStalled(timeoutMs: number): Promise<boolean> {
    const state = await this.readState();
    if (!state?.running) {
      return false;
    }
    const lastProgress = new Date(state.lastProgressAt).getTime();
    const stalled =
      Number.isFinite(lastProgress) && Date.now() - lastProgress > timeoutMs;
    if (stalled) {
      await this.stop();
    }
    return stalled;
  }
}

export const SyncWatchdogService = new SyncWatchdogServiceClass();
