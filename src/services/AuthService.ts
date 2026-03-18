// AuthService - Authentication, token management, session persistence
// All storage uses SQLite - no AsyncStorage dependency

import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { CURRENT_PLATFORM, getOSVersion } from '../utils/platform';
import { PushTokenService } from './PushTokenService';
import { SessionStore } from './SessionStore';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { UserSessionRepository } from '../repositories/UserSessionRepository';
import type {
  MobileDeviceInfo,
  UserProfile,
} from '../types/api';

const TAG = 'AuthService';
const TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';
const DEVICE_ID_KEY = 'device_id';

class AuthServiceClass {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: UserProfile | null = null;
  private deviceId: string | null = null;
  private onLogoutCallback: (() => void) | null = null;

  constructor() {
    ApiClient.setRefreshHandler(() => this.refreshAccessToken());
    ApiClient.setUnauthorizedHandler(() => this.handleUnauthorized());
  }

  /**
   * Set callback to be called when user is logged out (e.g., navigate to login)
   */
  setOnLogoutCallback(callback: () => void): void {
    this.onLogoutCallback = callback;
  }

  // ---- SQLite Key-Value helpers ----

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

  private async kvRemove(key: string): Promise<void> {
    if (!KeyValueRepository.isReady()) {
      return;
    }
    await KeyValueRepository.remove(key);
  }

  private async handleUnauthorized(): Promise<void> {
    await this.logout();
  }

  private async hasUserSessionTokenColumns(): Promise<boolean> {
    if (!UserSessionRepository.isReady()) {
      return false;
    }

    return UserSessionRepository.hasLegacyTokenColumns();
  }

  private async migrateLegacyTokensFromSQLite(): Promise<void> {
    const secureTokens = await SessionStore.getTokens();
    if (secureTokens?.accessToken && secureTokens.refreshToken) {
      return;
    }

    let legacyAccessToken = await this.kvGet(TOKEN_KEY);
    let legacyRefreshToken = await this.kvGet(REFRESH_TOKEN_KEY);

    if ((!legacyAccessToken || !legacyRefreshToken) && await this.hasUserSessionTokenColumns()) {
      const legacyTokens = await UserSessionRepository.getLegacyTokens();
      legacyAccessToken = legacyAccessToken || legacyTokens.accessToken;
      legacyRefreshToken = legacyRefreshToken || legacyTokens.refreshToken;
    }

    if (legacyAccessToken && legacyRefreshToken) {
      await SessionStore.setTokens({
        accessToken: legacyAccessToken,
        refreshToken: legacyRefreshToken,
      });
      await this.kvRemove(TOKEN_KEY);
      await this.kvRemove(REFRESH_TOKEN_KEY);
      await this.scrubLegacySqliteTokens();
    }
  }

  private async scrubLegacySqliteTokens(): Promise<void> {
    await this.kvRemove(TOKEN_KEY);
    await this.kvRemove(REFRESH_TOKEN_KEY);

    if (await this.hasUserSessionTokenColumns()) {
      await UserSessionRepository.scrubLegacyTokens();
    }
  }

  /**
   * Initialize auth state from stored tokens / session
   */
  async initialize(): Promise<boolean> {
    try {
      await this.migrateLegacyTokensFromSQLite();
      const secureTokens = await SessionStore.getTokens();
      this.accessToken = secureTokens?.accessToken || null;
      this.refreshToken = secureTokens?.refreshToken || null;
      const expiry = await this.kvGet(TOKEN_EXPIRY_KEY);

      if (!this.accessToken || !this.refreshToken) {
        Logger.info(TAG, 'No stored tokens found');
        return false;
      }

      // Check if token is expired
      if (expiry && new Date(expiry) < new Date()) {
        Logger.info(TAG, 'Access token expired, attempting refresh');
        const newToken = await this.refreshAccessToken();
        if (!newToken) {
          return false;
        }
      }

      // Load user from DB
      await this.loadUserFromDb();
      return this.currentUser !== null;
    } catch (error) {
      Logger.error(TAG, 'Failed to initialize auth', error);
      return false;
    }
  }

  /**
   * Store session data after successful login
   */
  async login(
    accessToken: string,
    user: UserProfile,
    refreshToken?: string,
    expiresIn: number = 24 * 60 * 60, // 24 hours default
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken || null;

      if (refreshToken) {
        await SessionStore.setTokens({ accessToken, refreshToken });
      } else {
        await SessionStore.clearTokens();
      }
      await this.scrubLegacySqliteTokens();

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      await this.kvSet(TOKEN_EXPIRY_KEY, expiresAt);

      // Store user in DB
      this.currentUser = user;
      await this.saveUserToDb(user, expiresAt);

      Logger.info(TAG, `Login successful for ${user.name}`);
      return { success: true, message: 'Login successful' };
    } catch (error: any) {
      const message = error?.message || 'Login failed';
      Logger.error(TAG, 'Login failed', error);
      return { success: false, message };
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<string | null> {
    try {
      if (!this.refreshToken) {
        Logger.warn(TAG, 'No refresh token available');
        return null;
      }

      const response = await ApiClient.post<{
        success: boolean;
        data?: { accessToken: string; refreshToken?: string; expiresIn: number };
      }>(ENDPOINTS.AUTH.REFRESH, {
        refreshToken: this.refreshToken,
      });

      if (response.success && response.data) {
        this.accessToken = response.data.accessToken;
        if (response.data.refreshToken) {
          this.refreshToken = response.data.refreshToken;
        }
        if (this.refreshToken) {
          await SessionStore.setTokens({
            accessToken: response.data.accessToken,
            refreshToken: this.refreshToken,
          });
        }
        await this.scrubLegacySqliteTokens();

        const expiresAt = new Date(
          Date.now() + response.data.expiresIn * 1000,
        ).toISOString();
        await this.kvSet(TOKEN_EXPIRY_KEY, expiresAt);

        Logger.info(TAG, 'Token refreshed successfully');
        return response.data.accessToken;
      }

      return null;
    } catch (error) {
      Logger.error(TAG, 'Token refresh failed', error);
      return null;
    }
  }

  /**
   * Logout - clear tokens and session
   */
  async logout(): Promise<void> {
    try {
      // Try to notify server (best effort)
      if (this.accessToken) {
        try {
          await ApiClient.post(ENDPOINTS.AUTH.LOGOUT);
        } catch {
          // Ignore server logout failure
        }
      }

      // Clear local state
      this.accessToken = null;
      this.refreshToken = null;
      this.currentUser = null;

      await SessionStore.clearTokens();
      await this.scrubLegacySqliteTokens();
      await this.kvRemove(TOKEN_EXPIRY_KEY);

      // Clear user session from DB
      if (UserSessionRepository.isReady()) {
        await UserSessionRepository.clearSession();
      }

      Logger.info(TAG, 'Logout completed');

      if (this.onLogoutCallback) {
        this.onLogoutCallback();
      }
    } catch (error) {
      Logger.error(TAG, 'Logout error', error);
    }
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      this.accessToken = await SessionStore.getAccessToken();
    }
    return this.accessToken;
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  /**
   * Update profile photo URL for current user and persist to SQLite.
   */
  async updateProfilePhoto(profilePhotoUrl: string): Promise<UserProfile | null> {
    if (!this.currentUser) {
      return null;
    }

    const updatedUser: UserProfile = {
      ...this.currentUser,
      profilePhotoUrl,
    };

    this.currentUser = updatedUser;

    if (UserSessionRepository.isReady()) {
      await UserSessionRepository.updateProfilePhoto(profilePhotoUrl);
    }

    return updatedUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null && this.currentUser !== null;
  }

  /**
   * Get or create a unique device ID
   */
  private async getDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    let storedId = await this.kvGet(DEVICE_ID_KEY);
    if (!storedId) {
      const uuid = require('uuid');
      storedId = uuid.v4();
      await this.kvSet(DEVICE_ID_KEY, storedId!);
    }

    this.deviceId = storedId;
    return storedId!;
  }

  /**
   * Build MobileDeviceInfo for API requests
   */
  async getDeviceInfo(): Promise<MobileDeviceInfo> {
    return {
      deviceId: await this.getDeviceId(),
      platform: CURRENT_PLATFORM,
      model: 'Unknown', // TODO: Use react-native-device-info
      osVersion: getOSVersion(),
      appVersion: config.appVersion,
      pushToken: (await PushTokenService.getCachedPushToken()) || undefined,
    };
  }

  /**
   * Save user session to SQLite
   */
  private async saveUserToDb(
    user: UserProfile,
    expiresAt: string,
  ): Promise<void> {
    if (!UserSessionRepository.isReady()) {
      return;
    }
    await UserSessionRepository.saveUser(user, expiresAt);
  }

  /**
   * Load user session from SQLite
   */
  private async loadUserFromDb(): Promise<void> {
    if (!UserSessionRepository.isReady()) {
      return;
    }
    this.currentUser = await UserSessionRepository.loadUser();
  }
}

// Singleton
export const AuthService = new AuthServiceClass();
export default AuthService;
