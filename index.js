/**
 * @format
 */

// 2026-04-27 deep-audit fix (D4): capture boot-start timestamp BEFORE any
// other module loads so the splash → interactive metric reflects total
// time from JS bundle entry to first render. App.tsx reads this when
// isInitializing flips to false and ships the delta via MobileTelemetry.
// eslint-disable-next-line no-undef
globalThis.__APP_BOOT_STARTED_AT = Date.now();

import 'react-native-get-random-values';
// Install the UPPERCASE wrappers on react-native's `Text` and `TextInput`
// exports BEFORE any screen module is loaded by `import App`. The patch
// self-runs at module load; importing for side effect only.
import './src/utils/installUppercaseDefaults';
// Route geolocation through Google Play Services' fused provider. Without
// this the library defaults to LocationManager + GPS-only, which never
// fires `watchPosition` updates indoors / on cold start / when the GPS
// chip is asleep — leaving the WatermarkPreviewScreen stuck on
// "ACQUIRING GPS..." for the full 10s tier ladder. Side-effect import.
import './src/utils/installGeolocationConfig';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { BackgroundSyncDaemon } from './src/sync/BackgroundSyncDaemon';

// 2026-05-13: register a background FCM handler so silent
// `LOCATION_REQUEST` data-messages from BE (admin-triggered ping on
// /user-management/field-monitoring) wake the app, capture GPS, and
// upload — even when screen is off / app is backgrounded. Must be
// registered at module-load (before AppRegistry.registerComponent) per
// @react-native-firebase/messaging contract; otherwise the handler is
// not invoked for cold-start deliveries.
//
// Non-LOCATION_REQUEST data-messages flow through the foreground
// onMessage handler in NotificationService (when app is in foreground)
// or through the system tray (when app is backgrounded with a
// notification block). The background handler below is intentionally
// scoped to LOCATION_REQUEST only.
import messaging from '@react-native-firebase/messaging';
import {
  handleLocationRequest,
  isLocationRequestPayload,
} from './src/services/LocationPingHandler';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    const data = remoteMessage?.data;
    if (isLocationRequestPayload(data)) {
      await handleLocationRequest(data);
    }
  } catch (err) {
    // Background handler errors are swallowed silently; the BE flow
    // falls back to "last known" on the admin's map after the FE-side
    // 20s timeout. Don't crash the FCM service.
    console.warn('Background FCM handler error', err);
  }
});

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('BackgroundSyncTask', () => async () => {
  await BackgroundSyncDaemon.runHeadlessTask();
});
