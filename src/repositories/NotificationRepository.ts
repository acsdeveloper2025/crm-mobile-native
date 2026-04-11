import { DatabaseService } from '../database/DatabaseService';

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
  isRead: boolean;
  taskId?: string;
  caseNumber?: string;
  actionUrl?: string;
  timestamp: string;
}

type DbNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
  isRead: number;
  taskId: string | null;
  caseNumber: string | null;
  actionUrl: string | null;
  timestamp: string;
};

class NotificationRepositoryClass {
  async listAll(): Promise<NotificationRecord[]> {
    const rows = await DatabaseService.query<DbNotification>(
      'SELECT * FROM notifications ORDER BY timestamp DESC',
    );
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      priority: row.priority,
      isRead: Boolean(row.isRead),
      taskId: row.taskId || undefined,
      caseNumber: row.caseNumber || undefined,
      actionUrl: row.actionUrl || undefined,
      timestamp: row.timestamp,
    }));
  }

  async existsByTypeAndTask(type: string, taskId: string): Promise<boolean> {
    const rows = await DatabaseService.query<{ id: string }>(
      'SELECT id FROM notifications WHERE type = ? AND task_id = ? LIMIT 1',
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
      priority?: 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
      isRead?: boolean;
      taskId?: string | null;
      caseNumber?: string | null;
      actionUrl?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }>,
  ): Promise<void> {
    await DatabaseService.transaction(async tx => {
      for (const notification of notifications || []) {
        await tx.executeSql(
          `INSERT OR REPLACE INTO notifications
           (id, type, title, message, priority, is_read, task_id, case_number, action_url, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            notification.id,
            notification.type,
            notification.title,
            notification.message,
            notification.priority || 'NORMAL',
            notification.isRead ? 1 : 0,
            notification.taskId || null,
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
    await DatabaseService.execute(
      `INSERT INTO notifications
      (id, type, title, message, priority, is_read, task_id, case_number, action_url, timestamp)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        id,
        notification.type,
        notification.title,
        notification.message,
        notification.priority || 'NORMAL',
        notification.taskId || null,
        notification.caseNumber || null,
        notification.actionUrl || null,
        notification.timestamp || new Date().toISOString(),
      ],
    );
  }

  async markAsRead(id: string): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [id],
    );
  }

  async markAllAsRead(): Promise<void> {
    await DatabaseService.execute(
      'UPDATE notifications SET is_read = 1 WHERE is_read = 0',
    );
  }

  async clearAll(): Promise<void> {
    await DatabaseService.execute('DELETE FROM notifications');
  }
}

export const NotificationRepository = new NotificationRepositoryClass();
