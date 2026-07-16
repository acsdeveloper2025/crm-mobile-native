// Platform utilities - wrappers for platform-specific logic
// Ensures components never use Android-only or iOS-only APIs directly

import { Platform } from 'react-native';

/**
 * Current platform as expected by our backend
 */
export const CURRENT_PLATFORM: 'IOS' | 'ANDROID' =
  Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

/**
 * Get the OS version string
 */
export function getOSVersion(): string {
  return String(Platform.Version);
}

/**
 * Get device model name using built-in Platform constants (no external dependency needed)
 * Android: returns 'Brand Model' (e.g., 'Samsung SM-A525F')
 * iOS: returns device model identifier (e.g., 'iPhone14,5')
 */
export function getDeviceModel(): string {
  try {
    const constants = Platform.constants as Record<string, unknown>;
    if (Platform.OS === 'android') {
      const brand = String(constants.Brand || constants.Manufacturer || '');
      const model = String(constants.Model || '');
      return brand && model
        ? `${brand} ${model}`
        : model || brand || 'Android Device';
    }
    // iOS: systemName is always 'iPhone OS', but we can get model from constants
    const model = String(
      constants.interfaceIdiom || constants.systemName || 'iPhone',
    );
    return model;
  } catch {
    return 'Unknown';
  }
}
