import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';

export const CameraCaptureScreen = ({ route, navigation }: any) => {
  const { taskId, componentType } = route.params;
  const device = useCameraDevice(componentType === 'selfie' ? 'front' : 'back');
  const camera = useRef<Camera>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Setup simple format for standard photos (approx 1080p to fit under 2MB limit easily)
  const format = useCameraFormat(device, [
    { photoResolution: { width: 1920, height: 1080 } }
  ]);

  const requestPermissions = useCallback(async () => {
    const cameraPermission = await Camera.requestCameraPermission();
    setHasPermission(cameraPermission === 'granted');
    if (cameraPermission !== 'granted') {
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
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      requestPermissions();
      setIsActive(true);
      return () => {
        setIsActive(false);
      };
    }, [requestPermissions])
  );

  const handleCapture = async () => {
    if (!camera.current || isCapturing) return;

    try {
      setIsCapturing(true);
      
      const photo = await camera.current.takePhoto({
        flash: 'off',
        enableShutterSound: true,
      });

      // Redirect to Watermark compositor instead of immediately saving
      navigation.navigate('WatermarkPreview', { 
        photoPath: photo.path, 
        taskId, 
        componentType 
      });
    } catch (err: any) {
      Alert.alert('Capture Error', err.message || 'Failed to capture photo.');
    } finally {
      setIsCapturing(false);
    }
  };

  if (!hasPermission || !device) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Initializing Camera...</Text>
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
      
      {/* Controls Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Icon name="close" size={32} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity 
            style={styles.captureButtonOuter} 
            onPress={handleCapture}
            disabled={isCapturing}>
            <View style={[styles.captureButtonInner, isCapturing && styles.capturingState]} />
          </TouchableOpacity>
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
    padding: 20,
    paddingTop: 60, // Safe area approx
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  iconButton: {
    padding: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
  },
  capturingState: {
    backgroundColor: '#D1D5DB', // gray-300
    transform: [{ scale: 0.9 }],
  }
});
