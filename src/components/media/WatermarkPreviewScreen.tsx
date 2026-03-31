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
import { LocationService } from '../../services/LocationService';

type PreviewLocation = {
  lat: number;
  lng: number;
  alt: number;
  spd: number;
  accuracy?: number;
  timestamp?: string;
  heading?: number;
};

type TaskMeta = {
  caseId?: string;
  taskNumber?: string;
  customerName?: string;
  clientName?: string;
  productName?: string;
  verificationType?: string;
};

const resolveLocation = (highAccuracy: boolean, timeout: number, maxAge: number): Promise<PreviewLocation | null> =>
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
          heading: pos.coords.heading || undefined,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAge },
    );
  });

const formatDMS = (decimal: number, isLat: boolean): string => {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = ((minFull - min) * 60).toFixed(1);
  const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  return `${deg}\u00B0${min}'${sec}"${dir}`;
};

const getCompassDirection = (heading?: number): string => {
  if (heading == null || isNaN(heading)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(heading / 45) % 8;
  return `${dirs[idx]} ${Math.round(heading)}\u00B0`;
};

export const WatermarkPreviewScreen = ({ route, navigation }: any) => {
  const { photoPath, taskId, componentType, taskMeta } = route.params;
  const meta: TaskMeta = taskMeta || {};
  const viewShotRef = useRef<ViewShot>(null);
  const insets = useSafeAreaInsets();

  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [location, setLocation] = useState<PreviewLocation | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        actionOverlay: {
          top: Math.max(insets.top, 16),
        },
      }),
    [insets.top],
  );

  useEffect(() => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    setDateStr(`${day} ${month} ${year}`);
    setTimeStr(`${hours}:${mins}:${secs}`);
    setTimestamp(`${day} ${month} ${year}  ${hours}:${mins}:${secs}`);

    let active = true;
    const loadLocation = async () => {
      setIsLocating(true);

      const fast = await resolveLocation(false, 3500, 30000);
      if (!active) return;
      if (fast) setLocation(fast);

      const precise = await resolveLocation(true, 10000, 5000);
      if (!active) return;
      if (precise) {
        setLocation(precise);
      }
      setIsLocating(false);

      // Reverse geocode the best available location
      const bestLoc = precise || fast;
      if (bestLoc && active) {
        LocationService.getAddressFromCoordinates(bestLoc.lat, bestLoc.lng)
          .then(addr => { if (active) setAddress(addr); })
          .catch(() => {});
      }
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

        {/* ── Bottom Watermark Strip ── */}
        <View style={styles.watermarkStrip}>
          {/* Left: GPS Coordinates Card */}
          <View style={styles.gpsCard}>
            <View style={styles.gpsIconRow}>
              <Icon name="navigate" size={14} color="#22d3ee" />
              <Text style={styles.gpsLabel}>GPS LOCATION</Text>
            </View>
            {location ? (
              <>
                <Text style={styles.gpsCoordDMS}>{formatDMS(location.lat, true)}</Text>
                <Text style={styles.gpsCoordDMS}>{formatDMS(location.lng, false)}</Text>
                <Text style={styles.gpsDecimal}>
                  {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </Text>
                {location.accuracy != null && (
                  <Text style={styles.gpsAccuracy}>{`\u00B1${location.accuracy.toFixed(0)}m`}</Text>
                )}
              </>
            ) : (
              <Text style={styles.gpsLocating}>
                {isLocating ? 'Locating...' : 'No GPS'}
              </Text>
            )}
          </View>

          {/* Right: Data Stack */}
          <View style={styles.dataStack}>
            {/* Row 1: Date & Time */}
            <View style={styles.dataRow}>
              <Icon name="calendar-outline" size={11} color="#94a3b8" />
              <Text style={styles.dataLabel}>{dateStr}</Text>
              <Icon name="time-outline" size={11} color="#94a3b8" style={{ marginLeft: 8 }} />
              <Text style={styles.dataLabel}>{timeStr}</Text>
            </View>

            {/* Row 2: Address */}
            {address ? (
              <View style={styles.dataRow}>
                <Icon name="location-outline" size={11} color="#f59e0b" />
                <Text style={styles.addressText} numberOfLines={2}>
                  {address}
                </Text>
              </View>
            ) : isLocating ? null : null}

            {/* Row 3: Task Info */}
            {(meta.taskNumber || meta.caseId) && (
              <View style={styles.dataRow}>
                <Icon name="document-text-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataValue} numberOfLines={1}>
                  {meta.taskNumber || `Case #${meta.caseId}`}
                </Text>
              </View>
            )}

            {/* Row 3: Client & Product */}
            {(meta.clientName || meta.productName) && (
              <View style={styles.dataRow}>
                <Icon name="business-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataValue} numberOfLines={1}>
                  {[meta.clientName, meta.productName].filter(Boolean).join(' \u2022 ')}
                </Text>
              </View>
            )}

            {/* Row 4: Customer Name */}
            {meta.customerName && (
              <View style={styles.dataRow}>
                <Icon name="person-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataValue} numberOfLines={1}>
                  {meta.customerName}
                </Text>
              </View>
            )}

            {/* Row 5: Verification Type */}
            {meta.verificationType && (
              <View style={styles.dataRow}>
                <Icon name="shield-checkmark-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataValue} numberOfLines={1}>
                  {meta.verificationType}
                </Text>
              </View>
            )}

            {/* Row 6: Altitude / Speed / Compass */}
            {location && (
              <View style={styles.dataRow}>
                <Icon name="trending-up-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataLabel}>
                  {`Alt: ${location.alt.toFixed(0)}m`}
                  {location.spd > 0 ? `  Spd: ${(location.spd * 3.6).toFixed(0)}km/h` : ''}
                  {location.heading != null ? `  ${getCompassDirection(location.heading)}` : ''}
                </Text>
              </View>
            )}

            {/* Branding */}
            <View style={styles.brandRow}>
              <Text style={styles.brandText}>CRM Verification</Text>
              <View style={styles.brandDot} />
              <Text style={styles.brandText}>Geo-Tagged Evidence</Text>
            </View>
          </View>
        </View>
      </ViewShot>

      {/* ── Action Buttons ── */}
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

  /* ── Watermark Strip ── */
  watermarkStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },

  /* GPS Card (left) */
  gpsCard: {
    width: 110,
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.2)',
  },
  gpsIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gpsLabel: {
    color: '#22d3ee',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginLeft: 4,
  },
  gpsCoordDMS: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  gpsDecimal: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '500',
    marginTop: 2,
  },
  gpsAccuracy: {
    color: '#4ade80',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
  },
  gpsLocating: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },

  /* Data Stack (right) */
  dataStack: {
    flex: 1,
    justifyContent: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  dataLabel: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  dataValue: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
    flexShrink: 1,
  },
  addressText: {
    color: '#fde68a',
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 4,
    flexShrink: 1,
    lineHeight: 13,
  },

  /* Branding Row */
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  brandText: {
    color: '#64748b',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  brandDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#64748b',
    marginHorizontal: 5,
  },

  /* ── Action Buttons ── */
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
