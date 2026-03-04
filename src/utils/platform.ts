// Platform utilities - wrappers for platform-specific logic
// Ensures components never use Android-only or iOS-only APIs directly

import { Platform, Dimensions, PixelRatio } from 'react-native';

/**
 * Current platform as expected by our backend
 */
export const CURRENT_PLATFORM: 'IOS' | 'ANDROID' =
  Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

/**
 * Check if running on iOS
 */
export const isIOS = Platform.OS === 'ios';

/**
 * Check if running on Android
 */
export const isAndroid = Platform.OS === 'android';

/**
 * Get the OS version string
 */
export function getOSVersion(): string {
  return String(Platform.Version);
}

/**
 * Platform-aware value selection
 * Usage: platformValue({ ios: 20, android: 16 })
 */
export function platformValue<T>(values: { ios: T; android: T }): T {
  return Platform.select({
    ios: values.ios,
    android: values.android,
  }) as T;
}

/**
 * Screen dimensions helper
 */
export function getScreenDimensions() {
  const { width, height } = Dimensions.get('window');
  return {
    width,
    height,
    isSmallScreen: width < 375,
    isTablet: width >= 768,
    pixelRatio: PixelRatio.get(),
  };
}

/**
 * Normalize size across different screen densities
 */
export function normalize(size: number): number {
  const { width } = Dimensions.get('window');
  const scale = width / 375; // Based on iPhone 6/7/8 width
  const newSize = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
}
