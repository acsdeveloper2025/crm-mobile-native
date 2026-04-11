import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { AuthService } from './AuthService';
import { PushTokenService } from './PushTokenService';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { validateResponse } from '../api/schemas/runtime';
import { MobileNotificationListSchema } from '../api/schemas/sync.schema';

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
type AssignmentSyncTrigger = {
  type: string;
  taskId?: string | null;
  source: 'foreground' | 'opened' | 'initial' | 'backend-refresh' | 'queued';
};
type AssignmentSyncHandler = (
  trigger: AssignmentSyncTrigger,
) => Promise<void> | void;

class NotificationServiceImpl {
  private subscribers: Set<NotificationSubscriber> = new Set();
  private cache: NotificationData[] = [];
  private loaded = false;
  private listenersInitialized = false;
  private foregroundUnsubscribe: (() => void) | null = null;
  private assignmentSyncHandler: AssignmentSyncHandler | null = null;
  private assignmentSyncInFlight = false;
  private assignmentSyncQueued = false;
  private lastAssignmentSyncAt = 0;
  private queuedSyncTimeout: ReturnType<typeof setTimeout> | null = null;

  private static readonly ASSIGNMENT_SYNC_THROTTLE_MS = 8000;

  /**
   * Initialize and load notifications from SQLite into memory
   */
  async loadFromDb(force: boolean = false): Promise<void> {
    if (this.loaded && !force) {
      return;
    }
    try {
      this.cache = this.sortNotifications(
        await NotificationRepository.listAll(),
      );
      this.loaded = true;
      this.notifySubscribers();
    } catch (e) {
      Logger.error(TAG, 'Failed to load notifications from DB', e);
    }
  }

  async ensureLoaded(): Promise<void> {
    await this.loadFromDb();
  }

  getNotifications(): NotificationData[] {
    return this.cache;
  }

  getUnreadCount(): number {
    return this.cache.filter(n => !n.isRead).length;
  }

  subscribe(callback: NotificationSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getNotifications());
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    const data = [...this.cache];
    this.subscribers.forEach(callback => callback(data));
  }

  private sortNotifications(
    notifications: NotificationData[],
  ): NotificationData[] {
    return [...notifications].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp),
    );
  }

  private replaceCache(notifications: NotificationData[]): void {
    this.cache = this.sortNotifications(notifications);
    this.loaded = true;
    this.notifySubscribers();
  }

  private upsertIntoCache(notification: NotificationData): void {
    const next = this.cache.filter(item => item.id !== notification.id);
    next.push(notification);
    this.replaceCache(next);
  }

  private mergeIntoCache(notifications: NotificationData[]): void {
    const map = new Map(this.cache.map(item => [item.id, item]));
    notifications.forEach(notification => {
      map.set(notification.id, notification);
    });
    this.replaceCache(Array.from(map.values()));
  }

  private markCacheAsRead(id: string): void {
    this.replaceCache(
      this.cache.map(notification =>
        notification.id === id
          ? { ...notification, isRead: true }
          : notification,
      ),
    );
  }

  private markAllCacheAsRead(): void {
    this.replaceCache(
      this.cache.map(notification => ({ ...notification, isRead: true })),
    );
  }

  private toNotificationPriority(
    priority: unknown,
  ): NotificationData['priority'] {
    const normalized = String(priority ?? 'NORMAL').toUpperCase();
    if (
      normalized === 'URGENT' ||
      normalized === 'HIGH' ||
      normalized === 'MEDIUM' ||
      normalized === 'LOW'
    ) {
      return normalized;
    }
    return 'NORMAL';
  }

  private async hasNotificationForTask(
    type: string,
    taskId?: string | null,
  ): Promise<boolean> {
    if (!taskId) {
      return false;
    }
    return NotificationRepository.existsByTypeAndTask(type, taskId);
  }

  private async upsertBackendNotifications(
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
    await NotificationRepository.upsertBatch(notifications);
    this.mergeIntoCache(
      (notifications || []).map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        priority: this.toNotificationPriority(notification.priority),
        isRead: Boolean(notification.isRead),
        taskId: notification.taskId || undefined,
        caseNumber: notification.caseNumber || undefined,
        actionUrl: notification.actionUrl || undefined,
        timestamp:
          notification.updatedAt ||
          notification.createdAt ||
          new Date().toISOString(),
      })),
    );
  }

  private async handleIncomingRemoteMessage(
    remoteMessage: any,
    source: 'foreground' | 'opened' | 'initial',
  ): Promise<void> {
    try {
      const data =
        (remoteMessage && typeof remoteMessage === 'object'
          ? remoteMessage.data
          : null) || {};
      const notification =
        (remoteMessage && typeof remoteMessage === 'object'
          ? remoteMessage.notification
          : null) || {};
      const type = String(
        data.type || data.notificationType || 'SYSTEM_NOTIFICATION',
      );
      const taskId = data.taskId || data.verificationTaskId || null;
      const caseNumber = data.caseNumber || data.caseId || null;
      const title = String(data.title || notification.title || 'Notification');
      const message = String(
        data.message ||
          data.body ||
          notification.body ||
          'You have a new update.',
      );
      const priority = this.toNotificationPriority(
        data.priority || data.severity,
      );

      let shouldInsertNotification = true;
      if (type === 'CASE_ASSIGNED' && taskId) {
        const alreadyExists = await this.hasNotificationForTask(type, taskId);
        shouldInsertNotification = !alreadyExists;
      }

      if (shouldInsertNotification) {
        await this.addNotification({
          type,
          title,
          message,
          priority,
          taskId,
          caseNumber,
          actionUrl: data.actionUrl || null,
          timestamp: new Date().toISOString(),
        });
      }

      if (type === 'CASE_ASSIGNED' || type === 'CASE_REASSIGNED') {
        await this.triggerAssignmentSync({ type, taskId, source });
      }

      Logger.info(TAG, `Handled ${source} push notification`, {
        type,
        taskId,
        caseNumber,
      });
    } catch (error) {
      Logger.warn(TAG, `Failed handling ${source} push notification`, error);
    }
  }

  setAssignmentSyncHandler(handler: AssignmentSyncHandler | null): void {
    this.assignmentSyncHandler = handler;
  }

  private async triggerAssignmentSync(
    trigger: AssignmentSyncTrigger,
  ): Promise<void> {
    if (!this.assignmentSyncHandler) {
      return;
    }

    const now = Date.now();
    if (
      now - this.lastAssignmentSyncAt <
        NotificationServiceImpl.ASSIGNMENT_SYNC_THROTTLE_MS &&
      !this.assignmentSyncInFlight
    ) {
      return;
    }

    if (this.assignmentSyncInFlight) {
      this.assignmentSyncQueued = true;
      return;
    }

    this.assignmentSyncInFlight = true;
    this.lastAssignmentSyncAt = now;

    try {
      await this.assignmentSyncHandler(trigger);
    } catch (error) {
      Logger.warn(TAG, 'Immediate assignment sync trigger failed', error);
    } finally {
      this.assignmentSyncInFlight = false;
    }

    if (this.assignmentSyncQueued) {
      this.assignmentSyncQueued = false;
      if (this.queuedSyncTimeout) {
        clearTimeout(this.queuedSyncTimeout);
      }
      this.queuedSyncTimeout = setTimeout(() => {
        this.triggerAssignmentSync({
          ...trigger,
          source: 'queued',
        }).catch(error => {
          Logger.warn(TAG, 'Queued assignment sync trigger failed', error);
        });
        this.queuedSyncTimeout = null;
      }, 400);
    }
  }

  initializePushListeners(): void {
    if (this.listenersInitialized) {
      return;
    }
    this.listenersInitialized = true;

    try {
      const messagingModule = require('@react-native-firebase/messaging');
      if (!messagingModule?.getMessaging) {
        Logger.warn(
          TAG,
          'FCM messaging module unavailable for notification listeners.',
        );
        return;
      }

      const messaging = messagingModule.getMessaging();

      if (typeof messagingModule.onMessage === 'function') {
        this.foregroundUnsubscribe = messagingModule.onMessage(
          messaging,
          (message: any) => {
            this.handleIncomingRemoteMessage(message, 'foreground');
          },
        );
      }

      if (typeof messagingModule.onNotificationOpenedApp === 'function') {
        messagingModule.onNotificationOpenedApp(messaging, (message: any) => {
          this.handleIncomingRemoteMessage(message, 'opened');
        });
      }

      if (typeof messagingModule.getInitialNotification === 'function') {
        messagingModule
          .getInitialNotification(messaging)
          .then((message: any) => {
            if (message) {
              this.handleIncomingRemoteMessage(message, 'initial');
            }
          })
          .catch((error: unknown) => {
            Logger.warn(TAG, 'Failed to read initial notification', error);
          });
      }
    } catch (error) {
      Logger.warn(TAG, 'Unable to initialize FCM listeners', error);
    }
  }

  destroyPushListeners(): void {
    if (this.foregroundUnsubscribe) {
      try {
        this.foregroundUnsubscribe();
      } catch (error) {
        Logger.warn(TAG, 'Failed to cleanup foreground FCM listener', error);
      }
      this.foregroundUnsubscribe = null;
    }
    if (this.queuedSyncTimeout) {
      clearTimeout(this.queuedSyncTimeout);
      this.queuedSyncTimeout = null;
    }
    this.listenersInitialized = false;
  }

  /**
   * Add a single notification directly to SQLite
   */
  async addNotification(
    notification: Omit<NotificationData, 'id' | 'isRead'>,
  ): Promise<string> {
    const id = uuidv4();
    try {
      await NotificationRepository.insert(notification, id);
      this.upsertIntoCache({
        id,
        isRead: false,
        ...notification,
      });
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
      Logger.warn(
        TAG,
        `Failed to mark notification ${id} as read on backend`,
        e,
      );
    }

    try {
      await NotificationRepository.markAsRead(id);
      this.markCacheAsRead(id);
    } catch (e) {
      Logger.error(TAG, 'Failed to mark as read', e);
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      await ApiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    } catch (e) {
      Logger.warn(
        TAG,
        'Failed to mark all notifications as read on backend',
        e,
      );
    }

    try {
      await NotificationRepository.markAllAsRead();
      this.markAllCacheAsRead();
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
      await NotificationRepository.clearAll();
      this.replaceCache([]);
    } catch (e) {
      Logger.error(TAG, 'Failed to clear all notifications', e);
    }
  }

  async registerCurrentDevice(enabled: boolean = true): Promise<void> {
    try {
      const deviceInfo = await AuthService.getDeviceInfo();
      const pushToken = await PushTokenService.getPushToken();
      if (!pushToken) {
        Logger.warn(
          TAG,
          'Push token unavailable. Skipping notification device registration for now.',
        );
        return;
      }

      await ApiClient.post(ENDPOINTS.NOTIFICATIONS.REGISTER, {
        deviceId: deviceInfo.deviceId,
        pushToken,
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

      validateResponse(MobileNotificationListSchema, response.data, {
        service: 'notifications',
        endpoint: 'GET /notifications',
      });

      await this.upsertBackendNotifications(response.data || []);

      const assignment = (response.data || []).find(
        item =>
          (item.type === 'CASE_ASSIGNED' || item.type === 'CASE_REASSIGNED') &&
          item.taskId,
      );
      if (assignment) {
        await this.triggerAssignmentSync({
          type: assignment.type,
          taskId: assignment.taskId || null,
          source: 'backend-refresh',
        });
      }
    } catch (e) {
      Logger.warn(
        TAG,
        'Failed to refresh notifications from backend; using local cache',
        e,
      );
    }

    await this.ensureLoaded();
  }
}

export const notificationService = new NotificationServiceImpl();
