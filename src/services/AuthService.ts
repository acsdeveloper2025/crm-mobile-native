// AuthService - Authentication, token management, session persistence
// All storage uses SQLite - no AsyncStorage dependency

import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { DatabaseService } from '../database/DatabaseService';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { CURRENT_PLATFORM, getOSVersion } from '../utils/platform';
import { PushTokenService } from './PushTokenService';
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

  /**
   * Set callback to be called when user is logged out (e.g., navigate to login)
   */
  setOnLogoutCallback(callback: () => void): void {
    this.onLogoutCallback = callback;
  }

  // ---- SQLite Key-Value helpers ----

  private async kvGet(key: string): Promise<string | null> {
    if (!DatabaseService.isReady()) {
      return null;
    }
    const rows = await DatabaseService.query<{ value: string }>(
      'SELECT value FROM key_value_store WHERE key = ?',
      [key],
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  private async kvSet(key: string, value: string): Promise<void> {
    if (!DatabaseService.isReady()) {
      return;
    }
    await DatabaseService.execute(
      'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  private async kvRemove(key: string): Promise<void> {
    if (!DatabaseService.isReady()) {
      return;
    }
    await DatabaseService.execute(
      'DELETE FROM key_value_store WHERE key = ?',
      [key],
    );
  }

  /**
   * Initialize auth state from stored tokens / session
   */
  async initialize(): Promise<boolean> {
    try {
      this.accessToken = await this.kvGet(TOKEN_KEY);
      this.refreshToken = await this.kvGet(REFRESH_TOKEN_KEY);
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

      // Store tokens in SQLite key-value store
      await this.kvSet(TOKEN_KEY, accessToken);
      if (refreshToken) await this.kvSet(REFRESH_TOKEN_KEY, refreshToken);

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      await this.kvSet(TOKEN_EXPIRY_KEY, expiresAt);

      // Store user in DB
      this.currentUser = user;
      await this.saveUserToDb(user, accessToken, refreshToken || '', expiresAt);

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
        await this.kvSet(TOKEN_KEY, response.data.accessToken);
        if (response.data.refreshToken) {
          this.refreshToken = response.data.refreshToken;
          await this.kvSet(REFRESH_TOKEN_KEY, response.data.refreshToken);
        }

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

      // Clear tokens from SQLite
      await this.kvRemove(TOKEN_KEY);
      await this.kvRemove(REFRESH_TOKEN_KEY);
      await this.kvRemove(TOKEN_EXPIRY_KEY);

      // Clear user session from DB
      if (DatabaseService.isReady()) {
        await DatabaseService.execute('DELETE FROM user_session');
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
      this.accessToken = await this.kvGet(TOKEN_KEY);
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
    accessToken: string,
    refreshTokenValue: string,
    expiresAt: string,
  ): Promise<void> {
    if (!DatabaseService.isReady()) {
      return;
    }

    await DatabaseService.execute('DELETE FROM user_session');
    await DatabaseService.execute(
      `INSERT INTO user_session
        (id, user_id, user_name, username, email, role, employee_id,
         designation, department, profile_photo_url,
         assigned_pincodes_json, assigned_areas_json,
         access_token, refresh_token, token_expires_at, logged_in_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.username,
        user.email || '',
        user.role,
        user.employeeId || '',
        user.designation || '',
        user.department || '',
        user.profilePhotoUrl || null,
        JSON.stringify(user.assignedPincodes || []),
        JSON.stringify(user.assignedAreas || []),
        accessToken,
        refreshTokenValue,
        expiresAt,
        new Date().toISOString(),
      ],
    );
  }

  /**
   * Load user session from SQLite
   */
  private async loadUserFromDb(): Promise<void> {
    if (!DatabaseService.isReady()) {
      return;
    }

    const rows = await DatabaseService.query<{
      user_id: string;
      user_name: string;
      username: string;
      email: string;
      role: string;
      employee_id: string;
      designation: string;
      department: string;
      profile_photo_url: string | null;
      assigned_pincodes_json: string | null;
      assigned_areas_json: string | null;
    }>('SELECT * FROM user_session WHERE id = 1');

    if (rows.length > 0) {
      const row = rows[0];
      this.currentUser = {
        id: row.user_id,
        name: row.user_name,
        username: row.username,
        email: row.email,
        role: row.role,
        employeeId: row.employee_id,
        designation: row.designation,
        department: row.department,
        profilePhotoUrl: row.profile_photo_url || undefined,
        assignedPincodes: row.assigned_pincodes_json
          ? JSON.parse(row.assigned_pincodes_json)
          : [],
        assignedAreas: row.assigned_areas_json
          ? JSON.parse(row.assigned_areas_json)
          : [],
      };
    }
  }
}

// Singleton
export const AuthService = new AuthServiceClass();
export default AuthService;
