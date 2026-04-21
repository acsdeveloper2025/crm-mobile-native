// Background component that re-stamps saved photos with precise GPS address.
// Mounted persistently in App.tsx. Processes jobs from WatermarkReStampQueue.
// Renders a hidden ViewShot, captures the watermark, and overwrites the saved file.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import Geolocation from '@react-native-community/geolocation';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  WatermarkReStampQueue,
  type ReStampJob,
} from '../../services/WatermarkReStampQueue';
import { Logger } from '../../utils/logger';

const TAG = 'WatermarkReStamper';

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

export const WatermarkReStamper: React.FC = () => {
  const viewShotRef = useRef<ViewShot>(null);
  const [currentJob, setCurrentJob] = useState<ReStampJob | null>(null);
  const processingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    const job = WatermarkReStampQueue.peek();
    if (!job) return;

    processingRef.current = true;
    console.warn('[RESTAMP] Processing job:', job.attachmentId);
    try {
      // Use the saved photo (not raw) — raw may be deleted by OS
      const photoToUse = (await RNFS.exists(job.rawPhotoPath))
        ? job.rawPhotoPath
        : job.savedPhotoPath;
      if (!(await RNFS.exists(photoToUse))) {
        Logger.warn(TAG, `No photo found for ${job.attachmentId}, skipping`);
        WatermarkReStampQueue.dequeue();
        processingRef.current = false;
        return;
      }

      // Get fresh precise GPS
      const preciseLocation = await new Promise<{
        lat: number;
        lng: number;
        alt: number;
        spd: number;
        accuracy: number;
        heading?: number;
      } | null>(resolve => {
        Geolocation.getCurrentPosition(
          pos =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              alt: pos.coords.altitude || 0,
              spd: pos.coords.speed || 0,
              accuracy: pos.coords.accuracy || 0,
              heading: pos.coords.heading || undefined,
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        );
      });

      const bestLocation = preciseLocation || job.location;

      // 2026-04-21: watermark no longer shows the human-readable address.
      // Reverse geocoding happens on the web CRM UI at view time,
      // resolved from the attachment's stored GPS coords. This keeps
      // photo capture fast, removes the network dependency, and
      // guarantees the displayed address is always up to date.
      WatermarkReStampQueue.dequeue();
      setCurrentJob({
        ...job,
        rawPhotoPath: photoToUse,
        location: { ...job.location, ...bestLocation },
      });

      // Wait for React to render the ViewShot
      await new Promise(resolve => setTimeout(resolve, 600));

      // Capture the rendered watermark
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.85,
      });
      const cleanPath = uri.replace('file://', '');

      // Overwrite the saved photo
      if (await RNFS.exists(job.savedPhotoPath)) {
        await RNFS.unlink(job.savedPhotoPath);
      }
      await RNFS.moveFile(cleanPath, job.savedPhotoPath);

      // Clean up raw photo if it's different from saved
      if (
        job.rawPhotoPath !== job.savedPhotoPath &&
        (await RNFS.exists(job.rawPhotoPath))
      ) {
        await RNFS.unlink(job.rawPhotoPath).catch(() => {});
      }

      Logger.info(TAG, `Re-stamped ${job.attachmentId} with address`);
      console.warn('[RESTAMP] Success:', job.attachmentId);
    } catch (err) {
      Logger.error(TAG, `Re-stamp failed for ${job.attachmentId}`, err);
      console.warn('[RESTAMP] FAILED:', err);
      WatermarkReStampQueue.dequeue();
    } finally {
      setCurrentJob(null);
      processingRef.current = false;
      if (WatermarkReStampQueue.length > 0) {
        setTimeout(processNext, 300);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = WatermarkReStampQueue.subscribe(() => {
      processNext();
    });
    return unsubscribe;
  }, [processNext]);

  if (!currentJob) return null;

  const { location, dateStr, timeStr } = currentJob;

  return (
    <View style={styles.hidden}>
      <ViewShot
        ref={viewShotRef}
        style={styles.viewShot}
        options={{ format: 'jpg', quality: 0.85 }}
      >
        <Image
          source={{ uri: `file://${currentJob.rawPhotoPath}` }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />

        <View style={styles.watermarkStrip}>
          <View style={styles.gpsCard}>
            <View style={styles.gpsIconRow}>
              <Icon name="navigate" size={14} color="#22d3ee" />
              <Text style={styles.gpsLabel}>GPS LOCATION</Text>
            </View>
            <Text style={styles.gpsCoordDMS}>
              {formatDMS(location.lat, true)}
            </Text>
            <Text style={styles.gpsCoordDMS}>
              {formatDMS(location.lng, false)}
            </Text>
            <Text style={styles.gpsDecimal}>
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </Text>
            {location.accuracy != null && (
              <Text
                style={styles.gpsAccuracy}
              >{`\u00B1${location.accuracy.toFixed(0)}m`}</Text>
            )}
          </View>

          <View style={styles.dataStack}>
            <View style={styles.dataRow}>
              <Icon name="calendar-outline" size={11} color="#94a3b8" />
              <Text style={styles.dataLabel}>{dateStr}</Text>
              <Icon
                name="time-outline"
                size={11}
                color="#94a3b8"
                style={styles.iconSpacer}
              />
              <Text style={styles.dataLabel}>{timeStr}</Text>
            </View>

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

            <View style={styles.brandRow}>
              <Text style={styles.brandText}>CRM Verification</Text>
              <View style={styles.brandDot} />
              <Text style={styles.brandText}>Geo-Tagged Evidence</Text>
            </View>
          </View>
        </View>
      </ViewShot>
    </View>
  );
};

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 720,
    height: 1280,
    opacity: 0,
    pointerEvents: 'none' as const,
    zIndex: -1,
  },
  viewShot: { width: 720, height: 1280, backgroundColor: 'black' },
  watermarkStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  gpsCard: {
    width: 110,
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.2)',
  },
  gpsIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
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
  dataStack: { flex: 1, justifyContent: 'center' },
  dataRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  iconSpacer: { marginLeft: 8 },
  dataLabel: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  addressText: {
    color: '#fde68a',
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 4,
    flexShrink: 1,
    lineHeight: 13,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
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
});
