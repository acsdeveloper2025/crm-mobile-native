import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { AuthService } from '../services/AuthService';
import type { UserProfile } from '../types/api';
import { Logger } from '../utils/logger';
import { SyncService } from '../services/SyncService';
import { notificationService } from '../services/NotificationService';

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
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => {},
  logout: async () => {},
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
        await notificationService.registerCurrentDevice();
        SyncService.startPeriodicSync();
        try {
          await SyncService.performSync();
        } catch (syncError) {
          Logger.warn(TAG, 'Initial sync after auth restore failed', syncError);
        }
        setIsAuthenticated(true);
        setUser(profile);
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
      await notificationService.registerCurrentDevice();
      SyncService.startPeriodicSync();
      try {
        await SyncService.performSync();
      } catch (syncError) {
        Logger.warn(TAG, 'Initial sync after login failed', syncError);
      }
      setIsAuthenticated(true);
      setUser(profile);
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
