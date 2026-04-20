import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import type { SyncUploadResult } from '../SyncUploadTypes';

const TAG = 'NotificationUploader';

/**
 * Uploads pending notification state-change actions enqueued by
 * NotificationService (C29, audit 2026-04-20). The action is stored on
 * the queue item's payload under `action` and, for MARK_READ,
 * `notificationId`.
 *
 * The existing SyncProcessor retry/DLQ machinery handles failure —
 * SUCCESS removes the item from the queue, FAILURE schedules a retry
 * with exponential backoff up to `max_attempts=10`.
 */
class NotificationUploaderClass {
  async upload(operation: SyncOperation): Promise<SyncUploadResult> {
    const action = String(operation.payload.action || '').toUpperCase();

    try {
      if (action === 'MARK_READ') {
        const notificationId = String(
          operation.payload.notificationId || operation.entityId || '',
        );
        if (!notificationId) {
          return {
            outcome: 'FAILURE',
            error: 'MARK_READ missing notificationId',
          };
        }
        await ApiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(notificationId));
        return { outcome: 'SUCCESS' };
      }

      if (action === 'MARK_ALL_READ') {
        await ApiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
        return { outcome: 'SUCCESS' };
      }

      if (action === 'CLEAR_ALL') {
        await ApiClient.delete(ENDPOINTS.NOTIFICATIONS.CLEAR_ALL);
        return { outcome: 'SUCCESS' };
      }

      return {
        outcome: 'FAILURE',
        error: `Unknown NOTIFICATION_ACTION: ${action}`,
      };
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err) || 'Unknown error';
      Logger.warn(TAG, `Notification action ${action} failed`, err);
      return {
        outcome: 'FAILURE',
        error: `Notification action ${action} failed: ${errorMsg}`,
      };
    }
  }
}

export const NotificationUploader = new NotificationUploaderClass();
