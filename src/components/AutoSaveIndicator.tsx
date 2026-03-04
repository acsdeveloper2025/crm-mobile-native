import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface AutoSaveIndicatorProps {
  status?: {
    isAutoSaving?: boolean;
    hasUnsavedChanges?: boolean;
    autoSaveError?: string | null;
  };
  showDetails?: boolean;
}

const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({ status, showDetails = false }) => {
  const { theme } = useTheme();

  const label = status?.autoSaveError
    ? 'Auto-save unavailable'
    : status?.isAutoSaving
      ? 'Saving draft...'
      : status?.hasUnsavedChanges
        ? 'Draft changed'
        : 'Draft ready';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
      <Text style={[styles.text, { color: theme.colors.textSecondary }]}>{label}</Text>
      {showDetails && status?.autoSaveError ? (
        <Text style={[styles.detail, { color: theme.colors.danger }]}>{status.autoSaveError}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  detail: {
    fontSize: 11,
    marginTop: 4,
  },
});

export default AutoSaveIndicator;
