import { Alert, DeviceEventEmitter } from 'react-native';
import React, {
  createContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
  useContext,
} from 'react';
import { AuthService } from '../services/AuthService';
import type { UserProfile } from '../types/api';
import { Logger } from '../utils/logger';
import { SyncService } from '../services/SyncService';
import { SyncQueue } from '../services/SyncQueue';
import { applyJitter } from '../utils/syncJitter';
import { notificationService } from '../services/NotificationService';
import { mobileSocketService } from '../services/MobileSocketService';
import { DataCleanupService } from '../services/DataCleanupService';
import { PrivacyConsentService } from '../services/PrivacyConsentService';

const TAG = 'AuthContext';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  login: (
    token: string,
    profile: UserProfile,
    refreshToken?: string,
    expiresIn?: number,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (profilePhotoUrl: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => {},
  logout: async () => {},
  updateProfilePhoto: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // A-CRIT-1 chunk 5 consumer (AUDIT 2026-05-17): when MobileSocketService
  // matches an `auth:session_revoked` WS push to this device, it already
  // wiped the Keychain via AuthService.logout(). We just need to clear
  // React state (which causes RootNavigator to swap in LoginScreen) +
  // surface an Alert so the user understands why they're signed out.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'auth:session-revoked-remotely',
      (evt: { deviceLabel?: string | null }) => {
        Logger.info(TAG, 'auth:session-revoked-remotely received', evt);
        setIsAuthenticated(false);
        setUser(null);
        SyncService.stopPeriodicSync();
        mobileSocketService.disconnect();
        const labelText = evt?.deviceLabel ? ` (${evt.deviceLabel})` : '';
        Alert.alert(
          'Signed Out',
          `Your session${labelText} was revoked. Please log in again.`,
          [{ text: 'OK' }],
          { cancelable: false },
        );
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    notificationService.setAssignmentSyncHandler(async trigger => {
      if (!AuthService.isAuthenticated()) {
        return;
      }
      Logger.info(
        TAG,
        `Immediate sync triggered by ${trigger.type} notification (${trigger.source})`,
        { taskId: trigger.taskId || null },
      );
      try {
        await SyncService.performSync();
      } catch (error) {
        Logger.warn(
          TAG,
          'Immediate sync after assignment notification failed',
          error,
        );
      }
    });

    return () => {
      notificationService.setAssignmentSyncHandler(null);
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      const authenticated = await AuthService.initialize();
      const profile = AuthService.getCurrentUser();

      if (authenticated && profile) {
        setIsAuthenticated(true);
        setUser(profile);

        // Recover any expired leases from interrupted sync operations before starting
        await SyncQueue.recoverExpiredLeases();
        // Re-enqueue any PENDING attachments whose enqueue was interrupted by
        // a crash between the DB commit and the sync_queue insert.
        await SyncQueue.reconcileOrphanAttachments();

        SyncService.startPeriodicSync();
        DataCleanupService.initializeAutoCleanup().catch(error => {
          Logger.warn(TAG, 'Auto-cleanup initialization failed', error);
        });

        notificationService.registerCurrentDevice().catch(error => {
          Logger.warn(
            TAG,
            'Notification device registration after auth restore failed',
            error,
          );
        });
        // Phase 2.1: open WS for restored session (e.g. app re-launch
        // with cached token). Same fail-soft behaviour as login.
        mobileSocketService.connect().catch(error => {
          Logger.warn(
            TAG,
            'WebSocket connect after auth restore failed',
            error,
          );
        });
        // O-CRIT-1 (AUDIT 2026-05-16): jitter the initial sync so a fleet-wide
        // foreground (shift-end office reconnect, mass app-open after push)
        // spreads its load across ~30s instead of stampeding the backend.
        applyJitter()
          .then(() => SyncService.performSync())
          .catch(syncError => {
            Logger.warn(
              TAG,
              'Initial sync after auth restore failed',
              syncError,
            );
          });
      } else {
        setIsAuthenticated(false);
        setUser(null);
        SyncService.stopPeriodicSync();
      }
    } catch (e) {
      Logger.error(TAG, 'Auth init failed', e);
      setIsAuthenticated(false);
      setUser(null);
      SyncService.stopPeriodicSync();
    } finally {
      setIsLoading(false);
    }
  };

  // H7 (audit 2026-04-21): wrap handlers in useCallback + Provider
  // value in useMemo so consumers don't re-render on every state tick.
  // Without this, typing in any input anywhere re-fired every consumer
  // of useAuth because the object literal was a new reference each
  // render. TaskContext + ThemeContext already followed this pattern;
  // AuthContext was the outlier.
  const login = useCallback(
    async (
      token: string,
      profile: UserProfile,
      refreshToken?: string,
      expiresIn?: number,
    ) => {
      try {
        const result = await AuthService.login(
          token,
          profile,
          refreshToken,
          expiresIn,
        );
        if (!result.success) {
          throw new Error(result.message);
        }
        setIsAuthenticated(true);
        setUser(profile);
        SyncService.startPeriodicSync();
        DataCleanupService.initializeAutoCleanup().catch(error => {
          Logger.warn(TAG, 'Auto-cleanup initialization failed', error);
        });
        notificationService.registerCurrentDevice().catch(error => {
          Logger.warn(
            TAG,
            'Notification device registration after login failed',
            error,
          );
        });
        // Phase 2.1 (2026-05-04): also open the realtime WebSocket for
        // sub-second push of new notifications while the app is open.
        // Push (FCM) remains the background fallback. Best-effort —
        // failure to connect shouldn't fail login.
        mobileSocketService.connect().catch(error => {
          Logger.warn(TAG, 'WebSocket connect after login failed', error);
        });
        // O-CRIT-1: see applyJitter rationale at the auth-restore site above.
        applyJitter()
          .then(() => SyncService.performSync())
          .catch(syncError => {
            Logger.warn(TAG, 'Initial sync after login failed', syncError);
          });
        // 2026-05-13: belt-and-braces — re-sync any locally-stored
        // consent acceptance to the backend's user_consents table.
        // Covers cases where the original PrivacyConsentScreen accept
        // happened offline / before the BE consent endpoint existed.
        // Idempotent server-side.
        PrivacyConsentService.syncWithBackend().catch(error => {
          Logger.warn(TAG, 'Consent sync after login failed', error);
        });
      } catch (e) {
        Logger.error(TAG, 'Login failed in context', e);
        throw e;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await AuthService.logout();
      SyncService.stopPeriodicSync();
      // Phase 2.1: close WebSocket on logout — otherwise the previous
      // user's session keeps a live channel open until the OS kills
      // the connection, which leaks notifications meant for them
      // across user switches on shared devices.
      mobileSocketService.disconnect();
      setIsAuthenticated(false);
      setUser(null);
    } catch (e) {
      Logger.error(TAG, 'Logout failed in context', e);
    }
  }, []);

  const updateProfilePhoto = useCallback(async (profilePhotoUrl: string) => {
    try {
      const updatedUser = await AuthService.updateProfilePhoto(profilePhotoUrl);
      if (updatedUser) {
        setUser(updatedUser);
      }
    } catch (e) {
      Logger.error(TAG, 'Profile photo update failed', e);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      login,
      logout,
      updateProfilePhoto,
    }),
    [isAuthenticated, isLoading, user, login, logout, updateProfilePhoto],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
