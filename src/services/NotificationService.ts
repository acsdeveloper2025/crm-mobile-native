import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { DatabaseService } from '../database/DatabaseService';
import { AuthService } from './AuthService';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const TAG = 'NotificationService';

export interface NotificationData {
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

type NotificationSubscriber = (notifications: NotificationData[]) => void;

class NotificationServiceImpl {
  private subscribers: Set<NotificationSubscriber> = new Set();
  private cache: NotificationData[] = [];

  /**
   * Initialize and load notifications from SQLite into memory
   */
  async loadFromDb(): Promise<void> {
    try {
      const rows = await DatabaseService.query<any>(
        'SELECT * FROM notifications ORDER BY timestamp DESC'
      );
      
      this.cache = rows.map(row => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        priority: row.priority,
        isRead: Boolean(row.is_read),
        taskId: row.task_id,
        caseNumber: row.case_number,
        actionUrl: row.action_url,
        timestamp: row.timestamp,
      }));
      
      this.notifySubscribers();
    } catch (e) {
      Logger.error(TAG, 'Failed to load notifications from DB', e);
    }
  }

  getNotifications(): NotificationData[] {
    return this.cache;
  }

  getUnreadCount(): number {
    return this.cache.filter((n) => !n.isRead).length;
  }

  subscribe(callback: NotificationSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getNotifications());
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    const data = this.getNotifications();
    this.subscribers.forEach((callback) => callback(data));
  }

  /**
   * Add a single notification directly to SQLite
   */
  async addNotification(notification: Omit<NotificationData, 'id' | 'isRead'>): Promise<string> {
    const id = uuidv4();
    try {
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
          notification.timestamp || new Date().toISOString()
        ]
      );
      await this.loadFromDb();
      return id;
    } catch (e) {
      Logger.error(TAG, 'Failed to add notification', e);
      return '';
    }
  }

  async markAsRead(id: string): Promise<void> {
    try {
      await ApiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
    } catch (e) {
      Logger.warn(TAG, `Failed to mark notification ${id} as read on backend`, e);
    }

    try {
      await DatabaseService.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
      await this.loadFromDb();
    } catch (e) {
      Logger.error(TAG, 'Failed to mark as read', e);
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      await ApiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    } catch (e) {
      Logger.warn(TAG, 'Failed to mark all notifications as read on backend', e);
    }

    try {
      await DatabaseService.execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
      await this.loadFromDb();
    } catch (e) {
      Logger.error(TAG, 'Failed to mark all read', e);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await ApiClient.delete(ENDPOINTS.NOTIFICATIONS.CLEAR_ALL);
    } catch (e) {
      Logger.warn(TAG, 'Failed to clear notifications on backend', e);
    }

    try {
      await DatabaseService.execute('DELETE FROM notifications');
      await this.loadFromDb();
    } catch (e) {
      Logger.error(TAG, 'Failed to clear all notifications', e);
    }
  }

  async registerCurrentDevice(enabled: boolean = true): Promise<void> {
    try {
      const deviceInfo = await AuthService.getDeviceInfo();
      await ApiClient.post(ENDPOINTS.NOTIFICATIONS.REGISTER, {
        deviceId: deviceInfo.deviceId,
        pushToken: deviceInfo.pushToken,
        platform: deviceInfo.platform,
        enabled,
      });
    } catch (e) {
      Logger.warn(TAG, 'Failed to register notification device', e);
    }
  }

  /**
   * Hook for network sync to dump backend payloads
   */
  async refreshFromBackend(): Promise<void> {
    try {
      const response = await ApiClient.get<{
        success: boolean;
        data?: Array<{
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
        }>;
      }>(`${ENDPOINTS.NOTIFICATIONS.LIST}?limit=100&offset=0`);

      if (!response.success || !response.data) {
        throw new Error('Invalid notifications response');
      }

      await DatabaseService.transaction(async tx => {
        await tx.executeSql('DELETE FROM notifications');

        for (const notification of response.data || []) {
          await tx.executeSql(
            `INSERT INTO notifications
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
              notification.updatedAt || notification.createdAt || new Date().toISOString(),
            ],
          );
        }
      });
    } catch (e) {
      Logger.warn(TAG, 'Failed to refresh notifications from backend; using local cache', e);
    }

    await this.loadFromDb();
  }
}

export const notificationService = new NotificationServiceImpl();
