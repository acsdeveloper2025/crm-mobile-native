import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Platform,
  AppState,
  Linking,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';
import Geolocation from '@react-native-community/geolocation';
import { useFocusEffect } from '@react-navigation/native';
import { CameraService } from '../../services/CameraService';
import { Logger } from '../../utils/logger';

const TAG = 'CameraCaptureScreen';

// Warm GPS fix kept current while the agent frames the shot, so the
// shutter tap attaches a location instantly (no wait, no second screen).
// We track the tightest-accuracy fix seen since the screen opened.
type WarmFix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
};

export const CameraCaptureScreen = ({ route, navigation }: any) => {
  const { taskId, componentType } = route.params || {};
  const device = useCameraDevice(componentType === 'selfie' ? 'front' : 'back');
  const camera = useRef<Camera>(null);
  // B4 (audit 2026-04-21 round 2): AppState listener reads the latest
  // permission state via this ref rather than a state variable that
  // would be stale in the closure captured at focus time.
  const hasPermissionRef = useRef<boolean>(false);
  // Warm GPS fix + its best-seen accuracy, refreshed by a watchPosition
  // that runs for as long as the camera screen is focused. Read at the
  // moment of capture so Save is instant.
  const warmFixRef = useRef<WarmFix | null>(null);
  const warmAccuracyRef = useRef<number>(Infinity);
  const gpsWatchIdRef = useRef<number | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // 2026-05-31: capture at 1080p class so doorplates / documents stay
  // readable. CameraService downscales to a 1920 long-edge bound (aspect
  // preserved) — it can't upscale, so the capture format must be ≥ that.
  const format = useCameraFormat(device, [
    { photoResolution: { width: 1920, height: 1080 } },
  ]);

  // Keep the tightest-accuracy GPS fix current while framing the shot.
  const startWarmGpsWatch = useCallback(() => {
    if (gpsWatchIdRef.current != null) {
      return;
    }
    warmAccuracyRef.current = Infinity;
    gpsWatchIdRef.current = Geolocation.watchPosition(
      pos => {
        const accuracy = pos.coords.accuracy || Infinity;
        // Keep the best fix; ignore looser updates so accuracy only improves.
        if (accuracy <= warmAccuracyRef.current) {
          warmAccuracyRef.current = accuracy;
          warmFixRef.current = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy,
            altitude: pos.coords.altitude ?? undefined,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            timestamp: new Date(pos.timestamp).toISOString(),
          };
        }
        setGpsWarning(prev => (prev ? null : prev));
      },
      () => {
        // Individual watch errors are non-fatal — the watch keeps trying
        // and savePhoto's own fallback covers the never-got-a-fix case.
      },
      { enableHighAccuracy: true, distanceFilter: 0, interval: 1000 },
    );
  }, []);

  const stopWarmGpsWatch = useCallback(() => {
    if (gpsWatchIdRef.current != null) {
      Geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    setIsPreparing(true);
    // Deactivate camera while requesting permissions — VisionCamera on real
    // Android devices silently fails if isActive=true before permission grant.
    setIsActive(false);
    try {
      // Bug 137 sibling: defer the system permission dialog until the
      // navigation transition + any pending JS-driven animations settle.
      // Without this, the Activity's input-event dispatcher can race with
      // the view-teardown happening during the screen mount, causing an
      // uncaught `ViewGroup.dispatchCancelPendingInputEvents(null)` NPE
      // bubbling out of Camera.requestCameraPermission() and crashing
      // the requestPermissions try/catch into the error path. The system
      // dialog is wholly safe to show after interactions complete.
      await new Promise<void>(resolve =>
        InteractionManager.runAfterInteractions(() => resolve()),
      );
      const cameraPermission = await Camera.requestCameraPermission();
      const granted = cameraPermission === 'granted';
      setHasPermission(granted);
      hasPermissionRef.current = granted;
      Logger.info(TAG, `Camera permission: ${cameraPermission}`);

      if (!granted) {
        // 2026-04-27 deep-audit fix (D16): if user has tapped "Don't ask
        // again", future requestCameraPermission() returns 'denied' without
        // re-prompting the user. Without a Settings deep-link the agent
        // is stuck in a dead-end (kicked back to TaskDetail with no way
        // forward). Two-button alert lets them open OS settings to flip
        // the permission. Cancel still goes back as before.
        Alert.alert(
          'Camera permission needed',
          'Camera access is required to take photos for verification. Please enable it in Settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch((e: unknown) => {
                  Logger.warn(TAG, 'Linking.openSettings failed', e);
                });
                navigation.goBack();
              },
            },
          ],
        );
        return;
      }

      // Request location permission, then start a warm GPS watch so a
      // fix is ready the instant the agent taps the shutter (no second
      // screen, no waiting). GPS is still mandatory at save time —
      // CameraService.savePhoto re-checks and throws GPS_REQUIRED if
      // neither the warm fix nor its own fallback yields a location.
      const { LocationService } = require('../../services/LocationService');
      LocationService.requestPermissions()
        .then((locationGranted: boolean) => {
          if (!locationGranted) {
            setGpsWarning('GPS unavailable — enable location to save photos');
            return;
          }
          startWarmGpsWatch();
        })
        .catch((err: unknown) => {
          // H15 (audit 2026-04-21): was .catch(() => {}) — silent.
          // Log so a hard permission-request failure (hardware denied,
          // OS error) surfaces in telemetry.
          Logger.warn(
            'CameraCaptureScreen',
            'Location permission request failed',
            err,
          );
        });

      // Activate camera ONLY after permission is confirmed.
      // On real devices, a small delay lets the native camera HAL initialize.
      if (Platform.OS === 'android') {
        await new Promise<void>(resolve => setTimeout(resolve, 300));
      }
      setIsActive(true);
    } catch (err) {
      Logger.error(TAG, 'Permission request failed', err);
      Alert.alert('Error', 'Failed to initialize camera. Please try again.');
      navigation.goBack();
    } finally {
      setIsPreparing(false);
    }
  }, [navigation, startWarmGpsWatch]);

  useFocusEffect(
    useCallback(() => {
      requestPermissions();

      // Handle app going to background/foreground — camera must deactivate
      // when app is backgrounded to release the hardware resource on real devices.
      const subscription = AppState.addEventListener('change', nextState => {
        // B4 (audit 2026-04-21 round 2): read permission state from the
        // ref so the listener sees the latest value, not whatever was
        // captured at focus time (which was always false on the first
        // post-grant background/foreground cycle).
        if (nextState === 'active' && hasPermissionRef.current) {
          setIsActive(true);
        } else if (nextState === 'background' || nextState === 'inactive') {
          setIsActive(false);
        }
      });

      return () => {
        setIsActive(false);
        stopWarmGpsWatch();
        subscription.remove();
      };
    }, [requestPermissions, stopWarmGpsWatch]),
  );

  const handleCapture = async () => {
    if (!camera.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // 2026-05-31: capture at full resolution, no speed-cap. The photo is
      // saved RAW (CameraService normalizes orientation + downscales to
      // ~1080p preserving aspect) — the web overlays metadata at view time.
      const photo = await camera.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
        qualityPrioritization: 'balanced',
      } as any);

      // Attach the warm GPS fix captured while framing — instant, no wait.
      // savePhoto still enforces GPS-mandatory (throws GPS_REQUIRED if the
      // warm fix is absent AND its own fallback fetch yields nothing).
      const warm = warmFixRef.current;
      const saved = await CameraService.savePhoto(
        photo.path,
        taskId,
        componentType === 'selfie' ? 'selfie' : 'photo',
        {
          // Phase 3: pass the capture's pixel dims so savePhoto can skip the
          // downscale when the photo is already within the size bound.
          captureWidth: photo.width,
          captureHeight: photo.height,
          ...(warm
            ? {
                locationOverride: {
                  latitude: warm.latitude,
                  longitude: warm.longitude,
                  accuracy: warm.accuracy,
                  altitude: warm.altitude,
                  speed: warm.speed,
                  heading: warm.heading,
                  timestamp: warm.timestamp,
                },
              }
            : {}),
        },
      );

      if (!saved) {
        throw new Error(
          'Could not save the photo. Make sure GPS is on and you are in an area with signal, then try again.',
        );
      }

      // Return to the form; PhotoGallery reloads via its useFocusEffect.
      navigation.goBack();
    } catch (err: unknown) {
      Alert.alert(
        'Capture Error',
        (err instanceof Error ? err.message : String(err)) ||
          'Failed to capture photo.',
      );
      setIsCapturing(false);
    }
  };

  if (!device) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="camera-outline" size={48} color="#9CA3AF" />
        <Text style={styles.loadingText}>
          No camera available on this device.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.goBackButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hasPermission || isPreparing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>
          {!hasPermission
            ? 'Requesting camera permission...'
            : 'Preparing camera...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {gpsWarning && (
        <View style={[styles.gpsWarningBanner, { top: insets.top + 8 }]}>
          <Icon name="location-outline" size={16} color="#78350F" />
          <Text style={styles.gpsWarningText}>{gpsWarning}</Text>
        </View>
      )}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        format={format}
        // Native pinch-to-zoom on the preview (no extra deps; vision-camera v4
        // ships this in-engine — works as long as a CameraDevice is mounted).
        enableZoomGesture={true}
        // Capture in whatever orientation the device is held in. Default
        // ('portrait') was clipping landscape shots because the photo
        // buffer stayed portrait-locked even when the device was rotated.
        outputOrientation="device"
        onError={error => {
          Logger.error(TAG, 'Camera runtime error', error);
          Alert.alert(
            'Camera Error',
            `Camera encountered an error: ${error.message}. Please close and try again.`,
          );
        }}
        onInitialized={() => {
          Logger.info(TAG, 'Camera initialized successfully on device');
        }}
      />

      {/* Controls Overlay */}
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
          >
            <Icon name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.topInfoWrap}>
            <View style={styles.captureModeBadge}>
              <Text style={styles.captureModeText}>
                {componentType === 'selfie'
                  ? 'Selfie Capture'
                  : 'Photo Capture'}
              </Text>
            </View>
            <Text style={styles.taskHintText}>
              Task: {String(taskId).slice(0, 8)}
            </Text>
          </View>
          <View style={styles.topSpacer} />
        </View>

        {isCapturing ? (
          <View style={styles.capturingOverlay}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.capturingText}>Processing image...</Text>
          </View>
        ) : null}

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.captureButtonOuter,
              isCapturing && styles.captureButtonDisabled,
            ]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <View
              style={[
                styles.captureButtonInner,
                isCapturing && styles.capturingState,
              ]}
            />
          </TouchableOpacity>
          <Text style={styles.captureHint}>
            {isCapturing
              ? 'Saving...'
              : componentType === 'selfie'
              ? 'Tap to capture selfie'
              : 'Tap to capture photo'}
          </Text>
          <Text style={styles.captureHintSub}>
            Photo saves with GPS automatically
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  loadingText: {
    color: 'white',
    marginTop: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topInfoWrap: {
    alignItems: 'center',
    gap: 6,
  },
  topSpacer: {
    width: 42,
    height: 42,
  },
  bottomBar: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 12,
  },
  captureModeBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  captureModeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  taskHintText: {
    color: '#d1d5db',
    fontSize: 11,
    fontWeight: '600',
  },
  captureButtonOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureButtonInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'white',
  },
  capturingState: {
    backgroundColor: '#cbd5e1',
    transform: [{ scale: 0.9 }],
  },
  captureHint: {
    marginTop: 12,
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  captureHintSub: {
    marginTop: 5,
    color: '#d1d5db',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  capturingOverlay: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginTop: 18,
    gap: 8,
  },
  capturingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  goBackButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  goBackButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  gpsWarningBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(234, 179, 8, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsWarningText: {
    color: '#78350F',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
