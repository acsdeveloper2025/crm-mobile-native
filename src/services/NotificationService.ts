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
  /**
   * Phase 1.2e (2026-05-04): human-readable task identifier (e.g.
   * "VT-000017") shown alongside `caseNumber` in NotificationCenter
   * row label. Both FIELD verification and KYC tasks share the same
   * `verification_tasks.task_number` sequence on backend.
   */
  taskNumber?: string;
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

// Phase 1.1 (2026-05-04): foreground-banner observer. Distinct from the
// `subscribers` set above, which fires on EVERY cache change (including
// mark-read). Foreground listeners fire ONLY when an FCM push arrives
// while the app is in foreground — that's the trigger for the
// WhatsApp-style toast banner.
export interface ForegroundNotificationPayload {
  id: string;
  type: NotificationData['type'];
  title: string;
  message: string;
  priority: NotificationData['priority'];
  taskId?: string;
  taskNumber?: string;
  caseNumber?: string;
  actionUrl?: string;
  timestamp: string;
}
export type ForegroundNotificationListener = (
  payload: ForegroundNotificationPayload,
) => void;

class NotificationServiceImpl {
  private subscribers: Set<NotificationSubscriber> = new Set();
  private foregroundListeners: Set<ForegroundNotificationListener> = new Set();
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

  /**
   * Phase 2.1 (2026-05-04): public hook for the WebSocket service to
   * persist a single incoming notification using the same sticky-read
   * upsert path as `refreshFromBackend`. Distinct from
   * `addNotification` (which generates a new uuid) — the WS payload
   * already has a server-issued id we must preserve so dedupe with
   * FCM works.
   */
  async upsertSingleFromRealtime(notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    priority?: 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
    isRead?: boolean;
    taskId?: string | null;
    taskNumber?: string | null;
    caseNumber?: string | null;
    actionUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }): Promise<void> {
    await this.upsertBackendNotifications([notification]);
  }

  /**
   * Phase 2.1: public hook for the WebSocket service to fire the
   * foreground banner. Mirrors the FCM 'foreground' branch in
   * handleIncomingRemoteMessage.
   */
  emitForegroundNotificationFromRealtime(
    payload: ForegroundNotificationPayload,
  ): void {
    this.emitForegroundNotification(payload);
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

  /**
   * Subscribe to foreground push arrivals. Fires ONLY when an FCM push
   * (or backend WebSocket if/when wired) arrives while the app is in
   * foreground. Returns unsubscribe function.
   *
   * Used by ForegroundNotificationBanner to slide down a toast on
   * incoming notification — WhatsApp-style. Distinct from `subscribe`
   * (which fires on every cache change incl. mark-read / refresh).
   */
  onForegroundNotification(
    listener: ForegroundNotificationListener,
  ): () => void {
    this.foregroundListeners.add(listener);
    return () => this.foregroundListeners.delete(listener);
  }

  private emitForegroundNotification(
    payload: ForegroundNotificationPayload,
  ): void {
    this.foregroundListeners.forEach(listener => {
      try {
        listener(payload);
      } catch (error) {
        Logger.warn(TAG, 'Foreground notification listener crashed', error);
      }
    });
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

  private removeFromCache(id: string): void {
    this.replaceCache(this.cache.filter(item => item.id !== id));
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
      taskNumber?: string | null;
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
        taskNumber: notification.taskNumber || undefined,
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
      // Phase 1.2e: capture human-readable task identifier (e.g.
      // VT-000017). Backend pushes it in `data.taskNumber`; legacy
      // payloads may use `data.verificationTaskNumber` instead.
      const taskNumber =
        data.taskNumber != null
          ? String(data.taskNumber)
          : data.verificationTaskNumber != null
          ? String(data.verificationTaskNumber)
          : null;
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

      const insertedTimestamp = new Date().toISOString();
      let insertedId: string | null = null;
      if (shouldInsertNotification) {
        insertedId = await this.addNotification({
          type,
          title,
          message,
          priority,
          taskId: taskId ?? undefined,
          taskNumber: taskNumber ?? undefined,
          caseNumber: caseNumber ?? undefined,
          actionUrl: actionUrl ?? undefined,
          timestamp: insertedTimestamp,
        });
      }

      // Phase 1.1 (2026-05-04): emit foreground banner ONLY when source is
      // 'foreground' (i.e. push arrived while app was open). 'opened' and
      // 'initial' come from the user already tapping the OS-level
      // notification, so the system banner already showed and we should
      // NOT re-banner. Listener is best-effort (no listeners = no-op).
      if (source === 'foreground') {
        this.emitForegroundNotification({
          id: insertedId || `${type}-${Date.now()}`,
          type,
          title,
          message,
          priority,
          taskId: taskId ?? undefined,
          taskNumber: taskNumber ?? undefined,
          caseNumber: caseNumber ?? undefined,
          actionUrl: actionUrl ?? undefined,
          timestamp: insertedTimestamp,
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

  /**
   * Phase 3.2 (2026-05-04): WhatsApp-style mute for the current task.
   * Mute is online-only — no offline queue, no SQLite persistence.
   * Backend's `getScopedNotificationRows` filter takes effect on the
   * next /notifications fetch, so the bell badge silences within
   * one refresh cycle. Re-muting an active mute refreshes
   * `expires_at` server-side (UPSERT) — idempotent.
   */
  async muteTask(taskId: string, expiresAt?: string | null): Promise<void> {
    try {
      await ApiClient.post(ENDPOINTS.NOTIFICATIONS.MUTE, {
        taskId,
        expiresAt: expiresAt ?? null,
      });
    } catch (e) {
      Logger.warn(TAG, 'Failed to mute task', e);
      throw e;
    }
  }

  async unmuteTask(taskId: string): Promise<void> {
    try {
      await ApiClient.delete(ENDPOINTS.NOTIFICATIONS.UNMUTE_TASK(taskId));
    } catch (e) {
      Logger.warn(TAG, 'Failed to unmute task', e);
      throw e;
    }
  }

  /**
   * Returns the active mute records for the current user. Used by
   * TaskDetailScreen header to render the right Mute / Unmute icon
   * state. Cached in-memory by the caller (~30s) to avoid round-trip
   * on every render.
   */
  async listMutes(): Promise<
    Array<{
      id: string;
      caseId: string | null;
      taskId: string | null;
      createdAt: string;
      expiresAt: string | null;
    }>
  > {
    try {
      const res = await ApiClient.get<{
        success: boolean;
        data: Array<{
          id: string;
          caseId: string | null;
          taskId: string | null;
          createdAt: string;
          expiresAt: string | null;
        }>;
      }>(ENDPOINTS.NOTIFICATIONS.LIST_MUTES);
      return res?.data ?? [];
    } catch (e) {
      Logger.warn(TAG, 'Failed to list mutes', e);
      return [];
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
      taskNumber?: string | null;
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

      // Mobile sync gap fix (2026-05-07): backend filters reads with
      // `is_deleted=false` per Phase 2.2 soft-delete (project_whatsapp_notification_parity_2026_05_03.md).
      // Mobile previously kept stale rows in local SQLite from before the
      // soft-delete; tap → 404 on `/notifications/:id/read`. Reconcile by
      // dropping local rows that backend stopped returning, bounded to the
      // synced window so a >1000-notif backlog isn't truncated.
      if (collected.length > 0) {
        const collectedIds = new Set(collected.map(n => n.id));
        const oldestCollectedTs = collected
          .map(n => n.updatedAt || n.createdAt || '')
          .filter(t => t)
          .sort()[0];
        if (oldestCollectedTs) {
          const localRows = await NotificationRepository.listAll();
          const stale = localRows.filter(
            r => r.timestamp >= oldestCollectedTs && !collectedIds.has(r.id),
          );
          for (const row of stale) {
            try {
              await NotificationRepository.deleteById(row.id);
              this.removeFromCache(row.id);
            } catch (err) {
              Logger.warn(
                TAG,
                `Failed to drop stale notification ${row.id}`,
                err,
              );
            }
          }
          if (stale.length > 0) {
            Logger.info(
              TAG,
              `Reconciled ${stale.length} stale notifications (backend soft-deleted)`,
            );
          }
        }
      }

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
