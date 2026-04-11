// API Client - Axios instance with auth token injection and refresh logic
// All API calls go through this client
//
// SECURITY: Certificate Pinning
// For production, enable SSL certificate pinning to prevent MITM attacks.
// Install react-native-ssl-pinning or react-native-cert-pinner and configure:
//   - Android: Place certificate .cer files in android/app/src/main/res/raw/
//   - iOS: Add certificates to the Xcode project and Info.plist
// Then replace axios with the pinned HTTP client for all production requests.
// See: https://github.com/nickhudkins/react-native-ssl-pinning

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { SessionStore } from '../services/SessionStore';

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
        const token = await SessionStore.getAccessToken();
        if (token && requestConfig.headers) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
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

    // Response interceptor - handle 401 (token refresh)
    this.client.interceptors.response.use(
      response => response,
      async (error: AxiosError) => {
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
            Logger.error('ApiClient', 'Token refresh failed', refreshError);
            this.rejectRefreshSubscribers(refreshError);
            if (this.unauthorizedHandler) {
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

        if (isTelemetryIngestError) {
          // Telemetry ingestion is optional; avoid log spam when endpoint is not enabled.
          Logger.debug(
            'ApiClient',
            `Telemetry API Error: ${error.response?.status} ${requestUrl}`,
            error.response?.data,
          );
        } else if (
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
