// API Client - Axios instance with auth token injection and refresh logic
// All API calls go through this client

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { AuthService } from '../services/AuthService';

class ApiClientClass {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

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
        const token = await AuthService.getAccessToken();
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

        // If 401 and haven't retried yet, try refreshing the token
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Queue this request until token is refreshed
            return new Promise(resolve => {
              this.refreshSubscribers.push((token: string) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                resolve(this.client(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await AuthService.refreshAccessToken();
            if (newToken) {
              // Notify queued requests
              this.refreshSubscribers.forEach(cb => cb(newToken));
              this.refreshSubscribers = [];

              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            Logger.error('ApiClient', 'Token refresh failed', refreshError);
            // Force logout
            await AuthService.logout();
          } finally {
            this.isRefreshing = false;
          }
        }

        const requestUrl = error.config?.url || '';
        const isNotificationRegisterError = requestUrl.includes('/auth/notifications/register');
        const isAutoSaveForbidden =
          requestUrl.includes('/auto-save') && error.response?.status === 403;
        const isAutoSaveServerError =
          requestUrl.includes('/auto-save') && (error.response?.status || 0) >= 500;

        if (isNotificationRegisterError || isAutoSaveForbidden || isAutoSaveServerError) {
          Logger.warn(
            'ApiClient',
            `Recoverable API Error: ${error.response?.status} ${requestUrl}`,
            error.response?.data,
          );
        } else {
          Logger.error(
            'ApiClient',
            `API Error: ${error.response?.status} ${requestUrl}`,
            error.response?.data,
          );
        }

        return Promise.reject(error);
      },
    );
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
  async post<T>(url: string, data?: unknown, reqConfig?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, reqConfig);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(url: string, data?: unknown, reqConfig?: AxiosRequestConfig): Promise<T> {
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
