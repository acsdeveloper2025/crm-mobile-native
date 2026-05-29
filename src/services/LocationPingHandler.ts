// LocationPingHandler — 2026-05-13
//
// Responds to admin-triggered FCM data-messages of type
// `LOCATION_REQUEST`. The flow:
//
//   Admin clicks 🔄 on CRM-FRONTEND /user-management/field-monitoring
//     ↓
//   BE POST /api/field-monitoring/users/:id/request-location
//     ↓
//   BE sends silent FCM data-message: { type: 'LOCATION_REQUEST', requestId, ... }
//     ↓
//   Mobile FCM handler (this module) reads requestId + fetches current GPS
//     ↓
//   Mobile POSTs /api/mobile/location/capture with:
//     { source: 'ADMIN_PING', latitude, longitude, accuracy, timestamp }
//     plus header Idempotency-Key: <requestId>
//     ↓
//   BE INSERTs row + emits `field-monitoring:location-updated` over WS
//     ↓
//   Admin's FE patches the map marker — total RTT ~3-10s
//
// Reusable from BOTH the foreground onMessage handler (in
// NotificationService) AND the setBackgroundMessageHandler registered
// at boot (in index.js).

import { LocationService, RELAXED_FIX_MAX_AGE_MS } from './LocationService';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { Logger } from '../utils/logger';

const TAG = 'LocationPingHandler';

export interface LocationRequestData {
  type?: string;
  requestId?: string;
  requestedBy?: string;
  requestedAt?: string;
}

/**
 * Returns true if the FCM data payload is an admin location-request.
 * Use this as a branch guard before forwarding to handleLocationRequest.
 */
export const isLocationRequestPayload = (
  data: Record<string, unknown> | undefined | null,
): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  return data.type === 'LOCATION_REQUEST';
};

/**
 * Handle a single LOCATION_REQUEST: fetch current GPS + POST to BE with
 * source='ADMIN_PING'. Idempotent via requestId — if the admin spams
 * the button BE will dedupe via the `operation_id` unique index on the
 * `locations` table.
 *
 * Silent on the agent side — no UI, no toast, no notification. The
 * mobile-baked telemetry log line is the only on-device trace.
 *
 * Fails gracefully when:
 * - GPS permission not granted → log + return
 * - LocationService returns null (timeout / no fix) → log + return
 * - BE POST fails → log + return (BE flow will fall back to "last known"
 *   on the admin's map after the FE-side 20s timeout)
 */
export const handleLocationRequest = async (
  data: LocationRequestData,
): Promise<void> => {
  const requestId = data.requestId;
  if (!requestId) {
    Logger.warn(TAG, 'LOCATION_REQUEST missing requestId; dropping');
    return;
  }

  let location;
  try {
    // Admin Refresh is "where is the agent", not task-presence proof —
    // accept a fix up to 5 min old so a stationary / indoor agent still
    // resolves instead of returning "couldn't reach".
    location = await LocationService.getCurrentLocation(RELAXED_FIX_MAX_AGE_MS);
  } catch (err) {
    Logger.warn(TAG, 'LocationService.getCurrentLocation threw', err);
    return;
  }

  if (!location) {
    Logger.info(TAG, `LOCATION_REQUEST ${requestId}: no fix available`, {
      requestedBy: data.requestedBy,
    });
    return;
  }

  try {
    await ApiClient.post(
      ENDPOINTS.LOCATION.CAPTURE,
      {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        source: 'ADMIN_PING',
        requestedBy: data.requestedBy,
      },
      {
        headers: { 'Idempotency-Key': requestId },
      },
    );
    Logger.info(TAG, `LOCATION_REQUEST ${requestId}: captured + uploaded`, {
      accuracy: location.accuracy,
      requestedBy: data.requestedBy,
    });
  } catch (err) {
    Logger.warn(TAG, `LOCATION_REQUEST ${requestId}: upload failed`, err);
  }
};
