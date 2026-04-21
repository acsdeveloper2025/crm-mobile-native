import { SyncQueue, SYNC_PRIORITY } from './SyncQueue';

class SyncGatewayClass {
  async enqueueTaskUpdate(
    backendTaskId: string,
    localTaskId: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.NORMAL,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'TASK',
      backendTaskId,
      { localTaskId, ...payload },
      priority,
    );
  }

  async enqueueTaskStatus(
    backendTaskId: string,
    localTaskId: string,
    status: string,
    extraPayload: Record<string, unknown> = {},
    priority: number = SYNC_PRIORITY.CRITICAL,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'TASK_STATUS',
      backendTaskId,
      {
        localTaskId,
        taskId: backendTaskId,
        status,
        action: String(status).toUpperCase(),
        timestamp: new Date().toISOString(),
        ...extraPayload,
      },
      priority,
    );
  }

  async enqueueLocation(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.CRITICAL,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'LOCATION', id, payload, priority);
  }

  async enqueueAttachment(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.HIGH,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'ATTACHMENT', id, payload, priority);
  }

  async enqueueFormSubmission(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.HIGH,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'FORM_SUBMISSION', id, payload, priority);
  }

  /**
   * Enqueue a notification state-change action for offline-safe sync
   * (C29, audit 2026-04-20). `action` is MARK_READ | MARK_ALL_READ |
   * CLEAR_ALL. For MARK_READ the entityId is the notification id.
   * For MARK_ALL_READ / CLEAR_ALL, entityId is a synthetic token so
   * the queue rows are distinct.
   */
  async enqueueNotificationAction(
    entityId: string,
    action: 'MARK_READ' | 'MARK_ALL_READ' | 'CLEAR_ALL',
    payload: Record<string, unknown> = {},
    priority: number = SYNC_PRIORITY.LOW,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'NOTIFICATION_ACTION',
      entityId,
      { action, ...payload },
      priority,
    );
  }

  /**
   * Enqueue a profile-photo upload. Field-agent captures their own
   * photo via ProfilePhotoCaptureScreen; when offline the upload is
   * queued here and drained by ProfilePhotoSyncUploader on reconnect.
   *
   * `entityId` is the current user id so queue rows are distinct per
   * user on a shared device (plays well with C6 user-scope filters).
   * `localPath` is the on-device file:// path to the JPEG saved under
   * DocumentDirectoryPath/profile.
   */
  async enqueueProfilePhoto(
    userId: string,
    localPath: string,
    priority: number = SYNC_PRIORITY.LOW,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'PROFILE_PHOTO',
      userId,
      { localPath },
      priority,
    );
  }
}

export const SyncGateway = new SyncGatewayClass();
