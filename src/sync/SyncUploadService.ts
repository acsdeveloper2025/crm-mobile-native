import type { SyncOperation } from './SyncOperationLog';
import type { SyncUploadResult } from './SyncUploadTypes';
import { AttachmentUploader } from './uploaders/AttachmentUploader';
import { FormUploader } from './uploaders/FormUploader';
import { LocationUploader } from './uploaders/LocationUploader';
import { NotificationUploader } from './uploaders/NotificationUploader';
import { ProfilePhotoSyncUploader } from './uploaders/ProfilePhotoSyncUploader';
import { TaskUploader } from './uploaders/TaskUploader';

class SyncUploadServiceClass {
  async processOperation(operation: SyncOperation): Promise<SyncUploadResult> {
    switch (operation.entityType) {
      case 'FORM_SUBMISSION':
        return FormUploader.upload(operation);
      case 'ATTACHMENT':
      case 'VISIT_PHOTO':
        return AttachmentUploader.upload(operation);
      case 'LOCATION':
        return LocationUploader.upload(operation);
      case 'TASK':
        return TaskUploader.uploadTaskUpdate(operation);
      case 'TASK_STATUS':
        return TaskUploader.uploadTaskStatus(operation);
      case 'NOTIFICATION_ACTION':
        return NotificationUploader.upload(operation);
      case 'PROFILE_PHOTO':
        return ProfilePhotoSyncUploader.upload(operation);
      default:
        return {
          outcome: 'FAILURE',
          error: `Unsupported entity type: ${operation.entityType}`,
        };
    }
  }
}

export const SyncUploadService = new SyncUploadServiceClass();
