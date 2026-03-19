import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Switch } from 'react-native';
import { DataCleanupService } from '../../services/DataCleanupService';
import { SyncService } from '../../services/SyncService';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';

export const DataCleanupManager = () => {
  const { theme } = useTheme();
  const [isCleaning, setIsCleaning] = useState(false);
  const [isAutoCleanupEnabled, setIsAutoCleanupEnabled] = useState(false);

  useEffect(() => {
    const loadAutoCleanupSetting = async () => {
      const enabled = await DataCleanupService.isAutoCleanupEnabled();
      setIsAutoCleanupEnabled(enabled);
    };
    loadAutoCleanupSetting();
  }, []);

  const handleToggleAutoCleanup = async (value: boolean) => {
    setIsAutoCleanupEnabled(value);
    await DataCleanupService.setAutoCleanupEnabled(value);
  };

  const handleManualCleanup = async () => {
    Alert.alert(
      'Manual Cleanup',
      'This will delete completed or revoked cases older than 45 days that are already synced. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Proceed', 
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              const result = await DataCleanupService.manualCleanup();
              if (result.success) {
                Alert.alert(
                  'Cleanup Complete', 
                  `Deleted ${result.deletedCases} old cases and ${result.deletedFiles} files.`
                );
              } else {
                Alert.alert('Cleanup Completed with Errors', result.errors.join('\n'));
              }
            } catch (err: any) {
              Alert.alert('Cleanup Failed', err.message);
            } finally {
              setIsCleaning(false);
            }
          }
        }
      ]
    );
  };

  const handleClearCacheAndSync = () => {
    Alert.alert(
      'Clear Cache & Sync',
      'This will clear cached lists/templates and refresh from the server. Tasks within the last 45 days are preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Erase Details', 
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await DataCleanupService.clearCacheAndSync();
              const syncResult = await SyncService.performSync();
              if (syncResult.success) {
                Alert.alert('Success', 'Cache cleared and successfully synced with server.');
              } else {
                Alert.alert('Synced with Errors', syncResult.errors.join('\n'));
              }
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setIsCleaning(false);
            }
          }
        }
      ]
    );
  };

  const handleClearAttachmentCache = () => {
    Alert.alert(
      'Clear Offline Attachments',
      'This will delete cached attachment downloads older than 45 days to free up space.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              const result = await DataCleanupService.clearAttachmentCache();
              Alert.alert('Attachments Cleared', `Deleted ${result.deleted} files.`);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setIsCleaning(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Data Management</Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        Manage your local storage and sync preferences. Cleanup never removes data newer than 45 days.
      </Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelGroup}>
          <Icon name="timer-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>Auto-Cleanup (45 days)</Text>
        </View>
        <Switch
          value={isAutoCleanupEnabled}
          onValueChange={handleToggleAutoCleanup}
          trackColor={{ false: theme.colors.border, true: theme.colors.success + '80' }}
          thumbColor={isAutoCleanupEnabled ? theme.colors.success : theme.colors.textMuted}
        />
      </View>

      <TouchableOpacity 
        style={[styles.button, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]} 
        onPress={handleManualCleanup}
        disabled={isCleaning}>
        <View style={styles.buttonLeft}>
          <Icon name="trash-outline" size={20} color={theme.colors.warning} />
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>Run Manual Cleanup</Text>
        </View>
        {isCleaning ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Icon name="chevron-forward" size={16} color={theme.colors.textMuted} />}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]} 
        onPress={handleClearAttachmentCache}
        disabled={isCleaning}>
        <View style={styles.buttonLeft}>
          <Icon name="images-outline" size={20} color={theme.colors.info || '#3b82f6'} />
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>Clear Attachment FS Cache</Text>
        </View>
        <Icon name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.dangerButton, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger }]} 
        onPress={handleClearCacheAndSync}
        disabled={isCleaning}>
        <View style={styles.buttonLeft}>
          <Icon name="sync-circle-outline" size={20} color={theme.colors.danger} />
          <Text style={[styles.buttonText, styles.dangerButtonText, { color: theme.colors.danger }]}>Clear App Cache & Sync</Text>
        </View>
        <Icon name="alert-circle-outline" size={16} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  toggleLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dangerButton: {
    borderWidth: 1,
    marginTop: 8,
  },
  dangerButtonText: {
    fontWeight: 'bold',
  },
});
