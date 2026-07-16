import { DatabaseService } from '../database/DatabaseService';
import type { FcmPriority } from '../api/schemas/fcm.schema';

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  priority?: FcmPriority;
  isRead: boolean;
  taskId?: string;
  taskNumber?: string;
  caseNumber?: string;
  actionUrl?: string;
  timestamp: string;
}

type DbNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: FcmPriority;
  isRead: number;
  taskId: string | null;
  taskNumber: string | null;
  caseNumber: string | null;
  actionUrl: string | null;
  timestamp: string;
};

class NotificationRepositoryClass {
  // H11 (audit 2026-04-21): cap at 500. Notifications land via push +
  // periodic refresh; old ones eventually age out via cleanup, but a
  // long-lived install could accumulate thousands without an upstream
  // cap. The UI never renders more than ~100; 500 is a generous
  // ceiling before pagination would become meaningful.
  // T0.2 (Phase 1, 2026-05-08): all read paths filter `is_deleted = 0`.
  async listAll(): Promise<NotificationRecord[]> {
    const rows = await DatabaseService.query<DbNotification>(
      'SELECT * FROM notifications WHERE is_deleted = 0 ORDER BY timestamp DESC LIMIT 500',
    );
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      priority: row.priority,
      isRead: Boolean(row.isRead),
      taskId: row.taskId || undefined,
      taskNumber: row.taskNumber || undefined,
      caseNumber: row.caseNumber || undefined,
      actionUrl: row.actionUrl || undefined,
      timestamp: row.timestamp,
    }));
  }

  async existsByTypeAndTask(type: string, taskId: string): Promise<boolean> {
    const rows = await DatabaseService.query<{ id: string }>(
      'SELECT id FROM notifications WHERE type = ? AND task_id = ? AND is_deleted = 0 LIMIT 1',
      [type, taskId],
    );
    return rows.length > 0;
  }

  async upsertBatch(
    notifications: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      priority?: FcmPriority;
      isRead?: boolean;
      taskId?: string | null;
      taskNumber?: string | null;
      caseNumber?: string | null;
      actionUrl?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }>,
  ): Promise<void> {
    // C29 (audit 2026-04-20, Approach A): sticky-read. When the server
    // pull returns a notification we already marked read locally (the
    // MARK_READ may still be queued or in-flight), we must NOT downgrade
    // is_read from 1 to 0 — otherwise an offline user sees notifications
    // pop back to unread after reconnect. Upgrading 0 → 1 is always
    // fine. Rare server-side "re-unread" events are sacrificed for
    // offline correctness.
    //
    // T0.2 (Phase 1, 2026-05-08): sticky-cleared. If local row has
    // is_deleted=1 (user cleared it locally), SKIP re-insert from server.
    // Closes the "Clear All reappears on reopen" race: backend may not
    // have drained the queued DELETE yet when refreshFromBackend runs
    // again, but local sticky-cleared keeps cleared rows hidden.
    await DatabaseService.transaction(async tx => {
      for (const notification of notifications || []) {
        const existingResult = await tx.execute(
          'SELECT is_read, is_deleted, deleted_at FROM notifications WHERE id = ? LIMIT 1',
          [notification.id],
        );
        const existingRow =
          existingResult.rows.length > 0
            ? (existingResult.rows[0] as {
                is_read: number;
                is_deleted: number;
                deleted_at: string | null;
              })
            : null;

        // T0.2 sticky-cleared (Path 2 + buffer fix, 2026-05-08):
        // If local is_deleted=1 AND backend's updated_at is significantly
        // NEWER than local deleted_at (>60s buffer), treat as a true
        // backend restore (admin/support undo, hours later). Within 60s,
        // backend's updated_at could simply be the timestamp of the
        // backend-side soft-delete UPDATE itself catching up — that's a
        // race, NOT a restore. Buffer separates the two cleanly: races
        // complete within seconds, restores happen minutes/hours apart.
        if (existingRow && existingRow.is_deleted === 1) {
          const localDeletedAt = existingRow.deleted_at;
          const backendUpdated =
            notification.updatedAt || notification.createdAt;
          const RESTORE_BUFFER_MS = 60_000; // 60s
          const backendIsRestore = Boolean(
            localDeletedAt &&
              backendUpdated &&
              new Date(backendUpdated).getTime() >
                new Date(localDeletedAt).getTime() + RESTORE_BUFFER_MS,
          );
          if (!backendIsRestore) {
            continue; // keep sticky
          }
          // Fall through: backend-side restore; row will be re-inserted active.
        }

        const localIsRead = existingRow ? existingRow.is_read === 1 : false;
        const serverIsRead = Boolean(notification.isRead);
        const effectiveIsRead = localIsRead || serverIsRead ? 1 : 0;

        await tx.execute(
          `INSERT OR REPLACE INTO notifications
           (id, type, title, message, priority, is_read, task_id, task_number, case_number, action_url, timestamp, is_deleted, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
          [
            notification.id,
            notification.type,
            notification.title,
            notification.message,
            notification.priority || 'NORMAL',
            effectiveIsRead,
            notification.taskId || null,
            notification.taskNumber || null,
            notification.caseNumber || null,
            notification.actionUrl || null,
            notification.updatedAt ||
              notification.createdAt ||
              new Date().toISOString(),
          ],
        );
      }
    });
  }

  async insert(
    notification: Omit<NotificationRecord, 'id' | 'isRead'>,
    id: string,
  ): Promise<void> {
    // T0.4/T0.5 (Phase 1): if a row with this id was previously cleared
    // locally (is_deleted=1), SKIP this insert. Protects WS push + FCM
    // background paths from resurrecting cleared notifications.
    //
    // Path 2 extension (2026-05-08): allow restore when the incoming
    // notification timestamp is NEWER than the local deleted_at — that
    // indicates a backend-side restore/re-emit, not a stale race.
    const existing = await DatabaseService.query<{
      is_deleted: number;
      deleted_at: string | null;
    }>(
      'SELECT is_deleted, deleted_at FROM notifications WHERE id = ? LIMIT 1',
      [id],
    );
    if (existing.length > 0 && existing[0].is_deleted === 1) {
      const localDeletedAt = existing[0].deleted_at;
      const incomingTs = notification.timestamp;
      const RESTORE_BUFFER_MS = 60_000; // 60s — match upsertBatch buffer
      const incomingIsRestore = Boolean(
        localDeletedAt &&
          incomingTs &&
          new Date(incomingTs).getTime() >
            new Date(localDeletedAt).getTime() + RESTORE_BUFFER_MS,
      );
      if (!incomingIsRestore) {
        return; // keep sticky
      }
      // Fall through: legitimate restore.
    }
    await DatabaseService.execute(
      `INSERT OR REPLACE INTO notifications
      (id, type, title, message, priority, is_read, task_id, task_number, case_number, action_url, timestamp, is_deleted, deleted_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        id,
        notification.type,
        notification.title,
        notification.message,
        notification.priority || 'NORMAL',
        notification.taskId || null,
        notification.taskNumber || null,
        notification.caseNumber || null,
        notification.actionUrl || null,
        notification.timestamp || new Date().toISOString(),
      ],
    );
  }

  async markAsRead(id: string): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND is_deleted = 0',
      [id],
    );
  }

  async markAllAsRead(): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND is_deleted = 0',
    );
  }

  // T0.2 (Phase 1, 2026-05-08): soft-delete instead of DELETE.
  // Closes "Clear All reappears" race — local soft-delete is sticky;
  // upsertBatch + insert both check is_deleted before re-inserting.
  // Backend has its own soft-delete via the queued sync action.
  async clearAll(): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_deleted = 1, deleted_at = ? WHERE is_deleted = 0',
      [new Date().toISOString()],
    );
  }

  async deleteById(id: string): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_deleted = 1, deleted_at = ? WHERE id = ? AND is_deleted = 0',
      [new Date().toISOString(), id],
    );
  }

  // T0.2 (Phase 1): hard-DELETE rows soft-deleted >N days ago.
  // Wired into DataCleanupService.manualCleanup so no separate cron is needed.
  async purgeOldDeleted(olderThanDays: number = 7): Promise<number> {
    const cutoffIso = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const before = await DatabaseService.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?',
      [cutoffIso],
    );
    const count = before.length > 0 ? Number(before[0].n) || 0 : 0;
    if (count > 0) {
      await DatabaseService.execute(
        'DELETE FROM notifications WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?',
        [cutoffIso],
      );
    }
    return count;
  }
}

export const NotificationRepository = new NotificationRepositoryClass();
