import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
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
    // The copy must follow listOldTaskIdsHybrid — this is a destructive confirm,
    // so it has to describe what the query actually deletes.
    //
    // 2026-07-17: it said "every case older than 45 days whose work is fully
    // synced". That was written on 2026-07-16 to fix an earlier lie ("completed
    // or revoked") — but the SAME DAY, 5f515d6 added
    // `AND status IN ('SUBMITTED','COMPLETED','REVOKED')` to the query, because
    // deleting live ASSIGNED work the agent still owed was the bug. Two edits,
    // opposite directions: the dialog was left describing the behaviour that had
    // just been removed, promising to delete work it now keeps.
    Alert.alert(
      'Manual Cleanup',
      'This will delete cases you have already submitted, or that were revoked, once they are more than 45 days old and fully synced. Work you still have to do is never removed, and nothing still waiting to upload is ever removed. It will also clear every cached attachment file on this device. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              const result = await DataCleanupService.manualCleanup();
              const summary = [
                `Cases: ${result.deletedCases}`,
                `Photo/attachment files: ${result.deletedFiles}`,
                `Cached attachments: ${result.attachmentCacheDeleted}`,
              ].join('\n');
              if (result.success) {
                Alert.alert('Cleanup Complete', summary);
              } else {
                Alert.alert(
                  'Cleanup Completed with Errors',
                  `${summary}\n\nErrors:\n${result.errors.join('\n')}`,
                );
              }
            } catch (err: unknown) {
              Alert.alert(
                'Cleanup Failed',
                err instanceof Error ? err.message : String(err),
              );
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
    );
  };

  const handleClearCacheAndSync = () => {
    // 2026-07-16: this path also purges auto-save BACKUPS older than 7 days
    // (DataCleanupRepository.clearCacheAndSyncTables) — the old copy only
    // mentioned "lists/templates", so a user clearing a cache to fix a sync
    // glitch had no idea drafts were in scope. The draft itself survives in
    // tasks.form_data_json (that is the copy restore actually reads), so this
    // is a backup GC, not data loss — say exactly that.
    Alert.alert(
      'Clear Cache & Sync',
      'This will clear cached lists and form templates, then refresh from the server. Your tasks and in-progress form data are preserved. Auto-save backups older than 7 days are also removed.',
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
                Alert.alert(
                  'Success',
                  'Cache cleared and successfully synced with server.',
                );
              } else {
                Alert.alert('Synced with Errors', syncResult.errors.join('\n'));
              }
            } catch (err: unknown) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : String(err),
              );
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
    );
  };

  const handleClearAttachmentCache = () => {
    Alert.alert(
      'Clear Offline Attachments',
      'This will delete EVERY cached attachment file on this device to free up space. Backend keeps the originals; the app will re-fetch them on demand.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              const result = await DataCleanupService.clearAttachmentCache(
                true,
              );
              const mb = (result.size / (1024 * 1024)).toFixed(1);
              Alert.alert(
                'Attachments Cleared',
                `Deleted ${result.deleted} files (${mb} MB reclaimed).`,
              );
            } catch (err: unknown) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : String(err),
              );
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        Data Management
      </Text>
      {/* Two different retention windows live behind this screen — keep them
          straight when editing this copy:
            * TASKS: 45 days, and only SUBMITTED / COMPLETED / REVOKED ones
              (DataCleanupRepository.listOldTaskIdsHybrid).
            * AUTO-SAVE BACKUPS: 7 days, dropped by Clear Cache & Sync only
              (clearCacheAndSyncTables) — a backup GC, since the draft itself
              lives in tasks.form_data_json, which is what restore reads.
          Every delete path additionally requires sync_status='SYNCED', which is
          the stronger promise and the one worth leading with.
          2026-07-17: the note here used to call the 45-day claim below "not
          true", citing the 7-day backup purge. That conflated the two windows —
          the claim is true OF TASKS, which is what it says. */}
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        Manage your local storage and sync preferences. Cleanup never removes
        work that has not synced yet, and never removes tasks newer than 45
        days.
      </Text>

      {/* U3 (audit 2026-04-21 round 2): override static
          rgba borderBottomColor with the theme token so the
          separator is visible on dark-mode surfaces. */}
      <View
        style={[styles.toggleRow, { borderBottomColor: theme.colors.border }]}
      >
        <View style={styles.toggleLabelGroup}>
          <Icon name="timer-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>
            Auto-Cleanup (45 days)
          </Text>
        </View>
        <Switch
          value={isAutoCleanupEnabled}
          onValueChange={handleToggleAutoCleanup}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.success + '80',
          }}
          thumbColor={
            isAutoCleanupEnabled ? theme.colors.success : theme.colors.textMuted
          }
        />
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
        onPress={handleManualCleanup}
        disabled={isCleaning}
      >
        <View style={styles.buttonLeft}>
          <Icon name="trash-outline" size={20} color={theme.colors.warning} />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.buttonText, { color: theme.colors.text }]}
          >
            Run Manual Cleanup
          </Text>
        </View>
        {isCleaning ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Icon
            name="chevron-forward"
            size={16}
            color={theme.colors.textMuted}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
        onPress={handleClearAttachmentCache}
        disabled={isCleaning}
      >
        <View style={styles.buttonLeft}>
          <Icon
            name="images-outline"
            size={20}
            color={theme.colors.info || '#3b82f6'}
          />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.buttonText, { color: theme.colors.text }]}
          >
            Clear Attachment FS Cache
          </Text>
        </View>
        <Icon name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          styles.dangerButton,
          {
            backgroundColor: theme.colors.danger + '10',
            borderColor: theme.colors.danger,
          },
        ]}
        onPress={handleClearCacheAndSync}
        disabled={isCleaning}
      >
        <View style={styles.buttonLeft}>
          <Icon
            name="sync-circle-outline"
            size={20}
            color={theme.colors.danger}
          />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.buttonText,
              styles.dangerButtonText,
              { color: theme.colors.danger },
            ]}
          >
            Clear App Cache & Sync
          </Text>
        </View>
        <Icon
          name="alert-circle-outline"
          size={16}
          color={theme.colors.danger}
        />
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
    // borderBottomColor set inline from theme.colors.border (U3).
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
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  dangerButton: {
    borderWidth: 1,
    marginTop: 8,
  },
  dangerButtonText: {
    fontWeight: 'bold',
  },
});
