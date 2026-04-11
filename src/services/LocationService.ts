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
            const result: LocationResult = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy || 0,
              timestamp: new Date(position.timestamp).toISOString(),
              source: 'GPS',
            };
            Logger.debug(
              TAG,
              `Location: ${result.latitude}, ${result.longitude} (±${result.accuracy}m)`,
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
   * Reverse geocode coordinates to a full address using Google Geocoding API.
   * Returns detailed address: street, locality, city, district, state, pincode, country.
   */
  async getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
    const GOOGLE_API_KEY = 'AIzaSyDjCfPbgYjzM8XyzJxQp9MVDdNj-i7FOTE';
    try {
      // No result_type filter — let Google return the best match at any level
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}&language=en`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        Logger.warn(TAG, `Google Geocoding returned: ${data.status}`);
        return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }

      // Google returns multiple results sorted by specificity — first is most detailed
      const bestResult = data.results[0];
      const components = bestResult.addressComponents || [];

      // Extract structured parts
      const extract = (type: string): string => {
        const comp = components.find(
          (c: { types: string[]; longName: string }) => c.types.includes(type),
        );
        return comp ? comp.longName : '';
      };

      const parts: string[] = [];

      // Street number + route
      const streetNum = extract('street_number');
      const route = extract('route');
      if (streetNum && route) {
        parts.push(`${streetNum}, ${route}`);
      } else if (route) {
        parts.push(route);
      }

      // Premise / building name
      const premise = extract('premise') || extract('subpremise');
      if (premise) parts.push(premise);

      // Sublocality levels (neighborhood, area)
      const sublocality =
        extract('sublocality_level_1') ||
        extract('sublocality') ||
        extract('neighborhood');
      if (sublocality) parts.push(sublocality);

      // Locality (city/town)
      const locality =
        extract('locality') || extract('administrative_area_level_3');
      if (locality) parts.push(locality);

      // District
      const district = extract('administrative_area_level_2');
      if (district && district !== locality) parts.push(district);

      // State
      const state = extract('administrative_area_level_1');
      if (state) parts.push(state);

      // Pincode
      const pincode = extract('postal_code');
      if (pincode) parts.push(pincode);

      // Country
      const country = extract('country');
      if (country) parts.push(country);

      return parts.length > 0
        ? parts.join(', ')
        : bestResult.formattedAddress || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    } catch (error) {
      Logger.warn(
        TAG,
        'Google reverse geocoding failed, using coordinates',
        error,
      );
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  }
}

// Singleton
export const LocationService = new LocationServiceClass();
export default LocationService;
