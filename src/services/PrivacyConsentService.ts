// PrivacyConsentService — F-MD12 (audit 2026-04-28 deeper).
//
// Tracks whether the agent has accepted the in-app privacy notice
// (DPDP Act 2023 §5 "notice" obligation). Bumping CURRENT_VERSION
// re-prompts every user, which is required when the policy text
// materially changes.

import { KeyValueRepository } from '../repositories/KeyValueRepository';

const STORAGE_KEY = 'privacy_consent_version';

// Increment when the policy text in PrivacyPolicyScreen materially
// changes. Existing acceptance becomes stale and the user is re-
// prompted at next app launch.
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
    await KeyValueRepository.set(
      STORAGE_KEY,
      String(CURRENT_PRIVACY_POLICY_VERSION),
    );
  },
};
