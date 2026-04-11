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
    await Keychain.setGenericPassword(
      SESSION_USERNAME,
      JSON.stringify(tokens),
      {
        service: SESSION_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  }

  async clearTokens(): Promise<void> {
    await Keychain.resetGenericPassword({
      service: SESSION_SERVICE,
    });
  }
}

export const SessionStore = new SessionStoreClass();
export default SessionStore;
