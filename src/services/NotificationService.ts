import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { AuthService } from './AuthService';
import { PushTokenService } from './PushTokenService';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { NotificationRepository } from '../repositories/NotificationRepository';
import { SyncGateway } from './SyncGateway';
import { validateResponse } from '../api/schemas/runtime';
import { MobileNotificationListSchema } from '../api/schemas/sync.schema';
import {
  FcmRemoteMessageSchema,
  normalizeFcmType,
  sanitizeFcmActionUrl,
} from '../api/schemas/fcm.schema';

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
    remoteMessage: unknown,
    source: 'foreground' | 'opened' | 'initial',
  ): Promise<void> {
    try {
      // M4: validate the RemoteMessage shape before touching any
      // field. safeParse-based so a shape drift from FCM or the
      // backend notification builder surfaces as a warning in
      // telemetry instead of crashing the handler on a
      // .toUpperCase() of undefined.
      const parsed = FcmRemoteMessageSchema.safeParse(remoteMessage);
      if (!parsed.success) {
        Logger.warn(TAG, `Rejected malformed ${source} push notification`, {
          issues: parsed.error.issues.slice(0, 5),
        });
        return;
      }

      const data = parsed.data.data ?? {};
      const notification = parsed.data.notification ?? {};

      // M4: normalize type against the known allowlist. Unknown
      // enum values coerce to SYSTEM_NOTIFICATION so an attacker
      // cannot branch the handler via a crafted type like
      // 'CASE_ASSIGNED_ADMIN' that bypasses the dedupe check.
      const type = normalizeFcmType(data.type ?? data.notificationType);
      const taskId = data.taskId ?? data.verificationTaskId ?? null;
      const caseNumber =
        data.caseNumber != null
          ? String(data.caseNumber)
          : data.caseId != null
          ? String(data.caseId)
          : null;
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

      // M5: sanitize actionUrl against the scheme + host allowlist
      // (crmapp:// or https://crm.allcheckservices.com). Any other
      // value — raw http, phishing host, mailto:, javascript: —
      // is dropped to null and the notification still fires. This
      // protects any downstream Linking.openURL / in-app webview
      // that might consume actionUrl from the persisted record.
      const actionUrl = sanitizeFcmActionUrl(data.actionUrl);
      if (data.actionUrl && !actionUrl) {
        Logger.warn(TAG, 'Rejected FCM actionUrl not on allowlist', {
          rawSample: String(data.actionUrl).slice(0, 200),
        });
      }

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
          taskId: taskId ?? undefined,
          caseNumber: caseNumber ?? undefined,
          actionUrl: actionUrl ?? undefined,
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

  // C29 (audit 2026-04-20, Approach A): notification state-change actions
  // (mark-read, mark-all-read, clear-all) update local state immediately
  // for instant UI feedback, then enqueue the server call via the
  // SyncQueue pipeline. The SyncProcessor + NotificationUploader drain
  // the queue when online, with retry + DLQ handled by the existing
  // infrastructure (C11 gave us max_attempts=10 and DLQ telemetry).
  //
  // The sticky-read protection in NotificationRepository.upsertBatch
  // stops a subsequent server-refresh from clobbering the optimistic
  // local "read" before the queued MARK_READ has landed on the server.

  async markAsRead(id: string): Promise<void> {
    try {
      await NotificationRepository.markAsRead(id);
      this.markCacheAsRead(id);
    } catch (e) {
      Logger.error(TAG, 'Failed to mark as read locally', e);
      return;
    }

    try {
      await SyncGateway.enqueueNotificationAction(id, 'MARK_READ', {
        notificationId: id,
      });
    } catch (e) {
      // Enqueue should not realistically fail; storage-low surfaces as
      // a throw that the caller can retry, but local state has already
      // been updated so the user UX is intact.
      Logger.warn(TAG, `Failed to enqueue MARK_READ for notification ${id}`, e);
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      await NotificationRepository.markAllAsRead();
      this.markAllCacheAsRead();
    } catch (e) {
      Logger.error(TAG, 'Failed to mark all read locally', e);
      return;
    }

    try {
      await SyncGateway.enqueueNotificationAction(
        `mark_all_read_${Date.now()}`,
        'MARK_ALL_READ',
      );
    } catch (e) {
      Logger.warn(TAG, 'Failed to enqueue MARK_ALL_READ', e);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await NotificationRepository.clearAll();
      this.replaceCache([]);
    } catch (e) {
      Logger.error(TAG, 'Failed to clear all notifications locally', e);
      return;
    }

    try {
      await SyncGateway.enqueueNotificationAction(
        `clear_all_${Date.now()}`,
        'CLEAR_ALL',
      );
    } catch (e) {
      Logger.warn(TAG, 'Failed to enqueue CLEAR_ALL', e);
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
   * Hook for network sync to dump backend payloads.
   *
   * A8 (audit 2026-04-21 round 2): previously made a single call with
   * `limit=100&offset=0` — a field agent with >100 backlogged
   * notifications would lose the oldest ones. Now paginates in
   * 100-row pages up to a safety cap until `pagination.hasMore === false`.
   */
  async refreshFromBackend(): Promise<void> {
    type NotificationRow = {
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
    };

    const PAGE_LIMIT = 100;
    const MAX_PAGES = 10; // safety cap — 1000 notifications per refresh
    const collected: NotificationRow[] = [];

    try {
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await ApiClient.get<{
          success: boolean;
          data?: NotificationRow[];
          pagination?: { hasMore?: boolean };
        }>(
          `${ENDPOINTS.NOTIFICATIONS.LIST}?limit=${PAGE_LIMIT}&offset=${offset}`,
        );

        if (!response.success || !response.data) {
          throw new Error('Invalid notifications response');
        }

        validateResponse(MobileNotificationListSchema, response.data, {
          service: 'notifications',
          endpoint: 'GET /notifications',
        });

        collected.push(...response.data);

        const hasMore =
          Boolean(response.pagination?.hasMore) &&
          response.data.length === PAGE_LIMIT;
        if (!hasMore) {
          break;
        }
        offset += PAGE_LIMIT;
      }

      await this.upsertBackendNotifications(collected);

      const assignment = collected.find(
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
