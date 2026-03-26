import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import { CameraService } from '../../services/CameraService';

type PreviewLocation = {
  lat: number;
  lng: number;
  alt: number;
  spd: number;
  accuracy?: number;
  timestamp?: string;
};

const resolveFastLocation = (): Promise<PreviewLocation | null> =>
  new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude || 0,
          spd: pos.coords.speed || 0,
          accuracy: pos.coords.accuracy || 0,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 3500,
        maximumAge: 120000,
      },
    );
  });

const resolveHighAccuracyLocation = (): Promise<PreviewLocation | null> =>
  new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude || 0,
          spd: pos.coords.speed || 0,
          accuracy: pos.coords.accuracy || 0,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 6500,
        maximumAge: 30000,
      },
    );
  });

export const WatermarkPreviewScreen = ({ route, navigation }: any) => {
  const { photoPath, taskId, componentType } = route.params;
  const viewShotRef = useRef<ViewShot>(null);
  const insets = useSafeAreaInsets();

  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [location, setLocation] = useState<PreviewLocation | null>(null);
  const [timestamp, setTimestamp] = useState('');

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        watermarkBase: {
          bottom: Math.max(insets.bottom, 16),
        },
        actionOverlay: {
          top: Math.max(insets.top, 16),
        },
      }),
    [insets.bottom, insets.top],
  );

  useEffect(() => {
    const now = new Date();
    const formattedDate = `${now.getDate()} ${now.toLocaleString('default', { month: 'short' })} ${now.getFullYear()} ${now.toLocaleTimeString()}`;
    setTimestamp(formattedDate);

    let active = true;
    const loadLocation = async () => {
      setIsLocating(true);

      const fast = await resolveFastLocation();
      if (!active) {
        return;
      }
      if (fast) {
        setLocation(fast);
        setIsLocating(false);
        return;
      }

      const precise = await resolveHighAccuracyLocation();
      if (!active) {
        return;
      }
      if (precise) {
        setLocation(precise);
      }
      setIsLocating(false);
    };

    loadLocation();

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.85,
      });

      const cleanPath = uri.replace('file://', '');
      const savedPhoto = await CameraService.savePhoto(cleanPath, taskId, componentType, {
        locationOverride: location
          ? {
              latitude: location.lat,
              longitude: location.lng,
              accuracy: location.accuracy,
              timestamp: location.timestamp,
            }
          : null,
      });

      if (savedPhoto) {
        if (photoPath !== cleanPath && await RNFS.exists(photoPath)) {
          await RNFS.unlink(photoPath);
        }
        navigation.pop(2);
      } else {
        throw new Error('Database insertion failed.');
      }
    } catch (e: unknown) {
      Alert.alert('Save Error', (e instanceof Error ? e.message : String(e)) || 'Failed to capture watermark');
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ViewShot ref={viewShotRef} style={styles.viewShotContainer} options={{ format: 'jpg', quality: 0.85 }}>
        <Image source={{ uri: `file://${photoPath}` }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

        <View style={[styles.watermarkBase, dynamicStyles.watermarkBase]}>
          <View style={styles.watermarkRow}>
            <View style={styles.geoCard}>
              <Icon name="location-outline" size={20} color="#ffffff" />
              <Text style={styles.geoCardTitle}>Geo-tagged Evidence</Text>
              <Text style={styles.geoCardValue}>
                {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Locating'}
              </Text>
            </View>

            <View style={styles.dataContainer}>
              <Text style={styles.dataTextLarge}>{timestamp}</Text>
              {location ? (
                <>
                  <Text style={styles.dataTextSmall}>{location.lat.toFixed(6)}N {location.lng.toFixed(6)}E</Text>
                  <Text style={styles.dataTextSmall}>CRM Core Execution</Text>
                  <Text style={styles.dataTextSmall}>Altitude: {location.alt.toFixed(1)}m</Text>
                  <Text style={styles.dataTextSmall}>Speed: {(location.spd * 3.6).toFixed(1)}km/h</Text>
                </>
              ) : (
                <Text style={styles.dataTextSmall}>
                  {isLocating ? 'Getting GPS coordinates...' : 'GPS unavailable - image will still be saved.'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </ViewShot>

      <View style={[styles.actionOverlay, dynamicStyles.actionOverlay]}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Icon name="close" size={22} color="white" />
          <Text style={styles.btnText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Icon name="checkmark" size={22} color="white" />
              <Text style={styles.btnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomHintWrap, { bottom: Math.max(insets.bottom, 12) }]}>
        <Text style={styles.bottomHintText}>
          {isSaving
            ? 'Saving photo and returning...'
            : isLocating
              ? 'Preview ready. GPS is being fetched in background.'
              : 'Review and save to continue.'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  viewShotContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  watermarkBase: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 8,
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  geoCard: {
    width: 108,
    minHeight: 108,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.82)',
    padding: 10,
    justifyContent: 'space-between',
  },
  geoCardTitle: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  geoCardValue: {
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
  },
  dataContainer: {
    flex: 1,
    marginLeft: 10,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
    padding: 8,
    borderRadius: 8,
  },
  dataTextLarge: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  dataTextSmall: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
    textAlign: 'right',
  },
  actionOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 92,
    justifyContent: 'center',
  },
  btnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 4,
  },
  bottomHintWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  bottomHintText: {
    color: 'white',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '500',
  },
});
