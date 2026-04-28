/**
 * @format
 */

// 2026-04-27 deep-audit fix (D4): capture boot-start timestamp BEFORE any
// other module loads so the splash → interactive metric reflects total
// time from JS bundle entry to first render. App.tsx reads this when
// isInitializing flips to false and ships the delta via MobileTelemetry.
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

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('BackgroundSyncTask', () => async () => {
  await BackgroundSyncDaemon.runHeadlessTask();
});
