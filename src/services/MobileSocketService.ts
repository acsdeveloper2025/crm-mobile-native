import { DeviceEventEmitter } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { DatabaseService } from '../database/DatabaseService';
import { ProjectionUpdater } from '../projections/ProjectionUpdater';
import { TaskRepository } from '../repositories/TaskRepository';
import { Logger } from '../utils/logger';
import { notificationService } from './NotificationService';
import { SessionStore } from './SessionStore';
import {
  handleLocationRequest,
  type LocationRequestData,
} from './LocationPingHandler';

const TAG = 'MobileSocketService';

/**
 * Phase 2.1 (2026-05-04) — WebSocket subscription for real-time
 * notifications on mobile. Mirrors the web `frontendSocketService`
 * pattern. Connects to backend's `user:${userId}` channel via
 * Socket.IO.
 *
 * Why both push AND WebSocket:
 * - **Push (FCM)**: works in background / quit state, but has 5-30s
 *   latency depending on FCM batching and the OS doze state.
 * - **WebSocket**: <1s latency when the app is foreground, but only
 *   while the app is open + network is up.
 *
 * The two paths produce duplicate `notification` arrivals. Dedupe
 * is by server-issued `notification.id` UUID (already keyed in
 * NotificationRepository.upsertBatch).
 *
 * On a `notification` event, we hand off to the same code path that
 * FCM foreground takes: insert into local cache + emit foreground
 * banner via `notificationService.emitForegroundNotification`.
 */
type IncomingNotificationPayload = {
  id: string;
  type: string;
  title: string;
  message: string;
  caseId?: string;
  caseNumber?: string;
  taskId?: string;
  taskNumber?: string;
  actionUrl?: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW' | string;
  timestamp?: string;
  createdAt?: string;
};

class MobileSocketServiceClass {
  private socket: Socket | null = null;
  private currentToken: string | null = null;

  /**
   * Connect using the access token from SessionStore. Idempotent —
   * a second call with the same token is a no-op.
   */
  async connect(): Promise<void> {
    const token = await SessionStore.getAccessToken();
    if (!token) {
      Logger.warn(TAG, 'No access token; skipping socket connect');
      return;
    }

    if (this.socket && this.currentToken === token && this.socket.connected) {
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.socket = io(config.wsUrl, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      Logger.info(TAG, 'Socket connected', { id: this.socket?.id });
    });
    this.socket.on('disconnect', reason => {
      Logger.info(TAG, `Socket disconnected: ${reason}`);
    });
    this.socket.on('connect_error', err => {
      Logger.warn(TAG, 'Socket connect_error', err);
    });

    this.socket.on('notification', (payload: IncomingNotificationPayload) => {
      this.handleIncoming(payload).catch(err => {
        Logger.warn(TAG, 'Failed to handle WS notification', err);
      });
    });

    // A-CRIT-1 chunk 5 (AUDIT 2026-05-17): listen for admin- or self-
    // initiated session revocations. If the payload's deviceId matches
    // ours, the current device's refresh token has been revoked
    // server-side — wipe Keychain + emit a navigation signal so
    // RootNavigator can route to login.
    this.socket.on(
      'auth:session_revoked',
      (payload: {
        type?: string;
        userId?: string;
        deviceId?: string | null;
        deviceLabel?: string | null;
      }) => {
        this.handleSessionRevoked(payload).catch(err => {
          Logger.warn(TAG, 'Failed to handle auth:session_revoked', err);
        });
      },
    );

    // Admin "Refresh" on the field-monitoring roster. Mirrors the FCM
    // LOCATION_REQUEST path but over the live socket — reliable when the
    // app is foregrounded (FCM data-messages get delayed/dropped under
    // Doze). Reuses handleLocationRequest; duplicate FCM+socket delivery
    // is idempotent via requestId.
    this.socket.on('location:request', (payload: LocationRequestData) => {
      handleLocationRequest(payload).catch(err => {
        Logger.warn(TAG, 'Failed to handle location:request', err);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
  }

  /**
   * Insert into local cache + emit foreground banner. Dedupe is
   * handled in NotificationRepository.upsertBatch (sticky-read +
   * upsert-by-id). If the same payload arrives via FCM ~1s later,
   * the upsert is a no-op for the row but the foreground banner
   * doesn't double-fire because we mark the id seen.
   */
  private recentlySeenIds = new Set<string>();
  private async handleIncoming(
    payload: IncomingNotificationPayload,
  ): Promise<void> {
    // B-147 (2026-05-16): TASK_REVOKED is a system event (no notification
    // row, no inbox entry) — route to the revoke handler instead of the
    // generic notification path. Triggered when admin/team-lead revokes
    // a task that's currently assigned to THIS field agent.
    if (payload?.type === 'TASK_REVOKED' && payload.taskId) {
      await this.handleRemoteRevoke(payload).catch(err => {
        Logger.warn(TAG, 'Failed to handle remote revoke', err);
      });
      return;
    }
    if (!payload?.id) {
      return;
    }
    if (this.recentlySeenIds.has(payload.id)) {
      return; // duplicate from FCM/WS race
    }
    this.recentlySeenIds.add(payload.id);
    // Trim the set so it doesn't grow forever; keep last ~200 ids.
    if (this.recentlySeenIds.size > 200) {
      const first = this.recentlySeenIds.values().next().value;
      if (first) {
        this.recentlySeenIds.delete(first);
      }
    }

    const ts =
      payload.timestamp || payload.createdAt || new Date().toISOString();
    const priority = normalizePriority(payload.priority);

    // Persist via the same path FCM uses — server-keyed id, sticky
    // read, foreground emit. Re-using upsertBackendNotifications
    // would require exposing it; simpler: addNotification with a
    // pre-set id. But addNotification uses uuidv4 internally.
    // Cleaner: upsertBatch with a single row.
    await notificationService.upsertSingleFromRealtime({
      id: payload.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      priority,
      taskId: payload.taskId ?? null,
      taskNumber: payload.taskNumber ?? null,
      caseNumber: payload.caseNumber ?? null,
      actionUrl: payload.actionUrl ?? null,
      createdAt: ts,
      updatedAt: ts,
    });

    notificationService.emitForegroundNotificationFromRealtime({
      id: payload.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      priority,
      taskId: payload.taskId ?? undefined,
      taskNumber: payload.taskNumber ?? undefined,
      caseNumber: payload.caseNumber ?? undefined,
      actionUrl: payload.actionUrl ?? undefined,
      timestamp: ts,
    });
  }

  /**
   * B-147 — handle a server-pushed TASK_REVOKED system event. Updates
   * the local task row, wipes attachments + form drafts + their FS
   * files, then emits a DeviceEventEmitter signal so any active
   * VerificationFormScreen for the same task can navigate away with
   * an alert.
   *
   * Idempotent: if the task is already REVOKED locally (caught earlier
   * via sync or duplicate WS), the UPDATE is still safe (re-stamps
   * revoke_reason / revoked_at) and wipeLocalTaskArtifacts is a no-op
   * on already-empty tables.
   */
  private async handleRemoteRevoke(
    payload: IncomingNotificationPayload & { reason?: string },
  ): Promise<void> {
    const taskId = payload.taskId!;
    const reason =
      (payload as { reason?: string }).reason || 'Revoked by backend';
    const now = new Date().toISOString();
    try {
      await DatabaseService.execute(
        `UPDATE tasks
           SET status = 'REVOKED',
               is_revoked = 1,
               is_saved = 0,
               revoke_reason = ?,
               revoked_at = ?,
               local_updated_at = ?
         WHERE id = ?`,
        [reason, now, now, taskId],
      );
      await TaskRepository.wipeLocalTaskArtifacts(taskId);
      // NC-1 (2026-05-16): rebuild dashboard + task-list projections so the
      // FE's home-screen counters reflect the revoked task immediately.
      // Mobile-initiated revoke path already does this via
      // TaskRepository.revokeTask → ProjectionUpdater.scheduleTaskRebuild;
      // the WS-pushed path was missing it (final-audit NC-1).
      await ProjectionUpdater.scheduleTaskRebuild(taskId);
      DeviceEventEmitter.emit('task:revoked-remotely', { taskId, reason });
      Logger.info(TAG, 'Handled remote revoke', { taskId, reason });
    } catch (err) {
      Logger.warn(TAG, 'Remote-revoke cleanup failed', err);
    }
  }

  /**
   * A-CRIT-1 chunk 5 (AUDIT 2026-05-17): handle admin/self session
   * revoke push. The backend emits to the user's WS room — every
   * device the user has logged in on receives this payload. We must
   * filter by deviceId so a sibling device's revoke doesn't log us
   * out too.
   *
   * Lazy-require AuthService to avoid the circular-import cycle that
   * already exists in this codebase (see AuthService line 358
   * "Lazy-require to avoid a circular import cycle").
   */
  private async handleSessionRevoked(payload: {
    deviceId?: string | null;
    deviceLabel?: string | null;
  }): Promise<void> {
    if (!payload?.deviceId) {
      // Legacy NULL-device session — no way to know if it's us.
      // Refresh-token 401 path will catch it on next API call.
      Logger.info(TAG, 'auth:session_revoked with NULL deviceId — ignoring');
      return;
    }
    let myDeviceId: string;
    try {
      const { AuthService } =
        require('./AuthService') as typeof import('./AuthService');
      const info = await AuthService.getDeviceInfo();
      myDeviceId = info.deviceId;
    } catch (err) {
      Logger.warn(
        TAG,
        'Could not resolve own deviceId — cannot match revoke push',
        err,
      );
      return;
    }

    if (payload.deviceId !== myDeviceId) {
      Logger.info(TAG, 'auth:session_revoked for sibling device — ignoring', {
        revokedDeviceId: payload.deviceId,
      });
      return;
    }

    Logger.info(TAG, 'auth:session_revoked matches us — wiping local session', {
      deviceLabel: payload.deviceLabel,
    });
    try {
      const { AuthService } =
        require('./AuthService') as typeof import('./AuthService');
      await AuthService.logout();
    } catch (err) {
      Logger.warn(TAG, 'AuthService.logout failed during forced revoke', err);
    }
    // Emit a signal RootNavigator / AuthContext listens for. Mirrors
    // the task:revoked-remotely event pattern above.
    DeviceEventEmitter.emit('auth:session-revoked-remotely', {
      deviceLabel: payload.deviceLabel,
    });
  }
}

const ALLOWED_PRIORITIES = [
  'NORMAL',
  'HIGH',
  'URGENT',
  'MEDIUM',
  'LOW',
] as const;
const normalizePriority = (
  raw: string | undefined,
): 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW' => {
  if (raw && (ALLOWED_PRIORITIES as readonly string[]).includes(raw)) {
    return raw as 'NORMAL' | 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
  }
  return 'MEDIUM';
};

export const mobileSocketService = new MobileSocketServiceClass();
