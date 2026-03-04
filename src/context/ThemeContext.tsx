import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from '../theme/Theme';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  themePreference: ThemePreference;
  isDark: boolean;
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme(); // 'light' or 'dark' from OS
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  // 1. Load persisted preference on mount
  useEffect(() => {
    const loadThemePref = async () => {
      try {
        const result = await DatabaseService.query(
          "SELECT value FROM key_value_store WHERE key = 'theme_preference'"
        );
        if (result.length> 0) {
          setThemePreferenceState(result[0].value as ThemePreference);
        }
      } catch {
        Logger.warn('ThemeContext', 'Failed to load theme preference from SQLite');
      } finally {
        setIsReady(true);
      }
    };
    loadThemePref();
  }, []);

  // 2. Computed values
  const isDark = 
    themePreference === 'dark' || 
    (themePreference === 'system' && systemColorScheme === 'dark');

  const theme = isDark ? darkTheme : lightTheme;

  // 3. User toggle action
  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    try {
      await DatabaseService.execute(
        "INSERT OR REPLACE INTO key_value_store (key, value) VALUES ('theme_preference', ?)",
        [pref]
      );
    } catch (err) {
      Logger.error('ThemeContext', 'Failed to save theme preference', err);
    }
  };

  // Don't render until offline pref is loaded to prevent flash
  if (!isReady) return null;

  return (
    <ThemeContext.Provider value={{ theme, themePreference, isDark, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
