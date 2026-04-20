// AuthService - Authentication, token management, session persistence
// All storage uses SQLite - no AsyncStorage dependency

import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { config } from '../config';
import { Logger } from '../utils/logger';
import {
  CURRENT_PLATFORM,
  getOSVersion,
  getDeviceModel,
} from '../utils/platform';
import { PushTokenService } from './PushTokenService';
import { SessionStore } from './SessionStore';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { UserSessionRepository } from '../repositories/UserSessionRepository';
import { ProjectionStore } from '../store/ProjectionStore';
import type { MobileDeviceInfo, UserProfile } from '../types/api';
import { validateResponse } from '../api/schemas/runtime';
import { MobileRefreshResponseSchema } from '../api/schemas/sync.schema';

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

    if (
      (!legacyAccessToken || !legacyRefreshToken) &&
      (await this.hasUserSessionTokenColumns())
    ) {
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

      // Intentionally omit user.name — Logger ships its buffer to the backend
      // telemetry endpoint on crash (RemoteLogService). Name is PII; user id
      // is adequate for correlating logs to a session.
      Logger.info(TAG, `Login successful (userId=${user.id})`);
      return { success: true, message: 'Login successful' };
    } catch (error: unknown) {
      Logger.error(TAG, 'Login failed during session storage', error);
      // Provide specific error messages so the LoginScreen can show the right feedback
      const errorName = error instanceof Error ? error.name : '';
      if (errorName.includes('Keychain') || errorName.includes('keychain')) {
        return {
          success: false,
          message:
            'SESSION_STORAGE_FAILED: Unable to save login session securely. Please restart the app and try again.',
        };
      }
      return {
        success: false,
        message: `SESSION_STORAGE_FAILED: ${
          error instanceof Error
            ? error.message
            : 'Failed to save session data. Please restart the app.'
        }`,
      };
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
        data?: {
          accessToken: string;
          refreshToken?: string;
          expiresIn: number;
        };
      }>(ENDPOINTS.AUTH.REFRESH, {
        refreshToken: this.refreshToken,
      });

      validateResponse(MobileRefreshResponseSchema, response, {
        service: 'auth',
        endpoint: 'POST /auth/refresh',
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

      // Clear the in-memory projection cache so a subsequent login on a
      // shared device can't read the prior user's tasks/customer data via
      // useTask/useTasks selectors. Local DB rows stay until next sync —
      // that's fine because queries re-fetch user-scoped data; the leak
      // was specifically in RAM.
      ProjectionStore.clearAll();

      Logger.info(TAG, 'Logout completed');

      // Drop the in-memory log ring buffer AFTER the final log line so
      // this commit-marker makes it to disk first. Prior-user log lines
      // (task IDs, addresses, error traces) were otherwise shipped to
      // the backend's telemetry endpoint when the NEXT user triggered a
      // crash report via RemoteLogService.
      Logger.clearBuffer();

      if (this.onLogoutCallback) {
        this.onLogoutCallback();
      }
    } catch (error) {
      Logger.error(TAG, 'Logout error', error);
    }
  }

  /**
   * Get current access token.
   * Proactively refreshes if token is within 2 minutes of expiry to avoid
   * sending expired tokens and triggering unnecessary 401→refresh cycles.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      this.accessToken = await SessionStore.getAccessToken();
    }

    // Proactive refresh: if token expires within 2 minutes, refresh now
    if (this.accessToken) {
      try {
        const expiryStr = await this.kvGet(TOKEN_EXPIRY_KEY);
        if (expiryStr) {
          const expiresAt = new Date(expiryStr).getTime();
          const twoMinutes = 2 * 60 * 1000;
          if (Date.now() > expiresAt - twoMinutes) {
            Logger.info(TAG, 'Token near expiry, refreshing proactively');
            const newToken = await this.refreshAccessToken();
            if (newToken) {
              return newToken;
            }
          }
        }
      } catch {
        // Non-critical: fall through with existing token
      }
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
  async updateProfilePhoto(
    profilePhotoUrl: string,
  ): Promise<UserProfile | null> {
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
    let pushToken: string | undefined;
    try {
      pushToken = (await PushTokenService.getCachedPushToken()) || undefined;
    } catch (err) {
      Logger.warn(
        TAG,
        'Failed to get push token for device info — continuing without it',
        err,
      );
    }
    return {
      deviceId: await this.getDeviceId(),
      platform: CURRENT_PLATFORM,
      model: getDeviceModel(),
      osVersion: getOSVersion(),
      appVersion: config.appVersion,
      pushToken,
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
