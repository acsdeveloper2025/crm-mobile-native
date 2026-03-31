import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { DataCleanupManager } from '../../components/profile/DataCleanupManager';
import { useTheme } from '../../context/ThemeContext';

export const DataCleanupScreen = () => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title="Data Cleanup Manager" />
      <DataCleanupManager />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
