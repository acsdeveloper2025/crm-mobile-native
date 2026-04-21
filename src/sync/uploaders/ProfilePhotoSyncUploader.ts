import RNFS from 'react-native-fs';
import { ProfilePhotoUploader } from '../../services/ProfilePhotoUploader';
import { AuthService } from '../../services/AuthService';
import { UserSessionRepository } from '../../repositories/UserSessionRepository';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import type { SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'ProfilePhotoSyncUploader';

/**
 * Drains PROFILE_PHOTO queue items — takes the local JPEG captured by
 * ProfilePhotoCaptureScreen and uploads it to the backend via
 * ProfilePhotoUploader. On success, updates the in-memory user and
 * local SQLite `user_session.profile_photo_url` to the returned server
 * URL.
 *
 * The SyncProcessor retry/DLQ machinery handles transient failures
 * (lease, backoff, max_attempts=10). A missing local file (user
 * logged out and cleanup ran) is non-retryable — returns SUCCESS to
 * drop the item from the queue.
 */
class ProfilePhotoSyncUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const localPath = String(operation.payload.localPath || '');
    if (!localPath) {
      return {
        outcome: 'SUCCESS',
        error: 'PROFILE_PHOTO queue item missing localPath — dropping',
      };
    }

    // Strip file:// prefix for the existence check.
    const fsPath = localPath.startsWith('file://')
      ? localPath.replace('file://', '')
      : localPath;
    const exists = await RNFS.exists(fsPath);
    if (!exists) {
      Logger.warn(TAG, `Local profile photo missing, dropping: ${fsPath}`);
      return {
        outcome: 'SUCCESS',
        error: 'Local profile photo file missing — dropping queue item',
      };
    }

    try {
      const { profilePhotoUrl } = await ProfilePhotoUploader.upload(localPath);

      // Replace the in-memory `file://` URL with the server URL so the
      // avatar starts resolving from backend on future renders.
      await AuthService.updateProfilePhotoUrl(profilePhotoUrl);
      if (UserSessionRepository.isReady()) {
        await UserSessionRepository.updateProfilePhoto(profilePhotoUrl);
      }

      return { outcome: 'SUCCESS' };
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err) || 'Unknown error';
      Logger.warn(TAG, 'Profile photo upload failed', err);
      return {
        outcome: 'FAILURE',
        error: `Profile photo upload failed: ${errorMsg}`,
      };
    }
  }
}

export const ProfilePhotoSyncUploader = new ProfilePhotoSyncUploaderClass();
