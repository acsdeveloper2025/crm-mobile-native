// LocationService - Cross-platform GPS location tracking
// Uses @react-native-community/geolocation for both iOS and Android

import Geolocation, {
  GeolocationResponse,
  GeolocationError,
} from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { LocationRepository } from '../repositories/LocationRepository';
import { SyncGateway } from './SyncGateway';
import { SYNC_PRIORITY } from './SyncQueue';
import { Logger } from '../utils/logger';
import { config } from '../config';
import type { MobileLocationCaptureRequest } from '../types/api';

const TAG = 'LocationService';

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  source: 'GPS' | 'NETWORK' | 'PASSIVE';
}

// Adaptive interval constants (battery-optimized for 1000+ field users)
const MOVING_INTERVAL_MS = 60_000; // 60s when agent is moving
const STATIONARY_INTERVAL_MS = 120_000; // 120s when agent is stationary
const STATIONARY_DISTANCE_THRESHOLD = 30; // meters — less than this in last update = stationary
const DISTANCE_FILTER_METERS = 100; // minimum meters between updates

class LocationServiceClass {
  private watchId: number | null = null;
  private lastLocation: LocationResult | null = null;
  private adaptiveTimerId: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs = MOVING_INTERVAL_MS;

  /**
   * Request location permissions for both platforms
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'This app needs access to your location for field verification.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      // iOS: permissions are requested automatically via Info.plist
      // The first call to getCurrentPosition will trigger the prompt
      return true;
    } catch (error) {
      Logger.error(TAG, 'Permission request failed', error);
      return false;
    }
  }

  /**
   * M27: a GPS fix is considered stale if its device-reported
   * timestamp is more than STALE_FIX_THRESHOLD_MS behind wall-
   * clock. `maximumAge: 10000` below already asks the OS for a
   * fix at most 10 seconds old, but on Android some vendor HALs
   * ignore that hint and return the cached fix anyway. A mock-
   * location app can also hold a stale fix on purpose to defeat
   * travel-time checks.
   *
   * 30 seconds is the ceiling: a field agent walking between
   * doors may naturally have a 5-10s old fix, but anything beyond
   * 30s means either the device hasn't seen the sky in a while or
   * something is feeding us a cached coordinate. Rejecting forces
   * the next call to either re-request or surface the "GPS not
   * ready" state to the UI.
   */
  private static readonly STALE_FIX_THRESHOLD_MS = 30_000;

  /**
   * Get current location (one-shot)
   */
  async getCurrentLocation(): Promise<LocationResult | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        Logger.warn(TAG, 'Location permission denied');
        return null;
      }

      return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position: GeolocationResponse) => {
            // M27: reject fixes whose device-reported timestamp is
            // older than the staleness threshold. Return null so
            // the caller can retry or fall through to the "no
            // location" UX rather than silently accepting an old
            // coordinate.
            const positionAgeMs = Date.now() - position.timestamp;
            if (positionAgeMs > LocationServiceClass.STALE_FIX_THRESHOLD_MS) {
              Logger.warn(
                TAG,
                `Rejecting stale GPS fix (${Math.round(
                  positionAgeMs / 1000,
                )}s old > ${Math.round(
                  LocationServiceClass.STALE_FIX_THRESHOLD_MS / 1000,
                )}s threshold)`,
                {
                  lat: position.coords.latitude,
                  lon: position.coords.longitude,
                  reportedAt: new Date(position.timestamp).toISOString(),
                },
              );
              resolve(null);
              return;
            }

            const result: LocationResult = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy || 0,
              timestamp: new Date(position.timestamp).toISOString(),
              source: 'GPS',
            };
            // Deliberately omit lat/lon from the message string — Logger
            // ships its ring buffer to the backend telemetry endpoint on
            // crash (RemoteLogService); GPS coordinates are PII. Key-based
            // sensitive fields in data objects are already redacted by
            // SENSITIVE_KEY_PATTERN in utils/logger.ts.
            Logger.debug(
              TAG,
              `Location fix obtained (±${result.accuracy}m, source=${result.source})`,
            );
            resolve(result);
          },
          (error: GeolocationError) => {
            Logger.error(TAG, `Location error: ${error.message}`, error);
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          },
        );
      });
    } catch (error) {
      Logger.error(TAG, 'getCurrentLocation failed', error);
      return null;
    }
  }

  /**
   * Record a location point to local DB and queue for sync
   */
  async recordLocation(
    taskId?: string,
    activityType?: 'CASE_START' | 'CASE_PROGRESS' | 'CASE_COMPLETE' | 'TRAVEL',
  ): Promise<LocationResult | null> {
    const location = await this.getCurrentLocation();
    if (!location) {
      return null;
    }

    const id = uuidv4();

    // Save to local DB
    await LocationRepository.create({
      id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
      source: location.source,
      taskId,
      activityType,
    });

    // Queue for server sync
    const payload: MobileLocationCaptureRequest = {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
      source: location.source,
      taskId,
      activityType,
    };

    await SyncGateway.enqueueLocation(
      id,
      payload as unknown as Record<string, unknown>,
      SYNC_PRIORITY.CRITICAL,
    );

    return location;
  }

  /**
   * Start adaptive continuous location tracking (battery-optimized for enterprise scale).
   * - 60s interval when agent is moving (>30m since last update)
   * - 120s interval when stationary
   * - 100m distance filter to reduce unnecessary GPS wake-ups
   */
  startTracking(intervalMs: number = MOVING_INTERVAL_MS): void {
    if (this.watchId !== null) {
      Logger.warn(TAG, 'Already tracking');
      return;
    }

    this.currentIntervalMs = intervalMs;

    // Use watchPosition with larger distance filter for movement-based updates
    this.watchId = Geolocation.watchPosition(
      (position: GeolocationResponse) => {
        const location: LocationResult = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          timestamp: new Date(position.timestamp).toISOString(),
          source: 'GPS',
        };

        // Adaptive interval: detect if agent is moving or stationary
        if (this.lastLocation) {
          const distance = this.calculateDistance(
            this.lastLocation.latitude,
            this.lastLocation.longitude,
            location.latitude,
            location.longitude,
          );
          const wasMoving = this.currentIntervalMs === MOVING_INTERVAL_MS;
          const isMoving = distance > STATIONARY_DISTANCE_THRESHOLD;

          if (isMoving && !wasMoving) {
            this.currentIntervalMs = MOVING_INTERVAL_MS;
            Logger.info(
              TAG,
              `Agent moving (${distance.toFixed(0)}m), interval → ${
                MOVING_INTERVAL_MS / 1000
              }s`,
            );
          } else if (!isMoving && wasMoving) {
            this.currentIntervalMs = STATIONARY_INTERVAL_MS;
            Logger.info(
              TAG,
              `Agent stationary (${distance.toFixed(0)}m), interval → ${
                STATIONARY_INTERVAL_MS / 1000
              }s`,
            );
          }
        }

        this.lastLocation = location;

        // Record to DB (fire-and-forget)
        this.recordLocationDirect(location).catch(err =>
          Logger.error(TAG, 'Failed to record tracked location', err),
        );
      },
      (error: GeolocationError) => {
        Logger.error(TAG, 'Tracking error', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: DISTANCE_FILTER_METERS,
        interval: this.currentIntervalMs,
        fastestInterval: MOVING_INTERVAL_MS / 2,
      },
    );

    // Fallback timer: ensure at least one update per stationary interval
    // (watchPosition may not fire if device is completely still)
    this.adaptiveTimerId = setInterval(() => {
      this.recordLocation(undefined, 'TRAVEL').catch(err =>
        Logger.error(TAG, 'Adaptive timer location failed', err),
      );
    }, STATIONARY_INTERVAL_MS);

    Logger.info(
      TAG,
      `Adaptive location tracking started (${
        MOVING_INTERVAL_MS / 1000
      }s moving / ${STATIONARY_INTERVAL_MS / 1000}s stationary)`,
    );
  }

  /**
   * Stop continuous location tracking and clean up adaptive timer
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.adaptiveTimerId !== null) {
      clearInterval(this.adaptiveTimerId);
      this.adaptiveTimerId = null;
    }
    this.lastLocation = null;
    this.currentIntervalMs = MOVING_INTERVAL_MS;
    Logger.info(TAG, 'Location tracking stopped');
  }

  /**
   * Record a location directly (no permission check, used by watcher)
   */
  private async recordLocationDirect(location: LocationResult): Promise<void> {
    const id = uuidv4();

    await LocationRepository.createTracked({
      id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
      source: location.source,
    });

    await SyncGateway.enqueueLocation(
      id,
      location as unknown as Record<string, unknown>,
      SYNC_PRIORITY.LOW,
    );
  }

  /**
   * Check if tracking is active
   */
  isTracking(): boolean {
    return this.watchId !== null;
  }

  /**
   * Calculate distance in meters between two coordinates (Haversine formula)
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth radius in meters
    const toRadians = (deg: number) => deg * (Math.PI / 180);
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  /**
   * Reverse geocode coordinates to a full address using OpenStreetMap
   * Nominatim. No API key required — OSM's terms ask only for a
   * descriptive User-Agent identifying the app and a rate limit of
   * ≤ 1 req/sec. The 100-entry LRU cache (key = lat/lon rounded to
   * 3 decimals, ≈110 m precision) keeps calls well under that for
   * typical field-agent usage.
   *
   * C8 (audit 2026-04-20): replaces the Google Geocoding API path
   * that required a hardcoded API key in the mobile binary.
   *
   * Uses Nominatim's `display_name` directly as the address string.
   * Testing across Mumbai / Delhi / Bangalore / Kolkata / Kota /
   * Jodhpur (2026-04-20) showed that building the address from
   * individual `address.*` fields drops verification-critical detail —
   * Nominatim puts tehsil/sub-district data in `county`/`municipality`
   * fields that don't map 1:1 to Google's old schema, and UTs (Delhi)
   * leave `address.state` empty entirely. `display_name` is
   * Nominatim's own canonical rendering and contains every level with
   * correct ordering. A tiny dedupe pass removes the occasional
   * duplicate token (e.g. "Kota, Kota" where city = state_district).
   */
  async getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = LocationServiceClass.geocodeCache.get(cacheKey);
    if (cached) {
      // Refresh LRU ordering: delete + re-insert moves the entry to
      // the end (most-recently-used) in an insertion-ordered Map.
      LocationServiceClass.geocodeCache.delete(cacheKey);
      LocationServiceClass.geocodeCache.set(cacheKey, cached);
      return cached;
    }

    const fallback = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Nominatim usage policy requires a descriptive User-Agent.
          'User-Agent': `ACS-CRM-Mobile/${config.appVersion} (${config.platform})`,
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        Logger.warn(TAG, `Nominatim returned HTTP ${response.status}`);
        return fallback;
      }

      const data = (await response.json()) as {
        display_name?: string;
      };

      const displayName = data.display_name;
      if (!displayName || typeof displayName !== 'string') {
        return fallback;
      }

      // Collapse duplicate tokens (keep first occurrence). Nominatim
      // returns the same name at multiple admin levels when a city and
      // its state_district / municipality share a name:
      //   "Kota, Ladpura Tehsil, Kota, Rajasthan, …"
      //   "Jodhpur, Jodhpur Tehsil, Jodhpur, Rajasthan, …"
      //   "Kolkata, Kolkata Metropolitan Area, Kolkata, West Bengal, …"
      // Strings that ARE legitimately different (e.g. "New Delhi" vs
      // "Delhi") are preserved because they don't match character-for-
      // character. This is safer than adjacent-only dedupe, which
      // leaves the duplicates separated by a tehsil token intact.
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const token of displayName.split(',').map(t => t.trim())) {
        if (token && !seen.has(token)) {
          seen.add(token);
          deduped.push(token);
        }
      }
      const result = deduped.join(', ') || fallback;

      // LRU insert with eviction
      if (LocationServiceClass.geocodeCache.size >= GEOCODE_CACHE_CAPACITY) {
        const oldestKey = LocationServiceClass.geocodeCache.keys().next().value;
        if (oldestKey !== undefined) {
          LocationServiceClass.geocodeCache.delete(oldestKey);
        }
      }
      LocationServiceClass.geocodeCache.set(cacheKey, result);

      return result;
    } catch (error) {
      Logger.warn(
        TAG,
        'Nominatim reverse geocoding failed, using coordinates',
        error,
      );
      return fallback;
    }
  }

  // LRU cache (see getAddressFromCoordinates). Static singleton to
  // survive service-instance churn during hot reloads and to be
  // trivially shared across getAddressFromCoordinates callers.
  private static geocodeCache = new Map<string, string>();
}

const GEOCODE_CACHE_CAPACITY = 100;

// Singleton
export const LocationService = new LocationServiceClass();
export default LocationService;
