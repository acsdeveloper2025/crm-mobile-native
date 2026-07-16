// CameraService - Cross-platform photo capture for evidence collection
// Uses react-native-vision-camera for both iOS and Android

import { Platform, PermissionsAndroid } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import piexif from 'piexifjs';
import { AttachmentRepository } from '../repositories/AttachmentRepository';
import { TaskRepository } from '../repositories/TaskRepository';
import { DatabaseService } from '../database/DatabaseService';
import { SyncGateway } from './SyncGateway';
import { SYNC_PRIORITY } from './SyncQueue';
import { LocationService } from './LocationService';
import { StorageService } from './StorageService';
import { Logger } from '../utils/logger';
import { resolveFormTypeKey, toBackendFormType } from '../utils/formTypeKey';
import { sha256OfFile } from '../utils/fileHash';

const TAG = 'CameraService';

// Directory for storing captured photos
const PHOTOS_DIR = `${RNFS.DocumentDirectoryPath}/photos`;
const THUMBNAILS_DIR = `${PHOTOS_DIR}/thumbnails`;

// 2026-04-21: savePhoto never blocks on GPS beyond this window. If the
// OS can give us a fix in 2 seconds (the hot / warm-cache case), we
// use it; otherwise we proceed with no-location and let the
// WatermarkReStamper running in App.tsx grab a fresh precise fix in
// the background after the save returns. Capture UX stays snappy even
// on cold-start GPS.
const GPS_SAVE_TIMEOUT_MS = 2_000;

// 2026-05-31: raw-photo capture quality. Long-edge bound for the
// fit-inside downscale (1080p class — sharp enough for doorplates /
// documents, small enough for slow field uploads). Aspect is always
// preserved (mode:'contain'), so a landscape capture keeps its full
// frame — no portrait crop.
const NORMALIZE_MAX_EDGE = 1920;
const NORMALIZE_QUALITY = 85;

function locationWithTimeout(
  promise: Promise<
    Awaited<ReturnType<typeof LocationService.getCurrentLocation>>
  >,
  ms: number,
): Promise<Awaited<ReturnType<typeof LocationService.getCurrentLocation>>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => {
      Logger.warn(
        TAG,
        `GPS timed out after ${ms}ms during savePhoto; continuing without location`,
      );
      resolve(null);
    }, ms);
  });
  return Promise.race([
    promise.then(value => {
      if (timer) {
        clearTimeout(timer);
      }
      return value;
    }),
    timeout,
  ]).catch(err => {
    if (timer) {
      clearTimeout(timer);
    }
    Logger.warn(
      TAG,
      'GPS lookup failed during savePhoto; continuing without location',
      err,
    );
    return null;
  });
}

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
    altitude?: number;
    speed?: number;
    heading?: number;
    timestamp?: string;
  } | null;
  // 2026-05-31 (Phase 3): capture pixel dims from vision-camera's
  // PhotoFile — a free signal (no file read) used to decide whether the
  // downscale step can be skipped.
  captureWidth?: number;
  captureHeight?: number;
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
    // S12 (audit 2026-04-21 round 2): demoted from info to debug so
    // the device-internal path doesn't ride into the remote log
    // buffer on every init. Path is private on Android
    // (DocumentDirectoryPath + allowBackup=false) but still noisy.
    Logger.debug(TAG, `Photos directory: ${PHOTOS_DIR}`);
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
            message: 'This app needs camera access for verification photos.',
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
    // B2 (audit 2026-04-21 round 2): scoped outside the try so the
    // catch block below can unlink them if any post-move step throws.
    let destPath: string | null = null;
    let thumbnailPath: string | null = null;
    try {
      await this.initialize();

      // 2026-04-27 deep-audit fix (D8/D9): pre-flight disk-space check
      // BEFORE moveFile/thumbnail create. Without this, an out-of-space
      // device fails with a cryptic RNFS error mid-write — agent's
      // capture #15 dies opaquely. 50MB headroom matches the SyncQueue
      // enqueue threshold; covers original (~5MB) + thumbnail + DB
      // transaction journal + safety margin. Throws a user-actionable
      // error so the UI can surface "Free up space and try again".
      const hasSpace = await StorageService.hasEnoughSpace(50);
      if (!hasSpace) {
        throw new Error(
          'Device storage is full. Please free up space (uninstall unused apps, clear cache, or delete media) and try again.',
        );
      }

      // Enforce maxFilesPerTask limit to prevent storage bloat
      const { config } = await import('../config');
      const existingCount = await AttachmentRepository.countByTaskId(taskId);
      if (existingCount >= config.maxFilesPerTask) {
        Logger.warn(
          TAG,
          `Photo limit reached for task ${taskId}: ${existingCount}/${config.maxFilesPerTask}`,
        );
        throw new Error(
          `Maximum ${config.maxFilesPerTask} photos per task reached`,
        );
      }

      const id = uuidv4();
      const timestamp = new Date().toISOString();
      const extension = sourcePath.split('.').pop() || 'jpg';
      const filename = `${componentType}_${id}.${extension}`;
      destPath = `${PHOTOS_DIR}/${filename}`;
      // Local non-nullable alias for use inside the async transaction
      // closure below — TS can't track narrowing of the outer `destPath`
      // through the async callback.
      const finalDestPath: string = destPath;

      // Move file from temp to our photos directory
      await RNFS.moveFile(sourcePath, finalDestPath);

      // 2026-05-31: photos are now saved RAW (no on-device watermark
      // composite — the CRM web overlays address + metadata from the
      // stored GPS coords at view time). Two things must happen here that
      // the old ViewShot path did implicitly:
      //   1. Bake EXIF orientation into the pixels. Raw camera JPEGs carry
      //      an orientation tag; we strip EXIF before upload, so without
      //      baking it the web would render rotated/sideways photos.
      //   2. Downscale to ~1080p class. `mode:'contain'` + equal bounds
      //      preserves aspect — NO landscape crop (the bug we are fixing) —
      //      and `onlyScaleDown` never upscales an already-small image.
      await this.normalizeCapturedImage(finalDestPath, extension, {
        captureWidth: options?.captureWidth,
        captureHeight: options?.captureHeight,
      });

      // Get file size (post-normalize so size/hash reflect the final bytes)
      const stat = await RNFS.stat(finalDestPath);
      thumbnailPath = await this.createThumbnail(finalDestPath, id, extension);

      // 2026-04-21: GPS is MANDATORY on every captured photo — there
      // is no "save without location" path. Callers (WatermarkPreview)
      // acquire GPS up-front and pass it in `options.locationOverride`;
      // this internal fetch is the fallback for direct callers and is
      // capped by GPS_SAVE_TIMEOUT_MS. If neither source yields a fix
      // we throw so the save is aborted cleanly instead of persisting a
      // GPS-less attachment.
      const override = options?.locationOverride || null;
      const resolvedLocation =
        override &&
        typeof override.latitude === 'number' &&
        typeof override.longitude === 'number'
          ? {
              latitude: override.latitude,
              longitude: override.longitude,
              accuracy: override.accuracy ?? 0,
              altitude: override.altitude,
              speed: override.speed,
              heading: override.heading,
              timestamp: override.timestamp || new Date().toISOString(),
              source: 'GPS' as const,
            }
          : await locationWithTimeout(
              LocationService.getCurrentLocation(),
              GPS_SAVE_TIMEOUT_MS,
            );

      if (
        !resolvedLocation ||
        typeof resolvedLocation.latitude !== 'number' ||
        typeof resolvedLocation.longitude !== 'number'
      ) {
        // Roll back the file we just moved — we will NOT persist a
        // GPS-less attachment (user decision 2026-04-21).
        if (await RNFS.exists(finalDestPath)) {
          await RNFS.unlink(finalDestPath).catch(() => {});
        }
        if (thumbnailPath && (await RNFS.exists(thumbnailPath))) {
          await RNFS.unlink(thumbnailPath).catch(() => {});
        }
        throw new Error(
          'GPS_REQUIRED: unable to obtain a GPS fix for this photo. ' +
            'Make sure location permission is granted and move to an area with signal.',
        );
      }

      // 2026-04-28 deep-audit fix (D6/D17): SHA-256 of file bytes for
      // evidence-grade tamper detection. Computed AFTER GPS resolves
      // (above) and BEFORE the DB insert below so the hash is sealed
      // into the row from creation time. ~300ms on mid-Android for a
      // 5MB photo; invisible inside the existing capture wait. Failure
      // returns null and we still persist the row — better to keep the
      // photo than to fail capture over a hash compute.
      const clientSha256 = await sha256OfFile(finalDestPath);

      const taskMeta = await TaskRepository.getTaskIdentity(taskId);
      const formTypeKey = resolveFormTypeKey({
        verificationTypeCode: taskMeta?.verificationTypeCode || null,
        verificationTypeName: taskMeta?.verificationTypeName || null,
        verificationType: taskMeta?.verificationType || null,
      });
      const verificationType = formTypeKey
        ? toBackendFormType(formTypeKey)
        : null;
      const backendTaskId = taskMeta?.verificationTaskId || taskId;

      const photo: CapturedPhoto = {
        id,
        localPath: finalDestPath,
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

      // C12 (audit 2026-04-20): save to local DB AND queue for sync in
      // a single transaction. Previously the transaction only wrapped
      // the attachments INSERT (a no-op in SQLite — single statements
      // auto-commit), while `SyncGateway.enqueueAttachment` ran
      // afterwards. A crash between the two left an orphan attachment
      // row with sync_status='PENDING' and no sync_queue entry.
      // `SyncQueue.reconcileOrphanAttachments` would recover it on the
      // NEXT app launch, but within-session orphans were invisible
      // until restart.
      //
      // Nesting is safe for ATTACHMENT enqueues: `SyncQueue.enqueue`
      // with entityType='ATTACHMENT' calls `SyncQueueRepository.insert`
      // which issues a single INSERT with no inner transaction, so it
      // joins the outer one cleanly. The storage-check read
      // (`hasEnoughSpace`) is filesystem-only and does not touch the
      // DB connection.
      await DatabaseService.transaction(async () => {
        await AttachmentRepository.create({
          id,
          taskId,
          filename,
          mimeType: photo.mimeType,
          size: photo.size,
          localPath: finalDestPath,
          thumbnailPath,
          uploadedAt: timestamp,
          latitude: photo.latitude,
          longitude: photo.longitude,
          accuracy: photo.accuracy,
          locationTimestamp: resolvedLocation?.timestamp || null,
          componentType,
          clientSha256,
        });

        // GPS is captured in photo watermark — no separate location sync needed

        await SyncGateway.enqueueAttachment(
          id,
          {
            id,
            taskId: backendTaskId,
            localTaskId: taskId,
            filename,
            localPath: finalDestPath,
            mimeType: photo.mimeType,
            size: photo.size,
            componentType,
            photoType: componentType === 'selfie' ? 'selfie' : 'verification',
            ...(verificationType ? { verificationType } : {}),
            // 2026-04-28 deep-audit fix (D6/D17): integrity hash for
            // backend tamper-detection. May be null if compute failed
            // (rare); backend treats null as "unverifiable, not a tamper
            // signal".
            clientSha256,
            geoLocation: resolvedLocation
              ? {
                  latitude: resolvedLocation.latitude,
                  longitude: resolvedLocation.longitude,
                  accuracy: resolvedLocation.accuracy,
                  altitude: resolvedLocation.altitude,
                  speed: resolvedLocation.speed,
                  heading: resolvedLocation.heading,
                  timestamp: resolvedLocation.timestamp,
                }
              : null,
          },
          SYNC_PRIORITY.HIGH,
        );
      });

      Logger.info(
        TAG,
        `Photo saved: ${filename} (${(photo.size / 1024).toFixed(1)}KB)`,
      );

      return photo;
    } catch (error) {
      // B2 (audit 2026-04-21 round 2): if the GPS-missing branch above
      // didn't fire and we instead threw later (e.g. DB write failed
      // inside the transaction), the moved file + thumbnail were left
      // on disk with no attachments row pointing at them. They'd get
      // reclaimed by the 45-day orphan sweep eventually, but that's a
      // slow cleanup. Undo the filesystem side-effects here so failure
      // is symmetric with success.
      try {
        if (destPath && (await RNFS.exists(destPath))) {
          await RNFS.unlink(destPath);
        }
        if (thumbnailPath && (await RNFS.exists(thumbnailPath))) {
          await RNFS.unlink(thumbnailPath);
        }
      } catch (cleanupErr) {
        Logger.warn(
          TAG,
          `Cleanup failed after savePhoto error for task ${taskId}`,
          cleanupErr,
        );
      }
      Logger.error(TAG, 'Failed to save photo', error);
      return null;
    }
  }

  /**
   * Normalize a freshly-captured raw JPEG in place:
   *  - bake EXIF orientation into the pixels by passing ImageResizer an
   *    EXPLICIT rotation derived from the file's EXIF Orientation tag
   *    (normalizeWithResizer → exifOrientationToDegrees). ImageResizer does
   *    NOT auto-apply EXIF and strips it on output, so without the explicit
   *    angle a sideways-sensor capture would save rotated.
   *  - downscale the long edge to ~1080p class while PRESERVING aspect
   *    (`mode:'contain'` + equal width/height bounds = fit-inside box, so
   *    a landscape frame stays landscape — never cropped to portrait)
   *  - `onlyScaleDown:true` leaves already-smaller images untouched
   *
   * Phase 3 (conditional-normalize): when the capture is already upright
   * (EXIF Orientation == 1 / absent) AND already within the size bound,
   * the expensive decode+re-encode is skipped — but EXIF is FIRST stripped
   * in place so the saved bytes match what gets uploaded (the upload path
   * also strips EXIF; the backend hash_verified check compares the
   * client capture-time hash against a re-hash of the uploaded bytes, so
   * the bytes hashed here MUST equal the bytes that land server-side).
   * Re-encoding via ImageResizer already produces EXIF-less output, so the
   * non-skip branch needs no extra strip. Fail-safe: any doubt normalizes.
   *
   * Best-effort: on any failure the original file is kept as-is (a rotated
   * or larger photo is better than a failed capture). Overwrites in place
   * so the caller's destPath/hash/stat all see the final bytes.
   *
   * @param captureWidth/captureHeight  vision-camera PhotoFile pixel dims
   *   (free, no file read) — used to decide if the downscale can be skipped.
   */
  private async normalizeCapturedImage(
    filePath: string,
    extension: string,
    capture: { captureWidth?: number; captureHeight?: number } = {},
  ): Promise<void> {
    try {
      // Phase 3 skip path — JPEG only (PNG has no EXIF orientation tag and
      // isn't the camera output). Skip the decode+re-encode when the photo
      // is already within the size bound AND already upright.
      const w = capture.captureWidth;
      const h = capture.captureHeight;
      const withinBound =
        typeof w === 'number' &&
        typeof h === 'number' &&
        w > 0 &&
        h > 0 &&
        w <= NORMALIZE_MAX_EDGE &&
        h <= NORMALIZE_MAX_EDGE;

      if (
        withinBound &&
        extension !== 'png' &&
        (await this.trySkipNormalize(filePath))
      ) {
        return;
      }

      await this.normalizeWithResizer(filePath, extension);
    } catch (error) {
      Logger.warn(
        TAG,
        'Image normalize (orientation/downscale) failed; keeping original',
        error,
      );
    }
  }

  /**
   * Phase 3 skip: when the JPEG is already upright, strip its EXIF in place
   * and report success — letting the caller bypass the full decode+resize.
   * Reads the file's base64 ONCE (M1): the same string is used to read the
   * EXIF Orientation tag AND to produce the stripped bytes, so the skip
   * path costs one read + one write, NO decode.
   *
   * Returns true only when the photo was upright (EXIF Orientation 1 or no
   * EXIF block) AND the strip+write succeeded. Returns false on a
   * rotation/mirror tag (2..8 — pixels must be baked upright) or on any
   * read/write error, so the caller falls through to normalizeWithResizer.
   *
   * Authoritative on the file's own EXIF — vision-camera's display-relative
   * `orientation` field is NOT a reliable proxy for what's in the file.
   */
  private async trySkipNormalize(filePath: string): Promise<boolean> {
    let base64: string;
    try {
      base64 = await RNFS.readFile(filePath, 'base64');
    } catch (err) {
      Logger.warn(TAG, 'EXIF read for skip-check failed; will normalize', err);
      return false;
    }

    const dataUri = `data:image/jpeg;base64,${base64}`;

    // Orientation 1 = upright; a thrown load() means no EXIF block = also
    // upright. 2..8 means rotation/mirror lives only in the tag, not the
    // pixels → must normalize so the pixels themselves are upright.
    let orientation: number | null;
    try {
      const exif = piexif.load(dataUri);
      const zeroth = (exif as { '0th'?: Record<number, unknown> })['0th'];
      const value = zeroth?.[piexif.ImageIFD.Orientation];
      orientation = typeof value === 'number' ? value : null;
    } catch {
      orientation = null;
    }
    if (orientation !== 1 && orientation !== null) {
      return false;
    }

    // Strip EXIF in place so the saved bytes == the uploaded bytes (the
    // upload path strips too, and piexif.remove is byte-idempotent). This
    // keeps the capture-time client hash valid against the server re-hash.
    try {
      const stripped = piexif
        .remove(dataUri)
        .replace(/^data:image\/jpeg;base64,/, '');
      await RNFS.writeFile(filePath, stripped, 'base64');
      Logger.debug(
        TAG,
        'Normalize skipped (upright + in-bound); EXIF stripped in place',
      );
      return true;
    } catch (err) {
      Logger.warn(TAG, 'EXIF strip for skip failed; will normalize', err);
      return false;
    }
  }

  /**
   * Map an EXIF Orientation tag (1..8) to the clockwise degrees ImageResizer
   * must rotate the pixels so the output is visually upright. Verified on
   * device 2026-05-31: ImageResizer's `rotation` arg does NOT auto-apply the
   * source EXIF (passing 0 left orientation-6 pixels sideways) — we must
   * supply the angle explicitly. Only 1/3/6/8 are produced by a normal rear
   * camera; mirrored variants (2/4/5/7) can't be corrected by rotation alone,
   * so we apply their rotational component and accept the mirror (rare).
   */
  private static exifOrientationToDegrees(orientation: number | null): number {
    switch (orientation) {
      case 3:
      case 4:
        return 180;
      case 6:
      case 5:
        return 90;
      case 8:
      case 7:
        return 270;
      default:
        return 0; // 1, 2, null → already upright (or unknown)
    }
  }

  /** Read the JPEG EXIF Orientation tag (1..8) or null if absent/unreadable. */
  private async readJpegOrientation(filePath: string): Promise<number | null> {
    try {
      const base64 = await RNFS.readFile(filePath, 'base64');
      const exif = piexif.load(`data:image/jpeg;base64,${base64}`);
      const zeroth = (exif as { '0th'?: Record<number, unknown> })['0th'];
      const value = zeroth?.[piexif.ImageIFD.Orientation];
      return typeof value === 'number' ? value : null;
    } catch {
      return null;
    }
  }

  /** Full decode → orientation-bake + downscale → overwrite in place. */
  private async normalizeWithResizer(
    filePath: string,
    extension: string,
  ): Promise<void> {
    try {
      const format = extension === 'png' ? 'PNG' : 'JPEG';
      // Bake the EXIF orientation into the pixels. ImageResizer strips EXIF on
      // output, so without an explicit rotation a sideways-sensor capture
      // (EXIF 6/8) would be saved rotated — which is exactly the bug this
      // fixes. PNG has no EXIF orientation, so degrees stay 0.
      const orientation =
        format === 'JPEG' ? await this.readJpegOrientation(filePath) : null;
      const rotationDegrees =
        CameraServiceClass.exifOrientationToDegrees(orientation);
      const resized = await ImageResizer.createResizedImage(
        filePath,
        NORMALIZE_MAX_EDGE,
        NORMALIZE_MAX_EDGE,
        format,
        NORMALIZE_QUALITY,
        rotationDegrees, // explicit CW degrees to bake the image upright
        undefined, // temp dir; we move the result over the original below
        false,
        { mode: 'contain', onlyScaleDown: true },
      );

      const resizedPath = resized.path.replace('file://', '');
      if (resizedPath === filePath) {
        return;
      }
      if (await RNFS.exists(filePath)) {
        await RNFS.unlink(filePath);
      }
      await RNFS.moveFile(resizedPath, filePath);
    } catch (error) {
      Logger.warn(
        TAG,
        'Image normalize (orientation/downscale) failed; keeping original',
        error,
      );
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

      const thumbnailExtension =
        thumbnail.name?.split('.').pop() || extension || 'jpg';
      const finalPath = `${THUMBNAILS_DIR}/thumb_${photoId}.${thumbnailExtension}`;

      if (thumbnail.path !== finalPath) {
        if (await RNFS.exists(finalPath)) {
          await RNFS.unlink(finalPath);
        }
        await RNFS.moveFile(thumbnail.path, finalPath);
      }

      return finalPath;
    } catch (error) {
      Logger.warn(
        TAG,
        'Failed to create thumbnail, falling back to full image',
        error,
      );
      return null;
    }
  }

  // 2026-07-17: `getPhotosForTask` was deleted here — zero callers. It wrapped
  // AttachmentRepository.listForTask and remapped the rows into CapturedPhoto;
  // every live reader (PhotoGallery, the gates, the self-heal) goes to the
  // repository directly. Note the honest name it leaked: the "attachments"
  // table holds the agent's PHOTOS.

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
