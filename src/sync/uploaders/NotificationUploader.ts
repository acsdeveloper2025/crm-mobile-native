import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import type { SyncOperation } from '../SyncOperationLog';
import { idempotencyHeaders, type SyncUploadResult } from '../SyncUploadTypes';

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

    // 2026-04-27 deep-audit fix: every action now ships an Idempotency-Key
    // header. MARK_READ retry was already idempotent server-side (read state
    // is monotonic), but MARK_ALL_READ + CLEAR_ALL retried after a network
    // drop on the response could clobber notifications received between the
    // original call and the retry. Backend's `mobile_idempotency_keys`
    // cache returns the cached 2xx body on replay, fully closing the race.
    //
    // 2026-05-02: removed wrap-and-return-FAILURE catch. SyncProcessor only
    // classifies errors as RETRYABLE/NON-RETRYABLE when the uploader THROWS;
    // returning {outcome:'FAILURE'} skipped that classifier and made every
    // 4xx (incl. 404 on a server-deleted notification) retry 10× before DLQ.
    // Now: 404 on MARK_READ is treated as SUCCESS (the notification is gone
    // server-side; marking it read is a no-op), and all other errors propagate
    // so SyncProcessor's 4xx→DLQ / 5xx→retry policy runs.
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
      try {
        await ApiClient.put(
          ENDPOINTS.NOTIFICATIONS.MARK_READ(notificationId),
          undefined,
          idempotencyHeaders(operation.operationId),
        );
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404) {
          Logger.info(
            TAG,
            `MARK_READ ${notificationId} → 404 (notification gone server-side); treating as success`,
          );
          return { outcome: 'SUCCESS' };
        }
        throw err;
      }
      return { outcome: 'SUCCESS' };
    }

    if (action === 'MARK_ALL_READ') {
      await ApiClient.put(
        ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ,
        undefined,
        idempotencyHeaders(operation.operationId),
      );
      return { outcome: 'SUCCESS' };
    }

    if (action === 'CLEAR_ALL') {
      await ApiClient.delete(
        ENDPOINTS.NOTIFICATIONS.CLEAR_ALL,
        idempotencyHeaders(operation.operationId),
      );
      return { outcome: 'SUCCESS' };
    }

    return {
      outcome: 'FAILURE',
      error: `Unknown NOTIFICATION_ACTION: ${action}`,
    };
  }
}

export const NotificationUploader = new NotificationUploaderClass();
