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
import { CameraService } from '../../services/CameraService';
import { WatermarkReStampQueue } from '../../services/WatermarkReStampQueue';
import { PreserveCase } from '../ui/PreserveCase';

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

// Tiered GPS acquisition ladder (user directive 2026-04-21). Strict at
// first, relaxes over time. Save button enables at the first tier
// whose accuracy requirement is met by the best-seen fix at that
// elapsed time. Cold GPS can take up to 10s; warm GPS often enables at
// tier 1 in ≤ 2s. After acceptance the watcher keeps running until 10s
// and upgrades the stored fix whenever a tighter one arrives.
type GpsTier = { untilMs: number; maxAccuracyM: number; label: string };
const GPS_ACQUISITION_TIERS: GpsTier[] = [
  { untilMs: 2_000, maxAccuracyM: 10, label: 'Strict' },
  { untilMs: 5_000, maxAccuracyM: 20, label: 'Good' },
  { untilMs: 7_000, maxAccuracyM: 50, label: 'Decent' },
  { untilMs: 10_000, maxAccuracyM: Infinity, label: 'Any fix' },
];
const GPS_WATCH_CAP_MS =
  GPS_ACQUISITION_TIERS[GPS_ACQUISITION_TIERS.length - 1].untilMs;

const shouldAcceptFix = (bestAccuracyM: number, elapsedMs: number): boolean => {
  for (const tier of GPS_ACQUISITION_TIERS) {
    if (elapsedMs >= tier.untilMs && bestAccuracyM <= tier.maxAccuracyM) {
      return true;
    }
  }
  return false;
};

const formatDMS = (decimal: number, isLat: boolean): string => {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = ((minFull - min) * 60).toFixed(1);
  const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W';
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
  const [_timestamp, setTimestamp] = useState('');
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

    // Tiered GPS acquisition (2026-04-21 user directive).
    // watchPosition runs continuously; we track the tightest fix seen
    // so far and accept it at the earliest tier whose accuracy ceiling
    // it satisfies. After acceptance the watch keeps running until the
    // hard cap (10 s) so a tighter fix can still replace the accepted
    // one in the background. GPS is mandatory — if we never receive a
    // fix, `location` stays null and the Save button stays disabled.
    const startedAt = Date.now();
    let active = true;
    let bestFix: PreviewLocation | null = null;
    let bestAccuracy = Infinity;
    let accepted = false;
    setIsLocating(true);

    const evaluateAndMaybeAccept = () => {
      if (!active || !bestFix) return;
      const elapsed = Date.now() - startedAt;
      if (!accepted && shouldAcceptFix(bestAccuracy, elapsed)) {
        accepted = true;
        setLocation(bestFix);
        setIsLocating(false);
      } else if (accepted) {
        // Already accepted — keep upgrading displayed fix as better
        // ones arrive, up to the 10 s watch cap.
        setLocation(bestFix);
      }
    };

    const watchId = Geolocation.watchPosition(
      pos => {
        const accuracy = pos.coords.accuracy || Infinity;
        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy;
          bestFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            alt: pos.coords.altitude || 0,
            spd: pos.coords.speed || 0,
            accuracy,
            timestamp: new Date(pos.timestamp).toISOString(),
            heading: pos.coords.heading || undefined,
          };
          evaluateAndMaybeAccept();
        }
      },
      () => {
        // Individual error callbacks are ignored — the watch keeps
        // trying. The hard-cap timeout below handles the
        // never-got-a-fix outcome.
      },
      { enableHighAccuracy: true, distanceFilter: 0, interval: 500 },
    );

    // Fire a check at each tier boundary so we accept even when the
    // fix accuracy didn't change but the tier relaxed.
    const tierTimers = GPS_ACQUISITION_TIERS.map(tier =>
      setTimeout(evaluateAndMaybeAccept, tier.untilMs),
    );

    // Hard cap: stop watching + release Locating spinner. If
    // still no fix, Save stays disabled and the preview screen
    // will show the `location` null state.
    const capTimer = setTimeout(() => {
      if (!active) return;
      Geolocation.clearWatch(watchId);
      setIsLocating(false);
      // Last-ditch accept: tier 4 accepts anything, so this is
      // only reached if bestFix is still null (no fix ever received).
      if (!bestFix) {
        // Leave location null; Save remains disabled.
      }
    }, GPS_WATCH_CAP_MS + 100);

    return () => {
      active = false;
      Geolocation.clearWatch(watchId);
      tierTimers.forEach(clearTimeout);
      clearTimeout(capTimer);
    };
  }, []);

  const handleSave = async () => {
    // 2026-04-21: GPS is mandatory. The Save button is disabled until
    // `location` is populated, but re-check here as a safety net so no
    // race between state-update and the tap can ever save a GPS-less
    // photo.
    if (!location) {
      Alert.alert(
        'GPS required',
        'Waiting for a GPS fix. The photo cannot be saved without location.',
      );
      return;
    }

    try {
      setIsSaving(true);

      // Capture watermark INSTANTLY with whatever data is available right now
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.85,
      });

      const cleanPath = uri.replace('file://', '');
      const savedPhoto = await CameraService.savePhoto(
        cleanPath,
        taskId,
        componentType,
        {
          locationOverride: {
            latitude: location.lat,
            longitude: location.lng,
            accuracy: location.accuracy,
            timestamp: location.timestamp,
          },
        },
      );

      if (savedPhoto) {
        // 2026-04-21: GPS is guaranteed present here (checked above),
        // so always enqueue a background re-stamp. The re-stamper
        // grabs a fresh precise fix (enableHighAccuracy, 15s timeout)
        // and re-renders the watermark with tighter coords. Raw photo
        // is kept on disk for the re-stamp; the re-stamper cleans it
        // up on success.
        WatermarkReStampQueue.enqueue({
          attachmentId: savedPhoto.id,
          rawPhotoPath: photoPath, // Kept for re-stamp; cleaned by re-stamper
          savedPhotoPath: savedPhoto.localPath,
          taskId,
          componentType,
          location: {
            lat: location.lat,
            lng: location.lng,
            alt: location.alt,
            spd: location.spd,
            accuracy: location.accuracy,
            heading: location.heading,
            timestamp: location.timestamp,
          },
          taskMeta: meta,
          dateStr,
          timeStr,
          queuedAt: Date.now(),
        });

        navigation.pop(2);
      } else {
        throw new Error('Database insertion failed.');
      }
    } catch (e: unknown) {
      Alert.alert(
        'Save Error',
        (e instanceof Error ? e.message : String(e)) ||
          'Failed to capture watermark',
      );
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ViewShot
        ref={viewShotRef}
        style={styles.viewShotContainer}
        options={{ format: 'jpg', quality: 0.85 }}
      >
        <Image
          source={{ uri: `file://${photoPath}` }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />

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
                <PreserveCase style={styles.gpsCoordDMS}>
                  {formatDMS(location.lat, true)}
                </PreserveCase>
                <PreserveCase style={styles.gpsCoordDMS}>
                  {formatDMS(location.lng, false)}
                </PreserveCase>
                <PreserveCase style={styles.gpsDecimal}>
                  {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </PreserveCase>
                {location.accuracy != null && (
                  <PreserveCase
                    style={styles.gpsAccuracy}
                  >{`\u00B1${location.accuracy.toFixed(0)}m`}</PreserveCase>
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
              <PreserveCase style={styles.dataLabel}>{dateStr}</PreserveCase>
              <Icon
                name="time-outline"
                size={11}
                color="#94a3b8"
                style={styles.iconSpacer}
              />
              <PreserveCase style={styles.dataLabel}>{timeStr}</PreserveCase>
            </View>

            {/* Address row removed — the human-readable address is resolved
                on the CRM web frontend at view time from the stored GPS
                coords, so field capture stays instant and offline-safe. */}

            {/* Row 6: Altitude / Speed / Compass */}
            {location && (
              <View style={styles.dataRow}>
                <Icon name="trending-up-outline" size={11} color="#94a3b8" />
                <Text style={styles.dataLabel}>
                  {`Alt: ${location.alt.toFixed(0)}m`}
                  {location.spd > 0
                    ? `  Spd: ${(location.spd * 3.6).toFixed(0)}km/h`
                    : ''}
                  {location.heading != null
                    ? `  ${getCompassDirection(location.heading)}`
                    : ''}
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
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Icon name="close" size={22} color="white" />
          <Text style={styles.btnText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            !location && !isSaving ? styles.saveBtnDisabled : null,
          ]}
          onPress={handleSave}
          disabled={isSaving || !location}
        >
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : !location ? (
            <>
              <ActivityIndicator color="white" />
              <Text style={styles.btnText}>Acquiring GPS…</Text>
            </>
          ) : (
            <>
              <Icon name="checkmark" size={22} color="white" />
              <Text style={styles.btnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View
        style={[styles.bottomHintWrap, { bottom: Math.max(insets.bottom, 12) }]}
      >
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
  iconSpacer: {
    marginLeft: 8,
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
  saveBtnDisabled: {
    backgroundColor: '#64748b',
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
