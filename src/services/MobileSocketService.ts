import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { notificationService } from './NotificationService';
import { SessionStore } from './SessionStore';

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
