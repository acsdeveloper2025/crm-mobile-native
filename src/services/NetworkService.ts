// NetworkService - Online/offline detection
// Central service for monitoring network connectivity

import NetInfo, {
  type NetInfoState,
  type NetInfoSubscription,
} from '@react-native-community/netinfo';
import { Logger } from '../utils/logger';

const TAG = 'NetworkService';

type NetworkChangeCallback = (isOnline: boolean) => void;

// Debounce network state changes to prevent rapid sync triggers
// from WiFi/cellular handoffs (common on field devices)
const NETWORK_DEBOUNCE_MS = 3000;

class NetworkServiceClass {
  private isOnline = true;
  private connectionType: string = 'unknown';
  private subscribers: NetworkChangeCallback[] = [];
  private unsubscribeNetInfo: NetInfoSubscription | null = null;
  private netInfoUnavailable = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private normalizeState(
    state: Partial<NetInfoState> | null | undefined,
  ): NetInfoState {
    const isConnected = state?.isConnected ?? null;
    return {
      type: state?.type ?? 'unknown',
      isConnected,
      isInternetReachable:
        state?.isInternetReachable ??
        (isConnected === null ? null : isConnected),
      details: state?.details ?? null,
      isWifiEnabled: state?.isWifiEnabled,
    } as NetInfoState;
  }

  /**
   * Start monitoring network connectivity
   */
  initialize(): void {
    if (this.netInfoUnavailable) {
      this.isOnline = true;
      this.connectionType = 'unknown';
      return;
    }

    try {
      this.unsubscribeNetInfo = NetInfo.addEventListener(
        (state: NetInfoState) => {
          const normalizedState = this.normalizeState(state);
          const wasOnline = this.isOnline;
          this.isOnline =
            normalizedState.isConnected === true &&
            normalizedState.isInternetReachable !== false;
          this.connectionType = normalizedState.type;

          if (wasOnline !== this.isOnline) {
            Logger.info(
              TAG,
              `Network status changed: ${
                this.isOnline ? 'ONLINE' : 'OFFLINE'
              } (${normalizedState.type})`,
            );
            // Debounce to prevent rapid sync triggers from WiFi/cellular handoffs
            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
              this.debounceTimer = null;
              this.notifySubscribers();
            }, NETWORK_DEBOUNCE_MS);
          }
        },
      );
    } catch (error) {
      this.netInfoUnavailable = true;
      this.isOnline = true;
      this.connectionType = 'unknown';
      Logger.warn(
        TAG,
        'NetInfo initialization failed. Falling back to optimistic online mode.',
        error,
      );
      return;
    }

    Logger.info(TAG, 'Network monitoring initialized');
  }

  /**
   * Get current online status
   */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get current connection type
   */
  getConnectionType(): 'WIFI' | 'CELLULAR' | 'OFFLINE' {
    if (!this.isOnline) {
      return 'OFFLINE';
    }
    return this.connectionType === 'wifi' ? 'WIFI' : 'CELLULAR';
  }

  /**
   * Subscribe to network state changes
   * Returns an unsubscribe function
   */
  onNetworkChange(callback: NetworkChangeCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  /**
   * Force-check the current network state
   */
  async checkConnection(): Promise<boolean> {
    if (this.netInfoUnavailable) {
      return this.isOnline;
    }

    try {
      const state = this.normalizeState(await NetInfo.fetch());
      this.isOnline =
        state.isConnected === true && state.isInternetReachable !== false;
      this.connectionType = state.type;
    } catch (error) {
      this.netInfoUnavailable = true;
      this.isOnline = true;
      this.connectionType = 'unknown';
      Logger.warn(
        TAG,
        'NetInfo fetch failed. Falling back to optimistic online mode.',
        error,
      );
    }
    return this.isOnline;
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.subscribers = [];
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(cb => {
      try {
        cb(this.isOnline);
      } catch (error) {
        Logger.error(TAG, 'Subscriber callback error', error);
      }
    });
  }
}

// Singleton
export const NetworkService = new NetworkServiceClass();
export default NetworkService;
