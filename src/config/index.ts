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
  /** SQLCipher encryption key — set via Keychain at first launch. null = unencrypted. */
  dbEncryptionKey: string | null;
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

  // Storage — aligned with backend limits (50MB file size, 20 files per upload)
  maxFileSize: 50 * 1024 * 1024, // 50MB (matches backend attachmentsController limit)
  maxFilesPerTask: 20, // matches backend max files per request
  maxOfflineStorageMb: 500,

  // Location — adaptive interval to reduce battery drain at scale
  locationAccuracyThreshold: 100, // 100 meters
  locationUpdateIntervalMs: 60000, // 60 seconds (base interval, adaptive up to 120s when stationary)

  // Database
  dbName: 'crm_mobile.db',
  dbVersion: 7,
  dbEncryptionKey: null, // Set at runtime from Keychain — see DatabaseService.initialize()
};

// Environment-specific API URLs
// Development/staging URLs should be set via build-time config or .env
const ENV_CONFIGS = {
  development: {
    apiBaseUrl: 'http://localhost:3000/api/mobile',
    wsUrl: 'ws://localhost:3000',
  },
  staging: {
    apiBaseUrl: 'https://crm.allcheckservices.com/api/mobile',
    wsUrl: 'wss://crm.allcheckservices.com',
  },
  production: {
    apiBaseUrl: 'https://crm.allcheckservices.com/api/mobile',
    wsUrl: 'wss://crm.allcheckservices.com',
  },
};

// Resolve environment from build config or default to production
const resolveEnvironment = (): 'development' | 'staging' | 'production' => {
  // React Native __DEV__ flag is true in debug builds, false in release
  if (__DEV__) {
    return 'development';
  }
  return 'production';
};

const CURRENT_ENV = resolveEnvironment();

export const config: AppConfig = {
  ...BASE_CONFIG,
  ...ENV_CONFIGS[CURRENT_ENV],
  environment: CURRENT_ENV,
};

export default config;
