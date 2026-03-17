// NetworkService - Online/offline detection
// Central service for monitoring network connectivity

import type {
  NetInfoState,
  NetInfoSubscription,
} from '@react-native-community/netinfo';
import { Logger } from '../utils/logger';

const TAG = 'NetworkService';

type NetworkChangeCallback = (isOnline: boolean) => void;

class NetworkServiceClass {
  private isOnline = true;
  private connectionType: string = 'unknown';
  private subscribers: NetworkChangeCallback[] = [];
  private unsubscribeNetInfo: NetInfoSubscription | null = null;
  private netInfoModule: {
    addEventListener: (listener: (state: NetInfoState) => void) => NetInfoSubscription;
    fetch: () => Promise<NetInfoState>;
  } | null = null;
  private netInfoUnavailable = false;

  private getNetInfoModule() {
    if (this.netInfoModule || this.netInfoUnavailable) {
      return this.netInfoModule;
    }

    try {
      const requiredModule = require('@react-native-community/netinfo');
      this.netInfoModule = requiredModule.default ?? requiredModule;
      return this.netInfoModule;
    } catch (error) {
      this.netInfoUnavailable = true;
      Logger.warn(
        TAG,
        'NetInfo native module unavailable. Falling back to optimistic online mode.',
        error,
      );
      return null;
    }
  }

  /**
   * Start monitoring network connectivity
   */
  initialize(): void {
    const netInfo = this.getNetInfoModule();

    if (!netInfo) {
      this.isOnline = true;
      this.connectionType = 'unknown';
      return;
    }

    this.unsubscribeNetInfo = netInfo.addEventListener(
      (state: NetInfoState) => {
        const wasOnline = this.isOnline;
        this.isOnline = state.isConnected === true && state.isInternetReachable !== false;
        this.connectionType = state.type;

        if (wasOnline !== this.isOnline) {
          Logger.info(
            TAG,
            `Network status changed: ${this.isOnline ? 'ONLINE' : 'OFFLINE'} (${state.type})`,
          );
          this.notifySubscribers();
        }
      },
    );

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
    const netInfo = this.getNetInfoModule();

    if (!netInfo) {
      return this.isOnline;
    }

    const state = await netInfo.fetch();
    this.isOnline = state.isConnected === true && state.isInternetReachable !== false;
    this.connectionType = state.type;
    return this.isOnline;
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
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
