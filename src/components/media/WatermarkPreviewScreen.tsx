import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image, ActivityIndicator, Alert } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import MapView, { Marker } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { CameraService } from '../../services/CameraService';
import Icon from 'react-native-vector-icons/Ionicons';

export const WatermarkPreviewScreen = ({ route, navigation }: any) => {
  const { photoPath, taskId, componentType } = route.params;
  const viewShotRef = useRef(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [location, setLocation] = useState<{lat: number; lng: number; alt: number; spd: number} | null>(null);
  const [timestamp, setTimestamp] = useState('');

  useEffect(() => {
    // 1. Get accurate time
    const now = new Date();
    // Native Date formatting string mapping
    const formattedDate = `${now.getDate()} ${now.toLocaleString('default', { month: 'short' })} ${now.getFullYear()} ${now.toLocaleTimeString()}`;
    setTimestamp(formattedDate);

    // 2. High-accuracy GPS logic
    Geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude || 0,
          spd: pos.coords.speed || 0,
        });
      },
      (err) => {
        console.warn('Geolocation Error on Watermark:', err);
        // Render 0 coordinates so block proceeds if sensor fails completely
        setLocation({ lat: 0, lng: 0, alt: 0, spd: 0 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // Capture the composited view
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.9,
      });
      
      // Save flattened image into local SQLite as usual via CameraService
      const cleanPath = uri.replace('file://', '');
      const savedPhoto = await CameraService.savePhoto(cleanPath, taskId, componentType);
      
      if (savedPhoto) {
        // Pop the Camera UI stack (Watermark -> Camera -> Form)
        navigation.pop(2);
      } else {
        throw new Error('Database insertion failed.');
      }
    } catch (e: any) {
      Alert.alert('Save Error', e.message || 'Failed to capture watermark');
      setIsSaving(false);
    }
  };

  if (!location) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Acquiring High-Accuracy GPS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 🎯 ViewShot boundary */}
      <ViewShot ref={viewShotRef} style={styles.viewShotContainer} options={{ format: 'jpg', quality: 0.9 }}>
        {/* Raw Photo Background */}
        <Image 
          source={{ uri: `file://${photoPath}` }} 
          style={StyleSheet.absoluteFillObject} 
          resizeMode="cover" 
        />
        
        {/* Watermark Overlay pinned to bottom left exactly like User reference */}
        <View style={styles.watermarkBase}>
          
          <View style={styles.watermarkRow}>
            {/* 1. Mini map snippet */}
            <View style={styles.mapContainer}>
              <MapView 
                style={styles.map}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{
                  latitude: location.lat,
                  longitude: location.lng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}>
                <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} />
              </MapView>
            </View>
            
            {/* 2. Hard Data block over transparent black padding */}
            <View style={styles.dataContainer}>
              <Text style={styles.dataTextLarge}>{timestamp}</Text>
              <Text style={styles.dataTextSmall}>{location.lat.toFixed(6)}N {location.lng.toFixed(6)}E</Text>
              <Text style={styles.dataTextSmall}>CRM Core Execution</Text>
              <Text style={styles.dataTextSmall}>Altitude: {location.alt.toFixed(1)}m</Text>
              <Text style={styles.dataTextSmall}>Speed: {(location.spd * 3.6).toFixed(1)}km/h</Text>
            </View>
          </View>
        </View>
      </ViewShot>

      {/* Action constraints NOT captured in viewshot, overlaid on top */}
      <View style={styles.actionOverlay}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color="white" />
          <Text style={styles.btnText}>Retake</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="white" /> : (
            <>
              <Icon name="checkmark" size={24} color="white" />
              <Text style={styles.btnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
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
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 12,
  },
  viewShotContainer: {
    flex: 1, 
    backgroundColor: 'black'
  },
  watermarkBase: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 8,
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  mapContainer: {
    width: 130,
    height: 130,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'white',
    overflow: 'hidden',
    backgroundColor: '#CCC'
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  dataContainer: {
    flex: 1,
    marginLeft: 10,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 8,
    borderRadius: 8,
  },
  dataTextLarge: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  dataTextSmall: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
  },
  actionOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 4,
  }
});
