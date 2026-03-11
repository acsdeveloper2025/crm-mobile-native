import type { SyncOperation } from './SyncOperationLog';
import type { SyncUploadResult } from './SyncUploadTypes';
import { AttachmentUploader } from './uploaders/AttachmentUploader';
import { FormUploader } from './uploaders/FormUploader';
import { LocationUploader } from './uploaders/LocationUploader';
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
      default:
        return {
          outcome: 'FAILURE',
          error: `Unsupported entity type: ${operation.entityType}`,
        };
    }
  }
}

export const SyncUploadService = new SyncUploadServiceClass();
