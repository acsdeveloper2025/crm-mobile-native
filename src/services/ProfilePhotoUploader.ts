// ProfilePhotoUploader — upload a locally-captured profile photo to
// backend after a client-side resize.
//
// Called from AuthService.updateProfilePhoto after the file has been
// moved to DocumentDirectoryPath/profile. Uses @bam.tech/react-native-
// image-resizer (existing dep) to downscale to 512×512 JPEG q85 before
// POSTing multipart to /api/mobile/users/me/photo. Backend re-encodes
// with sharp anyway; the mobile-side resize just keeps the upload
// small on cellular.
//
// Offline is handled at the caller level via SyncQueue (PROFILE_PHOTO
// entity). This service is the online-path / drain-path worker.

import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { Logger } from '../utils/logger';

const TAG = 'ProfilePhotoUploader';

// Target dims match backend sharp output (512×512) so the client-side
// resize is not a strict requirement but saves bandwidth on slow radios.
const RESIZE_WIDTH = 512;
const RESIZE_HEIGHT = 512;
const RESIZE_QUALITY = 85;

export interface ProfilePhotoUploadResult {
  profilePhotoUrl: string;
}

class ProfilePhotoUploaderClass {
  async resizeForUpload(localPath: string): Promise<string> {
    const normalizedInput = localPath.startsWith('file://')
      ? localPath.replace('file://', '')
      : localPath;
    const resized = await ImageResizer.createResizedImage(
      normalizedInput,
      RESIZE_WIDTH,
      RESIZE_HEIGHT,
      'JPEG',
      RESIZE_QUALITY,
      0,
      // `null` lets the library pick tmp cache. RNFS.unlink afterwards.
      undefined,
      false,
      { mode: 'cover', onlyScaleDown: false },
    );
    return resized.path.startsWith('file://')
      ? resized.path.replace('file://', '')
      : resized.path;
  }

  async upload(localPath: string): Promise<ProfilePhotoUploadResult> {
    const resizedPath = await this.resizeForUpload(localPath);
    const formData = new FormData();
    formData.append('photo', {
      uri: `file://${resizedPath}`,
      type: 'image/jpeg',
      name: `profile_${Date.now()}.jpg`,
    } as unknown as Blob);

    try {
      const response = await ApiClient.post<{
        success: boolean;
        data?: { profilePhotoUrl?: string };
      }>(ENDPOINTS.PROFILE.UPLOAD_PHOTO, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // 30 s default is plenty for a 50-100 KB payload; don't override.
      });

      if (!response.success || !response.data?.profilePhotoUrl) {
        throw new Error('Server rejected profile photo upload');
      }
      Logger.info(
        TAG,
        `Profile photo uploaded: ${response.data.profilePhotoUrl}`,
      );
      return { profilePhotoUrl: response.data.profilePhotoUrl };
    } finally {
      // The resized temp file served its purpose — drop it.
      try {
        if (await RNFS.exists(resizedPath)) {
          await RNFS.unlink(resizedPath);
        }
      } catch (err) {
        Logger.warn(TAG, 'Resized temp cleanup failed', err);
      }
    }
  }
}

export const ProfilePhotoUploader = new ProfilePhotoUploaderClass();
