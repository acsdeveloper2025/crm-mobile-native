// PinningConfigService — Phase E1 SSL pinning kill switch consumer.
//
// The mobile app relies on two layers to secure TLS:
//
//   1. A native allowlist. On Android this is
//      `android/app/src/main/res/xml/network_security_config.xml`;
//      on iOS it's `NSAppTransportSecurity` + a certificate pinning
//      library. Both enforce pinning at connect time — the only
//      place TLS validation can legitimately happen.
//
//   2. This runtime kill switch. The backend /auth/app-config
//      response carries a `pinning` object with `enabled` and
//      `pinSha256s`. When `enabled` is false, the app should fall
//      back to stock TLS without pinning — emergency escape hatch
//      for a rotated cert that slipped through the overlap window.
//
// This service owns the runtime state. The native layer is
// configured at build time and cannot be flipped remotely, so the
// kill switch is a "relaxation" channel only: it can DISABLE
// pinning enforcement at runtime but cannot enable it on a client
// that shipped without native support. That asymmetry is
// intentional — it prevents a compromised server from instructing
// the app to pin to an attacker-controlled key.
//
// Wiring:
//   1. At boot, MobileAuthController bootstrap calls
//      `PinningConfigService.load()` which reads the cached config
//      from SQLite key_value_store.
//   2. Every successful /auth/app-config response calls
//      `PinningConfigService.update(config.pinning)` to refresh the
//      cache.
//   3. Before any network request, consumers call
//      `PinningConfigService.isEnabled()` and
//      `PinningConfigService.getPinSet()` to decide whether native
//      pinning should be honored or bypassed.

import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';

const TAG = 'PinningConfigService';
const KV_KEY = 'pinning_config_v1';

export interface PinningConfig {
  enabled: boolean;
  pinSha256s: string[];
}

const DEFAULT_CONFIG: PinningConfig = {
  enabled: true,
  pinSha256s: [],
};

class PinningConfigServiceClass {
  private current: PinningConfig = { ...DEFAULT_CONFIG };
  private loaded = false;

  /**
   * Load the cached config from SQLite. Called once at app boot
   * before any network request. If no cached value exists (fresh
   * install), `isEnabled()` defaults to `true` so the native
   * pinning layer is honored.
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const rows = await DatabaseService.query<{ value: string }>(
        'SELECT value FROM key_value_store WHERE key = ?',
        [KV_KEY],
      );
      const raw = rows[0]?.value;
      if (raw) {
        const parsed = JSON.parse(raw) as PinningConfig;
        if (
          parsed &&
          typeof parsed.enabled === 'boolean' &&
          Array.isArray(parsed.pinSha256s)
        ) {
          this.current = parsed;
        }
      }
    } catch (error) {
      Logger.warn(TAG, 'Failed to load cached pinning config', error);
    } finally {
      this.loaded = true;
    }
  }

  /**
   * Update the in-memory cache and persist to SQLite. Called from
   * the app-config bootstrap after every successful fetch.
   *
   * The update is idempotent and safe to call with stale data — if
   * the backend omits `pinning` (older server) we keep the previous
   * value instead of overwriting it with an undefined.
   */
  async update(next: PinningConfig | undefined | null): Promise<void> {
    if (!next) {
      return;
    }
    this.current = {
      enabled: Boolean(next.enabled),
      pinSha256s: Array.isArray(next.pinSha256s) ? next.pinSha256s : [],
    };
    try {
      await DatabaseService.execute(
        'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
        [KV_KEY, JSON.stringify(this.current)],
      );
    } catch (error) {
      Logger.warn(TAG, 'Failed to persist pinning config', error);
    }
  }

  /**
   * True if SSL pinning should be enforced by the native layer.
   * Consulting code should bypass the native pinning library when
   * this returns false (the exact mechanism depends on the library
   * — react-native-ssl-pinning accepts a flag at request time).
   */
  isEnabled(): boolean {
    return this.current.enabled;
  }

  /**
   * The set of public-key SHA256 fingerprints the native layer
   * should accept. Matching any one is a pass, enabling
   * overlap-window cert rotations.
   */
  getPinSet(): string[] {
    return [...this.current.pinSha256s];
  }

  /** Test hook — reset to defaults. */
  reset(): void {
    this.current = { ...DEFAULT_CONFIG };
    this.loaded = false;
  }
}

export const PinningConfigService = new PinningConfigServiceClass();
