import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { AuthService } from '../services/AuthService';
import type { UserProfile } from '../types/api';
import { Logger } from '../utils/logger';
import { SyncService } from '../services/SyncService';
import { notificationService } from '../services/NotificationService';
import { DataCleanupService } from '../services/DataCleanupService';

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
        Logger.warn(TAG, 'Immediate sync after assignment notification failed', error);
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

        SyncService.startPeriodicSync();
        DataCleanupService.initializeAutoCleanup().catch(error => {
          Logger.warn(TAG, 'Auto-cleanup initialization failed', error);
        });

        notificationService.registerCurrentDevice().catch(error => {
          Logger.warn(TAG, 'Notification device registration after auth restore failed', error);
        });
        SyncService.performSync().catch(syncError => {
          Logger.warn(TAG, 'Initial sync after auth restore failed', syncError);
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

  const login = async (
    token: string,
    profile: UserProfile,
    refreshToken?: string,
    expiresIn?: number,
  ) => {
    try {
      const result = await AuthService.login(token, profile, refreshToken, expiresIn);
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
        Logger.warn(TAG, 'Notification device registration after login failed', error);
      });
      SyncService.performSync().catch(syncError => {
        Logger.warn(TAG, 'Initial sync after login failed', syncError);
      });
    } catch (e) {
      Logger.error(TAG, 'Login failed in context', e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
      SyncService.stopPeriodicSync();
      setIsAuthenticated(false);
      setUser(null);
    } catch (e) {
      Logger.error(TAG, 'Logout failed in context', e);
    }
  };

  const updateProfilePhoto = async (profilePhotoUrl: string) => {
    try {
      const updatedUser = await AuthService.updateProfilePhoto(profilePhotoUrl);
      if (updatedUser) {
        setUser(updatedUser);
      }
    } catch (e) {
      Logger.error(TAG, 'Profile photo update failed', e);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, updateProfilePhoto }}>
      {children}
    </AuthContext.Provider>
  );
};
