import * as Keychain from 'react-native-keychain';

const SESSION_SERVICE = 'crm-mobile-native.session';
const SESSION_USERNAME = 'session';

export interface StoredSessionTokens {
  accessToken: string;
  refreshToken: string;
}

class SessionStoreClass {
  async getTokens(): Promise<StoredSessionTokens | null> {
    const credentials = await Keychain.getGenericPassword({
      service: SESSION_SERVICE,
    });

    if (!credentials) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        credentials.password,
      ) as Partial<StoredSessionTokens>;
      if (!parsed.accessToken || !parsed.refreshToken) {
        return null;
      }

      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      };
    } catch {
      return null;
    }
  }

  async getAccessToken(): Promise<string | null> {
    return (await this.getTokens())?.accessToken || null;
  }

  async getRefreshToken(): Promise<string | null> {
    return (await this.getTokens())?.refreshToken || null;
  }

  async setTokens(tokens: StoredSessionTokens): Promise<void> {
    // 2026-04-21 v1.0.3 fix: do NOT request `SECURITY_LEVEL.SECURE_HARDWARE`.
    // See `DatabaseKeyStore.getOrCreateKey` for the Samsung regression
    // story — some Knox/StrongBox policies silently no-op the store,
    // the library returns `false` without throwing, and the app runs
    // with an un-stored value that vanishes on next launch. For session
    // tokens that meant the user was silently logged out on every
    // cold-start; for the DB key it meant SQLITE_CORRUPT on launch 2.
    //
    // `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` still keeps tokens
    // (a) off the cloud/backup path, (b) unreadable while screen locked,
    // (c) using the OS-best backing (hardware-backed when the platform
    // exposes it reliably, software-encrypted otherwise). Net security
    // is equivalent on every OEM we've tested except Samsung, where
    // this variant is the one that actually works.
    const result = await Keychain.setGenericPassword(
      SESSION_USERNAME,
      JSON.stringify(tokens),
      {
        service: SESSION_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );

    if (result === false) {
      // Surface silent store failures so we don't end up with the same
      // wrong-key class of regressions again.
      throw new Error('Failed to store session tokens in the system keychain');
    }
  }

  async clearTokens(): Promise<void> {
    await Keychain.resetGenericPassword({
      service: SESSION_SERVICE,
    });
  }
}

export const SessionStore = new SessionStoreClass();
export default SessionStore;
