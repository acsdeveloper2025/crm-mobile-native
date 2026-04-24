import Geolocation from '@react-native-community/geolocation';
import { Logger } from './logger';

const TAG = 'GeolocationConfig';

// Route the cross-platform `@react-native-community/geolocation` calls
// through Google Play Services' `FusedLocationProviderClient` on Android.
//
// Why this matters:
//   The library's Android default uses the platform `LocationManager`
//   directly. With `enableHighAccuracy: true` (which both `getCurrentPosition`
//   and `watchPosition` set across this app), LocationManager listens to the
//   GPS provider only. On a device with no recent satellite lock — cold
//   start, indoors, GPS chip off, fresh app install — the GPS provider emits
//   ZERO updates and `watchPosition` never fires. The user's screen sits on
//   "ACQUIRING GPS..." through the entire tier ladder until the 10s hard
//   cap, at which point Save stays disabled because no fix was ever received.
//
//   The fused provider transparently blends GPS + network + wifi + sensors
//   and almost always returns SOMETHING within a second, even indoors.
//   Higher-accuracy fixes from the GPS chip continue to arrive afterwards
//   and replace the initial network-quality fix via the watcher's
//   "best-seen accuracy" logic.
//
// Call once, at module load (before any screen is mounted). Safe to call
// multiple times — the underlying native module is idempotent.
//
// `locationProvider: 'auto'` would let the library pick, but the default
// path is `android` (LocationManager), so we explicitly request playServices.

let installed = false;

export function installGeolocationConfig(): void {
  if (installed) {
    return;
  }
  installed = true;
  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: false,
      authorizationLevel: 'whenInUse',
      enableBackgroundLocationUpdates: false,
      locationProvider: 'playServices',
    });
    Logger.info(TAG, 'Geolocation provider set to playServices (fused)');
  } catch (error) {
    // setRNConfiguration throws on web (browser implementation). On native
    // platforms it should never throw — log and continue so a misbehaving
    // platform stub doesn't brick app boot.
    Logger.warn(
      TAG,
      'setRNConfiguration failed; falling back to library default provider',
      error,
    );
  }
}

// Self-install at module load. Importing this file once (with its side
// effects preserved) is enough — keep it the first geolocation-related
// import in index.js, before any screen module that might call
// `Geolocation.watchPosition` or `getCurrentPosition`.
installGeolocationConfig();
