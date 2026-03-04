import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  inline?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = () => {
  const { themePreference, setThemePreference, theme } = useTheme();

  const nextTheme =
    themePreference === 'light'
      ? 'dark'
      : themePreference === 'dark'
        ? 'system'
        : 'light';

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      onPress={() => setThemePreference(nextTheme)}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>Theme: {themePreference}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  text: {
    fontWeight: '600',
  },
});

export default ThemeToggle;
