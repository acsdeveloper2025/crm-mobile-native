// CRM Mobile Native - Configuration
// Environment-based configuration for the mobile app

import { NativeModules, Platform } from 'react-native';

export interface AppConfig {
  apiBaseUrl: string;
  wsUrl: string;
  appVersion: string;
  buildNumber: string;
  platform: 'IOS' | 'ANDROID';
  environment: 'development' | 'staging' | 'production';

  // Sync settings
  syncIntervalMs: number;
  syncBatchSize: number;
  maxRetryAttempts: number;
  retryDelayMs: number;

  // Storage limits
  maxFileSize: number; // bytes
  maxFilesPerTask: number;
  maxOfflineStorageMb: number;

  // Location settings
  locationAccuracyThreshold: number; // meters
  locationUpdateIntervalMs: number;

  // Database
  dbName: string;
  dbVersion: number;
}

const nativeAppInfo = (NativeModules as { AppInfo?: { versionName?: string; versionCode?: number | string } }).AppInfo;
const resolvedAppVersion = nativeAppInfo?.versionName || '4.0.0';
const resolvedBuildNumber = nativeAppInfo?.versionCode?.toString() || '84';

const BASE_CONFIG: Omit<AppConfig, 'apiBaseUrl' | 'wsUrl' | 'environment'> = {
  appVersion: resolvedAppVersion,
  buildNumber: resolvedBuildNumber,
  platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',

  // Sync: every 5 minutes when online
  syncIntervalMs: 5 * 60 * 1000,
  syncBatchSize: 50,
  maxRetryAttempts: 3,
  retryDelayMs: 5000,

  // Storage
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFilesPerTask: 15,
  maxOfflineStorageMb: 500,

  // Location — adaptive interval to reduce battery drain at scale
  locationAccuracyThreshold: 100, // 100 meters
  locationUpdateIntervalMs: 60000, // 60 seconds (base interval, adaptive up to 120s when stationary)

  // Database
  dbName: 'crm_mobile.db',
  dbVersion: 7,
};

// Environment-specific API URLs (from CRM-MOBILE .env files)
const ENV_CONFIGS = {
  development: {
    apiBaseUrl: 'https://example.com/api/mobile',
    wsUrl: 'wss://example.com',
  },
  staging: {
    apiBaseUrl: 'https://example.com/api/mobile',
    wsUrl: 'wss://example.com',
  },
  production: {
    apiBaseUrl: 'https://crm.allcheckservices.com/api/mobile',
    wsUrl: 'wss://crm.allcheckservices.com',
  },
};

// Default to development - override via .env or build config
const CURRENT_ENV: 'development' | 'staging' | 'production' = 'production';

export const config: AppConfig = {
  ...BASE_CONFIG,
  ...ENV_CONFIGS[CURRENT_ENV],
  environment: CURRENT_ENV,
};

export default config;
