import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Alert, Platform, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Logger } from '../../utils/logger';

const TAG = 'CameraCaptureScreen';

export const CameraCaptureScreen = ({ route, navigation }: { route: Record<string, unknown>; navigation: Record<string, unknown> }) => {
  const { taskId, componentType } = route.params;
  const device = useCameraDevice(componentType === 'selfie' ? 'front' : 'back');
  const camera = useRef<Camera>(null);

  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const insets = useSafeAreaInsets();

  // Use 720p for faster shutter + processing and predictable upload sizes.
  const format = useCameraFormat(device, [
    { photoResolution: { width: 1280, height: 720 } },
  ]);

  const requestPermissions = useCallback(async () => {
    setIsPreparing(true);
    // Deactivate camera while requesting permissions — VisionCamera on real
    // Android devices silently fails if isActive=true before permission grant.
    setIsActive(false);
    try {
      const cameraPermission = await Camera.requestCameraPermission();
      const granted = cameraPermission === 'granted';
      setHasPermission(granted);
      Logger.info(TAG, `Camera permission: ${cameraPermission}`);

      if (!granted) {
        Alert.alert('Permission needed', 'Camera permission is required to take photos.');
        navigation.goBack();
        return;
      }

      // Also request location so GPS coordinates are available for photo watermark
      const { LocationService } = require('../../services/LocationService');
      const locationGranted = await LocationService.requestPermissions();
      if (!locationGranted) {
        Alert.alert(
          'Location Recommended',
          'Location permission is recommended to geo-tag verification photos. Photos without location may be flagged.',
          [{ text: 'Continue Anyway' }]
        );
      }

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
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      requestPermissions();

      // Handle app going to background/foreground — camera must deactivate
      // when app is backgrounded to release the hardware resource on real devices.
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active' && hasPermission) {
          setIsActive(true);
        } else if (nextState === 'background' || nextState === 'inactive') {
          setIsActive(false);
        }
      });

      return () => {
        setIsActive(false);
        subscription.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestPermissions])
  );

  const handleCapture = async () => {
    if (!camera.current || isCapturing) return;

    try {
      setIsCapturing(true);
      
      const photo = await camera.current.takePhoto(
        {
          flash: 'off',
          enableShutterSound: false,
          qualityPrioritization: 'speed',
        } as any,
      );

      // Redirect to Watermark compositor instead of immediately saving
      navigation.navigate('WatermarkPreview', { 
        photoPath: photo.path, 
        taskId, 
        componentType 
      });
    } catch (err: unknown) {
      Alert.alert('Capture Error', (err instanceof Error ? err.message : String(err)) || 'Failed to capture photo.');
    } finally {
      setIsCapturing(false);
    }
  };

  if (!hasPermission || !device || isPreparing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>
          {!device ? 'No camera device found...' : 'Preparing camera...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        format={format}
        onError={(error) => {
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
        ]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.topInfoWrap}>
            <View style={styles.captureModeBadge}>
              <Text style={styles.captureModeText}>
                {componentType === 'selfie' ? 'Selfie Capture' : 'Photo Capture'}
              </Text>
            </View>
            <Text style={styles.taskHintText}>Task: {String(taskId).slice(0, 8)}</Text>
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
            style={[styles.captureButtonOuter, isCapturing && styles.captureButtonDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}>
            <View style={[styles.captureButtonInner, isCapturing && styles.capturingState]} />
          </TouchableOpacity>
          <Text style={styles.captureHint}>
            {isCapturing ? 'Saving...' : componentType === 'selfie' ? 'Tap to capture selfie' : 'Tap to capture photo'}
          </Text>
          <Text style={styles.captureHintSub}>Fast mode enabled for quicker capture</Text>
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
});
