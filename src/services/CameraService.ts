// CameraService - Cross-platform photo capture for evidence collection
// Uses react-native-vision-camera for both iOS and Android

import { Platform, PermissionsAndroid } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { AttachmentRepository } from '../repositories/AttachmentRepository';
import { TaskRepository } from '../repositories/TaskRepository';
import { DatabaseService } from '../database/DatabaseService';
import { SyncGateway } from './SyncGateway';
import { SYNC_PRIORITY } from './SyncQueue';
import { LocationService } from './LocationService';
import { Logger } from '../utils/logger';
import { resolveFormTypeKey, toBackendFormType } from '../utils/formTypeKey';

const TAG = 'CameraService';

// Directory for storing captured photos
const PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/photos`;
const THUMBNAILS_DIR = `${PHOTOS_DIR}/thumbnails`;

export interface CapturedPhoto {
  id: string;
  localPath: string;
  thumbnailPath?: string;
  filename: string;
  mimeType: string;
  size: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp: string;
  componentType: 'photo' | 'selfie';
}

interface SavePhotoOptions {
  locationOverride?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    timestamp?: string;
  } | null;
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
    const thumbnailsExist = await RNFS.exists(THUMBNAILS_DIR);
    if (!thumbnailsExist) {
      await RNFS.mkdir(THUMBNAILS_DIR);
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
    options?: SavePhotoOptions,
  ): Promise<CapturedPhoto | null> {
    try {
      await this.initialize();

      // Enforce maxFilesPerTask limit to prevent storage bloat
      const { config } = await import('../config');
      const existingCount = await AttachmentRepository.countByTaskId(taskId);
      if (existingCount >= config.maxFilesPerTask) {
        Logger.warn(TAG, `Photo limit reached for task ${taskId}: ${existingCount}/${config.maxFilesPerTask}`);
        throw new Error(`Maximum ${config.maxFilesPerTask} photos per task reached`);
      }

      const id = uuidv4();
      const timestamp = new Date().toISOString();
      const extension = sourcePath.split('.').pop() || 'jpg';
      const filename = `${componentType}_${id}.${extension}`;
      const destPath = `${PHOTOS_DIR}/${filename}`;

      // Move file from temp to our photos directory
      await RNFS.moveFile(sourcePath, destPath);

      // Get file size
      const stat = await RNFS.stat(destPath);
      const thumbnailPath = await this.createThumbnail(destPath, id, extension);

      const override = options?.locationOverride || null;
      const resolvedLocation =
        override && typeof override.latitude === 'number' && typeof override.longitude === 'number'
          ? {
              latitude: override.latitude,
              longitude: override.longitude,
              accuracy: override.accuracy ?? 0,
              timestamp: override.timestamp || new Date().toISOString(),
              source: 'GPS' as const,
            }
          : await LocationService.getCurrentLocation();
      const taskMeta = await TaskRepository.getTaskIdentity(taskId);
      const formTypeKey = resolveFormTypeKey({
        verificationTypeCode: taskMeta?.verificationTypeCode || null,
        verificationTypeName: taskMeta?.verificationTypeName || null,
        verificationType: taskMeta?.verificationType || null,
      });
      const verificationType = formTypeKey ? toBackendFormType(formTypeKey) : null;
      const backendTaskId = taskMeta?.verificationTaskId || taskId;

      const photo: CapturedPhoto = {
        id,
        localPath: destPath,
        thumbnailPath: thumbnailPath || undefined,
        filename,
        mimeType: extension === 'png' ? 'image/png' : 'image/jpeg',
        size: parseInt(String(stat.size), 10),
        latitude: resolvedLocation?.latitude,
        longitude: resolvedLocation?.longitude,
        accuracy: resolvedLocation?.accuracy,
        timestamp,
        componentType,
      };

      // Save to local database and queue for sync in a transaction to prevent
      // orphaned files if a crash occurs between DB insert and sync enqueue.
      await DatabaseService.transaction(async () => {
        await AttachmentRepository.create({
          id,
          taskId,
          filename,
          mimeType: photo.mimeType,
          size: photo.size,
          localPath: destPath,
          thumbnailPath,
          uploadedAt: timestamp,
          latitude: photo.latitude,
          longitude: photo.longitude,
          accuracy: photo.accuracy,
          locationTimestamp: resolvedLocation?.timestamp || null,
          componentType,
        });
      });

      // GPS is captured in photo watermark — no separate location sync needed

      // Queue for sync (outside transaction — enqueue has its own persistence)
      await SyncGateway.enqueueAttachment(
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
          ...(verificationType ? { verificationType } : {}),
          geoLocation: resolvedLocation
            ? {
                latitude: resolvedLocation.latitude,
                longitude: resolvedLocation.longitude,
                accuracy: resolvedLocation.accuracy,
                timestamp: resolvedLocation.timestamp,
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

  private async createThumbnail(
    sourcePath: string,
    photoId: string,
    extension: string,
  ): Promise<string | null> {
    try {
      const thumbnail = await ImageResizer.createResizedImage(
        sourcePath,
        240,
        240,
        extension === 'png' ? 'PNG' : 'JPEG',
        60,
        0,
        THUMBNAILS_DIR,
        false,
        {
          mode: 'contain',
          onlyScaleDown: true,
        },
      );

      const thumbnailExtension = thumbnail.name?.split('.').pop() || extension || 'jpg';
      const finalPath = `${THUMBNAILS_DIR}/thumb_${photoId}.${thumbnailExtension}`;

      if (thumbnail.path !== finalPath) {
        if (await RNFS.exists(finalPath)) {
          await RNFS.unlink(finalPath);
        }
        await RNFS.moveFile(thumbnail.path, finalPath);
      }

      return finalPath;
    } catch (error) {
      Logger.warn(TAG, 'Failed to create thumbnail, falling back to full image', error);
      return null;
    }
  }

  /**
   * Get all photos for a task
   */
  async getPhotosForTask(taskId: string): Promise<CapturedPhoto[]> {
    const rows = await AttachmentRepository.listForTask(taskId);

    return rows.map(row => ({
      id: row.id,
      localPath: row.localPath,
      thumbnailPath: row.thumbnailPath ?? undefined,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      accuracy: row.accuracy ?? undefined,
      timestamp: row.uploadedAt,
      componentType: row.componentType as 'photo' | 'selfie',
    }));
  }

  /**
   * Delete a photo from local storage and database
   */
  async deletePhoto(photoId: string): Promise<void> {
    await AttachmentRepository.deleteLocalFilesById(photoId);
    await AttachmentRepository.deleteById(photoId);
  }

  /**
   * Get total storage used by photos (in bytes)
   */
  async getStorageUsed(): Promise<number> {
    return AttachmentRepository.getTotalStorageUsed();
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
