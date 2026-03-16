import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { config } from '../config';
import { Logger } from '../utils/logger';
import axios from 'axios';

type Severity = 'debug' | 'info' | 'warning' | 'error';
type TelemetryCategory = 'sync' | 'queue' | 'upload' | 'background';

interface TelemetryEvent {
  id: string;
  category: TelemetryCategory;
  name: string;
  severity: Severity;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface SyncHealthMetrics {
  queueLength: number;
  retryCount: number;
  lastSuccessfulSyncAt: string | null;
  averageSyncDurationMs: number;
  failedOperations: number;
}

type SentryModule = {
  captureMessage?: (message: string, level?: string) => void;
  captureException?: (error: Error, context?: Record<string, unknown>) => void;
};

type DatadogModule = {
  DdLogs?: {
    debug?: (message: string, context?: Record<string, unknown>) => void;
    info?: (message: string, context?: Record<string, unknown>) => void;
    warn?: (message: string, context?: Record<string, unknown>) => void;
    error?: (message: string, context?: Record<string, unknown>) => void;
  };
};

const TAG = 'MobileTelemetry';
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_SIZE = 25;
const BACKLOG_THROTTLE_MS = 60000;
const INTERNAL_API_BACKOFF_MS = 10 * 60 * 1000;

class MobileTelemetryServiceClass {
  private queue: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private sentry: SentryModule | null = null;
  private datadog: DatadogModule | null = null;
  private initialized = false;
  private lastBacklogAt = 0;
  private internalApiDisabledUntil = 0;
  private internalApi404Logged = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      // Optional dependency; telemetry pipeline should never crash if missing.
      this.sentry = require('@sentry/react-native') as SentryModule;
    } catch {
      this.sentry = null;
    }

    try {
      // Optional dependency; telemetry pipeline should never crash if missing.
      this.datadog = require('@datadog/mobile-react-native') as DatadogModule;
    } catch {
      this.datadog = null;
    }
  }

  private nextId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(error => {
        Logger.warn(TAG, 'Scheduled telemetry flush failed', error);
      });
    }, FLUSH_INTERVAL_MS);
  }

  private enqueue(event: Omit<TelemetryEvent, 'id' | 'timestamp'>): void {
    this.queue.push({
      id: this.nextId(),
      timestamp: new Date().toISOString(),
      ...event,
    });

    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      this.flush().catch(error => {
        Logger.warn(TAG, 'Immediate telemetry flush failed', error);
      });
      return;
    }
    this.scheduleFlush();
  }

  private sendToSentry(event: TelemetryEvent): void {
    if (!this.sentry) {
      return;
    }

    const message = `[${event.category}] ${event.name}`;
    if (event.severity === 'error') {
      this.sentry.captureException?.(new Error(message), { extra: event.payload });
      return;
    }
    this.sentry.captureMessage?.(message, event.severity);
  }

  private sendToDatadog(event: TelemetryEvent): void {
    const logs = this.datadog?.DdLogs;
    if (!logs) {
      return;
    }
    const message = `[${event.category}] ${event.name}`;
    if (event.severity === 'error') {
      logs.error?.(message, event.payload);
    } else if (event.severity === 'warning') {
      logs.warn?.(message, event.payload);
    } else if (event.severity === 'debug') {
      logs.debug?.(message, event.payload);
    } else {
      logs.info?.(message, event.payload);
    }
  }

  private async sendToInternalApi(events: TelemetryEvent[]): Promise<void> {
    const now = Date.now();
    if (now < this.internalApiDisabledUntil) {
      return;
    }

    await ApiClient.post(ENDPOINTS.TELEMETRY.INGEST, {
      platform: config.platform,
      appVersion: config.appVersion,
      environment: config.environment,
      events,
    });
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }
    this.flushing = true;

    const batch = this.queue.splice(0, FLUSH_BATCH_SIZE);
    try {
      for (const event of batch) {
        this.sendToSentry(event);
        this.sendToDatadog(event);
      }
      await this.sendToInternalApi(batch);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        if (status === 404) {
          this.internalApiDisabledUntil = Date.now() + INTERNAL_API_BACKOFF_MS;
          if (!this.internalApi404Logged) {
            this.internalApi404Logged = true;
            Logger.info(
              TAG,
              'Telemetry ingest endpoint not available (404). Internal telemetry upload disabled temporarily.',
            );
          }
          return;
        }
      }
      Logger.warn(TAG, 'Telemetry batch flush failed', error);
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  trackSyncError(name: string, payload: Record<string, unknown>): void {
    this.enqueue({
      category: 'sync',
      name,
      severity: 'error',
      payload,
    });
  }

  trackQueueBacklog(queueLength: number, source: string): void {
    const now = Date.now();
    if (now - this.lastBacklogAt < BACKLOG_THROTTLE_MS) {
      return;
    }
    this.lastBacklogAt = now;
    this.enqueue({
      category: 'queue',
      name: 'queue_backlog',
      severity: queueLength > 500 ? 'warning' : 'info',
      payload: { queueLength, source },
    });
  }

  trackUploadFailure(operationType: string, entityType: string, entityId: string, reason: string): void {
    this.enqueue({
      category: 'upload',
      name: 'upload_failure',
      severity: 'error',
      payload: { operationType, entityType, entityId, reason },
    });
  }

  trackBackgroundSyncStat(name: string, payload: Record<string, unknown>, severity: Severity = 'info'): void {
    this.enqueue({
      category: 'background',
      name,
      severity,
      payload,
    });
  }

  trackSyncHealth(metrics: SyncHealthMetrics, success: boolean): void {
    this.enqueue({
      category: 'sync',
      name: 'sync_health_snapshot',
      severity: success ? 'info' : 'warning',
      payload: {
        ...metrics,
        success,
      },
    });
  }
}

export const MobileTelemetryService = new MobileTelemetryServiceClass();
