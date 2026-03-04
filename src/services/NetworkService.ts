// NetworkService - Online/offline detection
// Central service for monitoring network connectivity

import NetInfo, {
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

  /**
   * Start monitoring network connectivity
   */
  initialize(): void {
    this.unsubscribeNetInfo = NetInfo.addEventListener(
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
    const state = await NetInfo.fetch();
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
