import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import { useAuth } from '../../context/AuthContext';

export const ProfilePhotoCaptureScreen = ({ navigation }: any) => {
  const { updateProfilePhoto } = useAuth();
  const device = useCameraDevice('front');
  const camera = useRef<Camera>(null);
  const insets = useSafeAreaInsets();

  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);

  const format = useCameraFormat(device, [
    { photoResolution: { width: 1280, height: 720 } },
  ]);

  const requestPermissions = useCallback(async () => {
    setIsPreparing(true);
    try {
      const cameraPermission = await Camera.requestCameraPermission();
      setHasPermission(cameraPermission === 'granted');
      if (cameraPermission !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Camera permission is required to take a profile photo.',
        );
        navigation.goBack();
      }
    } finally {
      setIsPreparing(false);
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      requestPermissions();
      setIsActive(true);
      return () => setIsActive(false);
    }, [requestPermissions]),
  );

  const handleCapture = async () => {
    if (!camera.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const photo = await camera.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
        qualityPrioritization: 'speed',
      } as any);

      const sourcePath = photo.path.startsWith('file://')
        ? photo.path.replace('file://', '')
        : photo.path;
      const profileDir = `${RNFS.DocumentDirectoryPath}/profile`;
      await RNFS.mkdir(profileDir);
      const filename = `profile_${Date.now()}.jpg`;
      const destPath = `${profileDir}/${filename}`;

      if (await RNFS.exists(sourcePath)) {
        try {
          await RNFS.moveFile(sourcePath, destPath);
        } catch {
          await RNFS.copyFile(sourcePath, destPath);
          await RNFS.unlink(sourcePath);
        }
      }

      await updateProfilePhoto(`file://${destPath}`);
      navigation.goBack();
    } catch (err: unknown) {
      Alert.alert(
        'Capture Error',
        err instanceof Error
          ? err.message
          : String(err) || 'Failed to capture photo.',
      );
    } finally {
      setIsCapturing(false);
    }
  };

  if (!hasPermission || !device || isPreparing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Preparing camera...</Text>
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
      />

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
              <Text style={styles.captureModeText}>Profile Photo</Text>
            </View>
            <Text style={styles.taskHintText}>
              Center your face and tap capture
            </Text>
          </View>
          <View style={styles.topSpacer} />
        </View>

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
            {isCapturing ? 'Saving...' : 'Tap to capture'}
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
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'white',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  capturingState: {
    backgroundColor: '#94a3b8',
  },
  captureHint: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
});
