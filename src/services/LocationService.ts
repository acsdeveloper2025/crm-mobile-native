// LocationService - Cross-platform GPS location tracking
// Uses @react-native-community/geolocation for both iOS and Android

import Geolocation, {
  GeolocationResponse,
  GeolocationError,
} from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/DatabaseService';
import { SyncQueue, SYNC_PRIORITY } from './SyncQueue';
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

class LocationServiceClass {
  private watchId: number | null = null;

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
    await DatabaseService.execute(
      `INSERT INTO locations (id, latitude, longitude, accuracy, timestamp, source, task_id, activity_type, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        location.latitude,
        location.longitude,
        location.accuracy,
        location.timestamp,
        location.source,
        taskId || null,
        activityType || null,
      ],
    );

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

    await SyncQueue.enqueue(
      'CREATE',
      'LOCATION',
      id,
      payload as unknown as Record<string, unknown>,
      SYNC_PRIORITY.CRITICAL,
    );

    return location;
  }

  /**
   * Start continuous location tracking (for location trail)
   */
  startTracking(intervalMs: number = 30000): void {
    if (this.watchId !== null) {
      Logger.warn(TAG, 'Already tracking');
      return;
    }

    this.watchId = Geolocation.watchPosition(
      (position: GeolocationResponse) => {
        const location: LocationResult = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          timestamp: new Date(position.timestamp).toISOString(),
          source: 'GPS',
        };

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
        distanceFilter: 50, // Minimum 50 meters between updates
        interval: intervalMs,
        fastestInterval: intervalMs / 2,
      },
    );

    Logger.info(TAG, 'Location tracking started');
  }

  /**
   * Stop continuous location tracking
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
      Logger.info(TAG, 'Location tracking stopped');
    }
  }

  /**
   * Record a location directly (no permission check, used by watcher)
   */
  private async recordLocationDirect(location: LocationResult): Promise<void> {
    const id = uuidv4();

    await DatabaseService.execute(
      `INSERT INTO locations (id, latitude, longitude, accuracy, timestamp, source, activity_type, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, 'TRAVEL', 'PENDING')`,
      [id, location.latitude, location.longitude, location.accuracy, location.timestamp, location.source],
    );

    await SyncQueue.enqueue(
      'CREATE',
      'LOCATION',
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
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const toRadians = (deg: number) => deg * (Math.PI / 180);
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in meters
  }

  /**
   * Mock reverse geocoding for now.
   * Can be wired up to a real map API like Google Maps later if needed.
   */
  async getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
    // A real app would call a reverse geocoding API here.
    return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
  }
}

// Singleton
export const LocationService = new LocationServiceClass();
export default LocationService;
