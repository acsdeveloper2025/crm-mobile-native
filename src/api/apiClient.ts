// API Client - Axios instance with auth token injection and refresh logic
// All API calls go through this client
//
// SECURITY: Certificate Pinning (T0-9, closed 2026-05-18)
// Pinning is enforced natively on both platforms — no library required.
//   - Android: android/app/src/main/res/xml/network_security_config.xml
//     (<pin-set> on crm.allcheckservices.com; cleartext blocked globally)
//   - iOS:     ios/CrmMobileNative/Info.plist NSPinnedDomains entry
//     (Apple-native SPKI pinning, iOS 14+; deployment target is 15.1)
// Both pin the SAME two SPKI SHA-256 hashes (refreshed 2026-06-18): the
// current leaf cert AND the ISRG Root X1 trust anchor (durable — survives
// Let's Encrypt leaf/intermediate rotation). Rotation procedure is in
// docs/ssl-pinning.md. App-level code requires no changes — axios
// flows through NSURLSession (iOS) / OkHttp (Android) which both
// enforce the OS-level pins automatically.

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { SessionStore } from '../services/SessionStore';
import { TimeService } from '../services/TimeService';
import { NetworkService } from '../services/NetworkService';
import { buildTraceparent } from './tracing';

// ADR-0054 Phase 5 (app cutover, 2026-06-20): the v1-envelope adapter
// (`normalizeV2Envelope` / `normalizeV2Error`) was REMOVED. The backend is now
// fully v2-native, so every consumer reads the endpoint's native v2 shape
// DIRECTLY:
//   - success bodies arrive bare (e.g. POST /auth/login -> { user, tokens, ... },
//     POST /auth/refresh -> { tokens }, GET /notifications -> { items, totalCount,
//     page, pageSize }, the verification lifecycle -> a bare CaseTaskView, etc.)
//     or, for the two web-shared reference feeds + /consents/accept, still the
//     real backend `{ success, data }` (verified against the crm2 service — that
//     wrapper is emitted by the backend itself, NOT this adapter).
//   - on a 4xx/5xx axios rejects with the RAW v2 error body
//     `{ error: "<CODE>", details?, issues? }` (NOT the v1 `{ success:false,
//     error:{ code }, message }`). Consumers read `error.response.data.error`
//     (the CODE string) and map it to a message app-side.
//   - /health and /time were always bare top-level reads (response.status /
//     .epochMs) and keep working untouched now there is no wrapper.

type RefreshHandler = () => Promise<string | null>;
type UnauthorizedHandler = () => Promise<void> | void;

interface RefreshSubscriber {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

/**
 * Maximum number of concurrent requests that can wait on a single in-flight
 * token refresh. Bounding the queue prevents unbounded memory growth if the
 * refresh endpoint hangs — the surplus requests fail fast with a clear error
 * instead of leaking forever.
 */
const MAX_REFRESH_SUBSCRIBERS = 64;

/**
 * Hard timeout for a token refresh cycle. If the refresh does not complete
 * within this window, all queued subscribers are rejected and the client is
 * handed over to the unauthorized handler (typically forcing a logout).
 */
const REFRESH_TIMEOUT_MS = 20000;

class ApiClientClass {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: RefreshSubscriber[] = [];
  private refreshHandler: RefreshHandler | null = null;
  private unauthorizedHandler: UnauthorizedHandler | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': config.platform,
        'X-App-Version': config.appVersion,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - attach auth token
    this.client.interceptors.request.use(
      async (requestConfig: InternalAxiosRequestConfig) => {
        // Axios types say `headers` is always present, but runtime can
        // deliver undefined when callers pass custom configs that don't
        // spread defaults (happened in AttachmentService.downloadAndCache
        // before — C17 audit finding). Materialize an AxiosHeaders
        // instance so downstream writes can't silently no-op.
        if (!requestConfig.headers) {
          requestConfig.headers = new AxiosHeaders();
        }

        const token = await SessionStore.getAccessToken();
        if (token) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
        }

        // W3C Trace Context propagation (Phase F1 follow-up).
        // Every outbound mobile request gets a fresh traceparent so
        // the backend server span inherits a parent trace-id. If a
        // caller has already set traceparent explicitly we do not
        // overwrite it — that lets future in-app span creation
        // piggyback on the same interceptor.
        if (!requestConfig.headers.traceparent) {
          requestConfig.headers.traceparent = buildTraceparent();
        }

        Logger.debug(
          'ApiClient',
          `${requestConfig.method?.toUpperCase()} ${requestConfig.url}`,
        );

        return requestConfig;
      },
      (error: AxiosError) => {
        Logger.error('ApiClient', 'Request interceptor error', error);
        return Promise.reject(error);
      },
    );

    // Response interceptor - handle 401 (token refresh) and sample
    // server time for clock-skew tracking (Phase D5).
    this.client.interceptors.response.use(
      response => {
        const headers = response.headers ?? {};
        const dateHeader =
          (headers as Record<string, unknown>).date ??
          (headers as Record<string, unknown>).Date;
        const headerValue = Array.isArray(dateHeader)
          ? dateHeader[0]
          : dateHeader;
        const serverMs = TimeService.parseDateHeader(
          typeof headerValue === 'string' ? headerValue : null,
        );
        if (serverMs != null) {
          TimeService.recordServerTime(serverMs);
        }
        // F-MD7 (audit 2026-04-28 deeper): captive-portal detection.
        // /api/* responses MUST be JSON. A `text/html` content-type
        // means a Wi-Fi captive portal intercepted the call and
        // returned a sign-in page; the response body parses as junk
        // and breaks every downstream consumer. Notify NetworkService
        // subscribers so the UI can surface "open browser to sign in
        // to Wi-Fi" instead of a generic parse error.
        const contentType =
          (headers as Record<string, unknown>)['content-type'] ??
          (headers as Record<string, unknown>)['Content-Type'];
        const ctValue = Array.isArray(contentType)
          ? contentType[0]
          : contentType;
        if (
          typeof ctValue === 'string' &&
          ctValue.toLowerCase().startsWith('text/html') &&
          (response.config?.url || '').includes('/api/')
        ) {
          NetworkService.notifyCaptivePortal();
        }
        // ADR-0054 Phase 5: the app is v2-native — response.data is the
        // endpoint's bare backend shape, consumed directly. No envelope rewrite.
        return response;
      },
      async (error: AxiosError) => {
        // ADR-0054 Phase 5: error.response.data is the RAW v2 error body
        // `{ error: "<CODE>", details?, issues? }`, consumed directly. No rewrite.

        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };
        const requestUrl = error.config?.url || '';
        const requestMethod = (error.config?.method || '').toUpperCase();
        const isAuthLogin = requestUrl.includes('/auth/login');
        const isAuthRefresh = requestUrl.includes('/auth/refresh');

        // If 401 and haven't retried yet, try refreshing the token
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !isAuthLogin &&
          !isAuthRefresh
        ) {
          if (this.isRefreshing) {
            if (this.refreshSubscribers.length >= MAX_REFRESH_SUBSCRIBERS) {
              Logger.warn(
                'ApiClient',
                `Refresh subscriber queue is full (${MAX_REFRESH_SUBSCRIBERS}); rejecting request`,
              );
              return Promise.reject(
                new Error(
                  'REFRESH_QUEUE_FULL: too many requests waiting on token refresh',
                ),
              );
            }
            // Queue this request until token is refreshed
            return new Promise((resolve, reject) => {
              this.refreshSubscribers.push({
                resolve: (token: string) => {
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                  }
                  resolve(this.client(originalRequest));
                },
                reject,
              });
            });
          }

          if (!this.refreshHandler) {
            if (this.unauthorizedHandler) {
              await this.unauthorizedHandler();
            }
            return Promise.reject(error);
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.runRefreshWithTimeout(
              this.refreshHandler,
            );
            if (newToken) {
              this.resolveRefreshSubscribers(newToken);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return this.client(originalRequest);
            }

            const refreshFailure = new Error('Token refresh returned no token');
            this.rejectRefreshSubscribers(refreshFailure);
            if (this.unauthorizedHandler) {
              await this.unauthorizedHandler();
            }
            return Promise.reject(refreshFailure);
          } catch (refreshError) {
            // Expected when the refresh token is expired/invalid — the
            // unauthorizedHandler below sends the user to login. Warn, not error,
            // so a normal session expiry doesn't redbox / spam error telemetry.
            Logger.warn('ApiClient', 'Token refresh failed', refreshError);
            this.rejectRefreshSubscribers(refreshError);
            // C16 (audit 2026-04-20): only force logout on definitive auth
            // failures (refresh endpoint returns 401/403). Transient errors
            // — network loss, REFRESH_TIMEOUT, 5xx — leave the session
            // intact so the next user action can retry. Previously every
            // refresh failure logged the user out on a single network blip.
            if (
              this.isDefinitiveAuthFailure(refreshError) &&
              this.unauthorizedHandler
            ) {
              await this.unauthorizedHandler();
            }
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        const responseStatus = error.response?.status || 0;
        const isNotificationRegisterError = requestUrl.includes(
          '/auth/notifications/register',
        );
        const isNotificationListError =
          requestMethod === 'GET' &&
          requestUrl.includes('/notifications') &&
          responseStatus >= 500;
        const isTelemetryIngestError = requestUrl.includes(
          '/telemetry/mobile/ingest',
        );
        const isAutoSaveForbidden =
          requestUrl.includes('/auto-save') && responseStatus === 403;
        const isAutoSaveServerError =
          requestUrl.includes('/auto-save') && responseStatus >= 500;
        // responseStatus === 0 → no HTTP response reached us (offline, timeout,
        // server blip): a transient connectivity condition, not a server bug.
        // Logging it at error redboxes in dev and inflates the prod error rate
        // with non-actionable noise; the caller already handles it (sync retry /
        // "backend unreachable" / offline UI).
        const isNetworkError = responseStatus === 0;
        // A 401 from /auth/refresh is the expected session-expiry path — the
        // unauthorizedHandler routes the user back to login.
        const isAuthRefresh401 = isAuthRefresh && responseStatus === 401;

        if (isTelemetryIngestError) {
          // Telemetry ingestion is optional; avoid log spam when endpoint is not enabled.
          Logger.debug(
            'ApiClient',
            `Telemetry API Error: ${error.response?.status} ${requestUrl}`,
            error.response?.data,
          );
        } else if (
          isNetworkError ||
          isAuthRefresh401 ||
          isNotificationRegisterError ||
          isNotificationListError ||
          isAutoSaveForbidden ||
          isAutoSaveServerError
        ) {
          Logger.warn(
            'ApiClient',
            `Recoverable API Error: ${responseStatus} ${requestUrl}`,
            error.response?.data,
          );
        } else {
          Logger.error(
            'ApiClient',
            `API Error: ${responseStatus} ${requestUrl}`,
            error.response?.data,
          );
        }

        return Promise.reject(error);
      },
    );
  }

  private resolveRefreshSubscribers(token: string): void {
    this.refreshSubscribers.forEach(subscriber => subscriber.resolve(token));
    this.refreshSubscribers = [];
  }

  private rejectRefreshSubscribers(error: unknown): void {
    this.refreshSubscribers.forEach(subscriber => subscriber.reject(error));
    this.refreshSubscribers = [];
  }

  /**
   * Is the refresh error a *definitive* auth failure (i.e. the refresh
   * endpoint explicitly said the credentials can't be refreshed)? Only
   * these should force a logout — see C16 in the 2026-04-20 mobile audit.
   *
   * Transient failures (network loss, REFRESH_TIMEOUT, 5xx, DNS) return
   * false so the session is left intact.
   */
  private isDefinitiveAuthFailure(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return status === 401 || status === 403;
    }
    return false;
  }

  /**
   * Run the registered refresh handler from outside the axios interceptor,
   * respecting the same concurrency and timeout guards. Used by the
   * non-axios attachment download path (C9 in the 2026-04-20 mobile
   * audit) to participate in the refresh flow.
   *
   * - If a refresh is already in-flight, wait on the existing subscriber
   *   queue so we don't kick off a duplicate.
   * - Returns the new token on success, null if no refresh handler is
   *   registered or the handler returned an empty token.
   * - Throws on refresh error (caller decides whether to force logout).
   */
  async triggerRefresh(): Promise<string | null> {
    if (!this.refreshHandler) {
      return null;
    }

    if (this.isRefreshing) {
      if (this.refreshSubscribers.length >= MAX_REFRESH_SUBSCRIBERS) {
        throw new Error(
          'REFRESH_QUEUE_FULL: too many requests waiting on token refresh',
        );
      }
      return new Promise<string | null>((resolve, reject) => {
        this.refreshSubscribers.push({
          resolve: (token: string) => resolve(token),
          reject,
        });
      });
    }

    this.isRefreshing = true;
    try {
      const newToken = await this.runRefreshWithTimeout(this.refreshHandler);
      if (newToken) {
        this.resolveRefreshSubscribers(newToken);
        return newToken;
      }
      const refreshFailure = new Error('Token refresh returned no token');
      this.rejectRefreshSubscribers(refreshFailure);
      return null;
    } catch (refreshError) {
      this.rejectRefreshSubscribers(refreshError);
      throw refreshError;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Race the refresh handler against a hard timeout. If the handler takes
   * longer than REFRESH_TIMEOUT_MS, reject with a clear error so queued
   * subscribers fail fast instead of leaking forever.
   */
  private runRefreshWithTimeout(
    handler: RefreshHandler,
  ): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `REFRESH_TIMEOUT: token refresh exceeded ${REFRESH_TIMEOUT_MS}ms`,
          ),
        );
      }, REFRESH_TIMEOUT_MS);

      handler()
        .then(token => {
          clearTimeout(timer);
          resolve(token);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  setRefreshHandler(handler: RefreshHandler | null): void {
    this.refreshHandler = handler;
  }

  setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
    this.unauthorizedHandler = handler;
  }

  /**
   * GET request
   */
  async get<T>(url: string, reqConfig?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, reqConfig);
    return response.data;
  }

  /**
   * POST request
   */
  async post<T>(
    url: string,
    data?: unknown,
    reqConfig?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, reqConfig);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(
    url: string,
    data?: unknown,
    reqConfig?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, reqConfig);
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string, reqConfig?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, reqConfig);
    return response.data;
  }

  /**
   * Upload files as multipart form data
   */
  async uploadFiles<T>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void,
  ): Promise<T> {
    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 min for uploads
      onUploadProgress: progressEvent => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });
    return response.data;
  }

  /**
   * Update the base URL (e.g., after getting config from server)
   */
  setBaseUrl(url: string): void {
    this.client.defaults.baseURL = url;
  }
}

// Singleton instance
export const ApiClient = new ApiClientClass();
export default ApiClient;
