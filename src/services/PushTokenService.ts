import { PermissionsAndroid, Platform } from 'react-native';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { Logger } from '../utils/logger';

const TAG = 'PushTokenService';
const PUSH_TOKEN_KEY = 'push_token';
const PUSH_TOKEN_UPDATED_AT_KEY = 'push_token_updated_at';

type MessagingInstance = {
  requestPermission?: (messaging: unknown) => Promise<number>;
  registerDeviceForRemoteMessages?: (messaging: unknown) => Promise<void>;
  getToken?: (messaging: unknown) => Promise<string>;
  getMessaging?: () => unknown;
};

type MessagingModule = MessagingInstance;

class PushTokenServiceClass {
  private cachedPushToken: string | null = null;
  private loggedMissingModule = false;

  private async kvGet(key: string): Promise<string | null> {
    if (!KeyValueRepository.isReady()) {
      return null;
    }
    return KeyValueRepository.get(key);
  }

  private async kvSet(key: string, value: string): Promise<void> {
    if (!KeyValueRepository.isReady()) {
      return;
    }
    await KeyValueRepository.set(key, value);
  }

  private getMessagingModule(): MessagingModule | null {
    try {
      const module = require('@react-native-firebase/messaging');
      return module as MessagingModule;
    } catch (error) {
      if (!this.loggedMissingModule) {
        Logger.warn(
          TAG,
          'FCM module not available. Install and configure @react-native-firebase/messaging to enable push tokens.',
          error,
        );
        this.loggedMissingModule = true;
      }
      return null;
    }
  }

  private async ensureNotificationPermission(): Promise<boolean> {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const currentStatus = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (currentStatus) {
        return true;
      }

      const requested = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return requested === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  }

  async getCachedPushToken(): Promise<string | null> {
    if (this.cachedPushToken) {
      return this.cachedPushToken;
    }

    const token = await this.kvGet(PUSH_TOKEN_KEY);
    this.cachedPushToken = token;
    return token;
  }

  async getPushToken(forceRefresh: boolean = false): Promise<string | null> {
    try {
      if (!forceRefresh) {
        const cached = await this.getCachedPushToken();
        if (cached) {
          return cached;
        }
      }

      const hasPermission = await this.ensureNotificationPermission();
      if (!hasPermission) {
        Logger.warn(
          TAG,
          'Notification permission denied. Push token cannot be generated.',
        );
        return null;
      }

      const messagingModule = this.getMessagingModule();
      if (!messagingModule?.getMessaging) {
        Logger.warn(TAG, 'Messaging module not available.');
        return null;
      }

      const messaging = messagingModule.getMessaging();

      if (Platform.OS === 'ios' && messagingModule.requestPermission) {
        await messagingModule.requestPermission(messaging);
      }

      if (messagingModule.registerDeviceForRemoteMessages) {
        await messagingModule.registerDeviceForRemoteMessages(messaging);
      }

      if (!messagingModule.getToken) {
        Logger.warn(TAG, 'Messaging provider does not expose getToken().');
        return null;
      }

      const token = (await messagingModule.getToken(messaging))?.trim();
      if (!token) {
        Logger.warn(TAG, 'Push token provider returned an empty token.');
        return null;
      }

      this.cachedPushToken = token;
      await this.kvSet(PUSH_TOKEN_KEY, token);
      await this.kvSet(PUSH_TOKEN_UPDATED_AT_KEY, new Date().toISOString());
      return token;
    } catch (error) {
      Logger.error(TAG, 'Failed to retrieve push token', error);
      return null;
    }
  }
}

export const PushTokenService = new PushTokenServiceClass();
export default PushTokenService;
