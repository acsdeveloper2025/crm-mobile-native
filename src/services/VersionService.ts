import { Platform } from 'react-native';
import axios from 'axios';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { config } from '../config';
import { Logger } from '../utils/logger';
import type { MobileVersionCheckResponse, MobileVersionCheckRequest } from '../types/api';

export const APP_VERSION = config.appVersion;

const TAG = 'VersionService';

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  updateRequired: boolean;
  forceUpdate: boolean;
  required: boolean; // Alias for forceUpdate
  urgent?: boolean;
  size?: string;
  releaseNotes: string[];
  features: string[];
  bugFixes: string[];
  downloadUrl?: string;
}

class VersionServiceClass {
  /**
   * Hits the backend endpoint to check if the current APP_VERSION
   * passes the minimum allowed version for data integrity requirements.
   */
  async checkVersion(): Promise<UpdateInfo> {
    try {
      const payload: MobileVersionCheckRequest = {
        currentVersion: APP_VERSION,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID'
      };

      const response = await ApiClient.post<MobileVersionCheckResponse>(
        ENDPOINTS.VERSION.CHECK,
        payload,
        { timeout: 5000 }
      );

      if (response && response.success) {
        Logger.info(TAG, `Version Check: App=${APP_VERSION}, forceUpdate=${response.forceUpdate}`);
        return {
          version: response.latestVersion || APP_VERSION,
          releaseDate: response.releaseDate || new Date().toISOString(),
          updateRequired: response.updateRequired,
          forceUpdate: response.forceUpdate,
          required: response.forceUpdate,
          urgent: response.urgent,
          size: response.size,
          releaseNotes: response.releaseNotes ? [response.releaseNotes] : [],
          features: response.features || [],
          bugFixes: response.bugFixes || [],
          downloadUrl: response.downloadUrl
        };
      }

      return this.getDefaultUpdateInfo();
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        if (status >= 500 || status === 404) {
          Logger.warn(
            TAG,
            `Recoverable version check failure (${status}); using default update policy`,
          );
        } else {
          Logger.error(TAG, `Version check failed (${status})`, error);
        }
      } else {
        Logger.warn(TAG, 'Recoverable version check failure; using default update policy');
      }
      return this.getDefaultUpdateInfo();
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    const info = await this.checkVersion();
    return info.updateRequired ? info : null;
  }

  startAutoCheck(intervalMs: number = 3600000, callback?: (result: UpdateInfo) => void) {
    const interval = setInterval(async () => {
      const result = await this.checkVersion();
      if (result.updateRequired && callback) {
        callback(result);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }

  stopAutoCheck(cleanupFn?: () => void) {
    if (cleanupFn) cleanupFn();
  }

  getConfig() {
    return {
      currentVersion: APP_VERSION,
      platform: Platform.OS,
      notificationStyle: 'modal' as 'modal' | 'banner'
    };
  }

  private getDefaultUpdateInfo(): UpdateInfo {
    return {
      version: APP_VERSION,
      releaseDate: new Date().toISOString(),
      updateRequired: false,
      forceUpdate: false,
      required: false,
      releaseNotes: [],
      features: [],
      bugFixes: []
    };
  }

}

export const VersionService = new VersionServiceClass();
export default VersionService;
