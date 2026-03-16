import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, Theme } from '../theme/Theme';
import { Logger } from '../utils/logger';
import { SettingsRepository } from '../repositories/SettingsRepository';

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

  useEffect(() => {
    const loadThemePref = async () => {
      try {
        const value = await SettingsRepository.getValue('theme_preference');
        if (value) {
          setThemePreferenceState(value as ThemePreference);
        }
      } catch {
        Logger.warn('ThemeContext', 'Failed to load theme preference from SQLite');
      }
    };
    loadThemePref();
  }, []);

  const isDark = 
    themePreference === 'dark' || 
    (themePreference === 'system' && systemColorScheme === 'dark');

  const theme = isDark ? darkTheme : lightTheme;

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    try {
      await SettingsRepository.setValue('theme_preference', pref);
    } catch (err) {
      Logger.error('ThemeContext', 'Failed to save theme preference', err);
    }
  };

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
