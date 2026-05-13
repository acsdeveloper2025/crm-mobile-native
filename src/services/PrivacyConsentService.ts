// PrivacyConsentService — Field Executive Acknowledgement.
//
// Tracks whether the agent has accepted the in-app consent notice
// (DPDP §5 notice obligation + internal CoC/NDA/Anti-bribery audit).
// Local KV (SQLCipher) is the gate that drives the UI; backend
// `user_consents` row is the durable audit-trail copy.
//
// Bumping CURRENT_PRIVACY_POLICY_VERSION re-prompts every user — use
// only when the consent text materially changes.

import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { Logger } from '../utils/logger';

const STORAGE_KEY = 'privacy_consent_version';
const TAG = 'PrivacyConsentService';

export const CURRENT_PRIVACY_POLICY_VERSION = 1;

export const PrivacyConsentService = {
  async hasAcceptedCurrent(): Promise<boolean> {
    const stored = await KeyValueRepository.get(STORAGE_KEY);
    if (!stored) {
      return false;
    }
    const version = parseInt(stored, 10);
    return (
      Number.isFinite(version) && version >= CURRENT_PRIVACY_POLICY_VERSION
    );
  },

  async accept(): Promise<void> {
    // 1. Persist local KV first — this gates the UI. If the BE sync
    //    fails (network down, transient 5xx), the user still proceeds
    //    into the app; we retry the BE write on next login (call
    //    syncWithBackend from AuthContext's post-login flow as a
    //    belt-and-braces safety net).
    await KeyValueRepository.set(
      STORAGE_KEY,
      String(CURRENT_PRIVACY_POLICY_VERSION),
    );

    // 2. Best-effort BE record. Idempotent server-side (UNIQUE
    //    user_id + policy_version), so re-tries on next login are
    //    safe — UPSERT the row with fresh timestamp/ip/UA.
    await this.syncWithBackend();
  },

  /**
   * Push the locally-accepted version to BE. Idempotent. Logs and
   * swallows failures so a transient outage doesn't gate the agent's
   * UI. Should be called:
   *   - immediately after the user taps "I Accept" (covered by accept()).
   *   - on every successful login (belt-and-braces — covers cases where
   *     the original accept happened offline OR the BE write failed).
   */
  async syncWithBackend(): Promise<void> {
    const stored = await KeyValueRepository.get(STORAGE_KEY);
    if (!stored) {
      return; // user never accepted locally — nothing to sync
    }
    const version = parseInt(stored, 10);
    if (!Number.isFinite(version) || version <= 0) {
      return;
    }
    try {
      await ApiClient.post(ENDPOINTS.CONSENTS.ACCEPT, {
        policyVersion: version,
      });
      Logger.info(TAG, `Consent v${version} synced to backend`);
    } catch (err) {
      Logger.warn(
        TAG,
        'Failed to sync consent to backend (will retry next login)',
        err,
      );
    }
  },
};
