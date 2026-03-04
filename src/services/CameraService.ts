// CameraService - Cross-platform photo capture for evidence collection
// Uses react-native-vision-camera for both iOS and Android

import { Platform, PermissionsAndroid } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import { SyncQueue, SYNC_PRIORITY } from './SyncQueue';
import { LocationService } from './LocationService';
import { Logger } from '../utils/logger';
import { normalizeVerificationType } from '../utils/normalizeVerificationType';

const TAG = 'CameraService';

// Directory for storing captured photos
const PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/photos`;

export interface CapturedPhoto {
  id: string;
  localPath: string;
  filename: string;
  mimeType: string;
  size: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp: string;
  componentType: 'photo' | 'selfie';
}

class CameraServiceClass {
  private initialized = false;

  /**
   * Ensure the photos directory exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const exists = await RNFS.exists(PHOTOS_DIR);
    if (!exists) {
      await RNFS.mkdir(PHOTOS_DIR);
    }

    this.initialized = true;
    Logger.info(TAG, `Photos directory: ${PHOTOS_DIR}`);
  }

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const cameraGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message:
              'This app needs camera access for verification photos.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        return cameraGranted === PermissionsAndroid.RESULTS.GRANTED;
      }

      // iOS: camera permission is requested via Info.plist + first camera access
      return true;
    } catch (error) {
      Logger.error(TAG, 'Permission request failed', error);
      return false;
    }
  }

  /**
   * Save a captured photo to local storage and record in database.
   * This is called after the camera UI captures an image.
   *
   * @param sourcePath - Temp path where the camera saved the photo
   * @param taskId - Verification task this photo belongs to
   * @param componentType - 'photo' for evidence or 'selfie' for field agent selfie
   */
  async savePhoto(
    sourcePath: string,
    taskId: string,
    componentType: 'photo' | 'selfie' = 'photo',
  ): Promise<CapturedPhoto | null> {
    try {
      await this.initialize();

      const id = uuidv4();
      const timestamp = new Date().toISOString();
      const extension = sourcePath.split('.').pop() || 'jpg';
      const filename = `${componentType}_${id}.${extension}`;
      const destPath = `${PHOTOS_DIR}/${filename}`;

      // Move file from temp to our photos directory
      await RNFS.moveFile(sourcePath, destPath);

      // Get file size
      const stat = await RNFS.stat(destPath);

      // Capture location at the moment the photo is saved
      const location = await LocationService.getCurrentLocation();
      const taskRows = await DatabaseService.query<{
        verificationType?: string | null;
        verificationTaskId?: string | null;
      }>(
        `SELECT verification_type, verification_task_id
         FROM tasks
         WHERE id = ?
         LIMIT 1`,
        [taskId],
      );
      const taskMeta = taskRows[0];
      const verificationType = taskMeta?.verificationType
        ? normalizeVerificationType(taskMeta.verificationType)
        : 'verification';
      const backendTaskId = taskMeta?.verificationTaskId || taskId;

      const photo: CapturedPhoto = {
        id,
        localPath: destPath,
        filename,
        mimeType: extension === 'png' ? 'image/png' : 'image/jpeg',
        size: parseInt(String(stat.size), 10),
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy,
        timestamp,
        componentType,
      };

      // Save to local database
      await DatabaseService.execute(
        `INSERT INTO attachments
          (id, task_id, filename, original_name, mime_type, size,
           local_path, uploaded_at, latitude, longitude, accuracy,
           location_timestamp, component_type, sync_status, sync_attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
        [
          id,
          taskId,
          filename,
          filename,
          photo.mimeType,
          photo.size,
          destPath,
          timestamp,
          photo.latitude || null,
          photo.longitude || null,
          photo.accuracy || null,
          location?.timestamp || null,
          componentType,
        ],
      );

      // Queue for sync
      await SyncQueue.enqueue(
        'CREATE',
        'ATTACHMENT',
        id,
        {
          id,
          taskId: backendTaskId,
          localTaskId: taskId,
          filename,
          localPath: destPath,
          mimeType: photo.mimeType,
          size: photo.size,
          componentType,
          photoType: componentType === 'selfie' ? 'selfie' : 'verification',
          verificationType,
          geoLocation: location
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp,
              }
            : null,
        },
        SYNC_PRIORITY.HIGH,
      );

      Logger.info(
        TAG,
        `Photo saved: ${filename} (${(photo.size / 1024).toFixed(1)}KB)`,
      );

      return photo;
    } catch (error) {
      Logger.error(TAG, 'Failed to save photo', error);
      return null;
    }
  }

  /**
   * Get all photos for a task
   */
  async getPhotosForTask(taskId: string): Promise<CapturedPhoto[]> {
    const rows = await DatabaseService.query<{
      id: string;
      local_path: string;
      filename: string;
      mime_type: string;
      size: number;
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      uploaded_at: string;
      component_type: string;
    }>(
      'SELECT * FROM attachments WHERE task_id = ? ORDER BY uploaded_at ASC',
      [taskId],
    );

    return rows.map(row => ({
      id: row.id,
      localPath: row.local_path,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      accuracy: row.accuracy ?? undefined,
      timestamp: row.uploaded_at,
      componentType: row.component_type as 'photo' | 'selfie',
    }));
  }

  /**
   * Delete a photo from local storage and database
   */
  async deletePhoto(photoId: string): Promise<void> {
    const rows = await DatabaseService.query<{ local_path: string }>(
      'SELECT local_path FROM attachments WHERE id = ?',
      [photoId],
    );

    if (rows.length > 0) {
      const filePath = rows[0].local_path;
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await RNFS.unlink(filePath);
      }
    }

    await DatabaseService.execute('DELETE FROM attachments WHERE id = ?', [
      photoId,
    ]);
  }

  /**
   * Get total storage used by photos (in bytes)
   */
  async getStorageUsed(): Promise<number> {
    const result = await DatabaseService.query<{ total: number }>(
      'SELECT COALESCE(SUM(size), 0) as total FROM attachments',
    );
    return result[0]?.total ?? 0;
  }

  /**
   * Get the photos directory path
   */
  getPhotosDirectory(): string {
    return PHOTOS_DIR;
  }
}

// Singleton
export const CameraService = new CameraServiceClass();
export default CameraService;
