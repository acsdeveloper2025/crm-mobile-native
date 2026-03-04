import { Platform } from 'react-native';
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
      const isOnline = await this.isBackendReachable();
      if (!isOnline) {
        return this.getDefaultUpdateInfo();
      }

      const payload: MobileVersionCheckRequest = {
        currentVersion: APP_VERSION,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID'
      };

      const response = await ApiClient.post<MobileVersionCheckResponse>(
        ENDPOINTS.VERSION.CHECK,
        payload
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
      Logger.error(TAG, 'Failed to check app version against backend', error);
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

  private async isBackendReachable(): Promise<boolean> {
    try {
      const resp = await ApiClient.get<{ status: string }>(ENDPOINTS.HEALTH);
      return resp.status === 'OK' || resp.status === 'ok';
    } catch {
      return false;
    }
  }
}

export const VersionService = new VersionServiceClass();
export default VersionService;
