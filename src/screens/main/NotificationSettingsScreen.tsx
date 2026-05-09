import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import type { Theme } from '../../theme/Theme';

const TAG = 'NotificationSettingsScreen';

/**
 * Phase 2.3 (2026-05-04) — mobile mirror of the web Settings →
 * Notifications tab. 5 event types × 3 channels (enabled / push /
 * websocket) + quiet hours (HH:MM start/end).
 *
 * GET/PUT /api/mobile/notifications/preferences (added in same phase
 * to expose the existing /api/notifications/preferences handlers under
 * the mobile prefix).
 */

interface NotificationPreferences {
  caseAssignmentEnabled: boolean;
  caseAssignmentPush: boolean;
  caseAssignmentWebsocket: boolean;
  caseReassignmentEnabled: boolean;
  caseReassignmentPush: boolean;
  caseReassignmentWebsocket: boolean;
  caseCompletionEnabled: boolean;
  caseCompletionPush: boolean;
  caseCompletionWebsocket: boolean;
  caseRevocationEnabled: boolean;
  caseRevocationPush: boolean;
  caseRevocationWebsocket: boolean;
  systemNotificationsEnabled: boolean;
  systemNotificationsPush: boolean;
  systemNotificationsWebsocket: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const EVENT_TYPES: Array<{
  key:
    | 'caseAssignment'
    | 'caseReassignment'
    | 'caseCompletion'
    | 'caseRevocation'
    | 'systemNotifications';
  label: string;
  description: string;
}> = [
  {
    key: 'caseAssignment',
    label: 'Case Assignment',
    description: 'When a case or task is assigned to you.',
  },
  {
    key: 'caseReassignment',
    label: 'Case Reassignment',
    description: 'When an existing case is reassigned to you.',
  },
  {
    key: 'caseCompletion',
    label: 'Case Completion',
    description: 'When a case you oversee is completed.',
  },
  {
    key: 'caseRevocation',
    label: 'Case / Task Revoked',
    description: 'When a case or task is revoked.',
  },
  {
    key: 'systemNotifications',
    label: 'System Alerts',
    description: 'Maintenance windows, app updates, urgent notices.',
  },
];

type FieldName = keyof NotificationPreferences;
const fieldName = (
  prefix: (typeof EVENT_TYPES)[number]['key'],
  suffix: 'Enabled' | 'Push' | 'Websocket',
): FieldName => `${prefix}${suffix}` as FieldName;

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const NotificationSettingsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences().catch(() => undefined);
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get<{
        success: boolean;
        data?: NotificationPreferences;
      }>(ENDPOINTS.NOTIFICATIONS.PREFERENCES);
      if (!res.success || !res.data) {
        throw new Error('Could not load preferences');
      }
      setPrefs(res.data);
    } catch (e: unknown) {
      Logger.warn(TAG, 'Failed to load preferences', e);
      setError(e instanceof Error ? e.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const setBool = (field: FieldName, value: boolean) => {
    setPrefs(curr => (curr ? { ...curr, [field]: value } : curr));
  };

  const setQuietTime = (
    field: 'quietHoursStart' | 'quietHoursEnd',
    raw: string,
  ) => {
    setPrefs(curr => (curr ? { ...curr, [field]: raw || null } : curr));
  };

  const handleSave = async () => {
    if (!prefs) {
      return;
    }
    if (
      prefs.quietHoursEnabled &&
      ((prefs.quietHoursStart && !TIME_REGEX.test(prefs.quietHoursStart)) ||
        (prefs.quietHoursEnd && !TIME_REGEX.test(prefs.quietHoursEnd)))
    ) {
      Alert.alert(
        'Invalid time',
        'Quiet hours times must be in HH:MM (24-hour) format, e.g. 22:00.',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await ApiClient.put<{ success: boolean }>(
        ENDPOINTS.NOTIFICATIONS.PREFERENCES,
        prefs,
      );
      if (!res.success) {
        throw new Error('Save failed');
      }
      Alert.alert('Saved', 'Notification preferences updated.');
    } catch (e: unknown) {
      Logger.error(TAG, 'Failed to save preferences', e);
      Alert.alert('Error', 'Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
        edges={['top']}
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !prefs) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
        edges={['top']}
      >
        <View style={styles.center}>
          <Icon
            name="alert-circle-outline"
            size={48}
            color={theme.colors.danger}
          />
          <Text style={[styles.errorText, { color: theme.colors.text }]}>
            {error || 'Could not load preferences'}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: theme.colors.primary }]}
            onPress={loadPreferences}
          >
            <Text style={{ color: theme.colors.primary }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Notification Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text
          style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
        >
          Per-event toggles
        </Text>

        {EVENT_TYPES.map(({ key, label, description }) => {
          const enabledField = fieldName(key, 'Enabled');
          const pushField = fieldName(key, 'Push');
          const wsField = fieldName(key, 'Websocket');
          const isEnabled = Boolean(prefs[enabledField]);
          return (
            <View
              key={key}
              style={[
                styles.eventCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.eventHeaderRow}>
                <View style={styles.eventLabelWrap}>
                  <Text
                    style={[styles.eventLabel, { color: theme.colors.text }]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.eventDescription,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {description}
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={v => setBool(enabledField, v)}
                />
              </View>
              <View style={styles.subToggleRow}>
                <Text
                  style={[
                    styles.subToggleLabel,
                    {
                      color: isEnabled
                        ? theme.colors.text
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  Push (foreground + background)
                </Text>
                <Switch
                  value={Boolean(prefs[pushField])}
                  disabled={!isEnabled}
                  onValueChange={v => setBool(pushField, v)}
                />
              </View>
              <View style={styles.subToggleRow}>
                <Text
                  style={[
                    styles.subToggleLabel,
                    {
                      color: isEnabled
                        ? theme.colors.text
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  In-app banner (WebSocket)
                </Text>
                <Switch
                  value={Boolean(prefs[wsField])}
                  disabled={!isEnabled}
                  onValueChange={v => setBool(wsField, v)}
                />
              </View>
            </View>
          );
        })}

        <Text
          style={[
            styles.sectionTitle,
            styles.quietHoursTitle,
            { color: theme.colors.textSecondary },
          ]}
        >
          Quiet hours
        </Text>
        <View
          style={[
            styles.eventCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.eventHeaderRow}>
            <View style={styles.eventLabelWrap}>
              <Text style={[styles.eventLabel, { color: theme.colors.text }]}>
                Mute non-urgent notifications
              </Text>
              <Text
                style={[
                  styles.eventDescription,
                  { color: theme.colors.textMuted },
                ]}
              >
                Push and in-app alerts pause during this window. Urgent alerts
                still fire.
              </Text>
            </View>
            <Switch
              value={prefs.quietHoursEnabled}
              onValueChange={v => setBool('quietHoursEnabled', v)}
            />
          </View>
          <View style={styles.timeRow}>
            <View style={styles.timeFieldWrap}>
              <Text
                style={[
                  styles.timeLabel,
                  {
                    color: prefs.quietHoursEnabled
                      ? theme.colors.text
                      : theme.colors.textMuted,
                  },
                ]}
              >
                Start (HH:MM)
              </Text>
              <TextInput
                editable={prefs.quietHoursEnabled}
                value={prefs.quietHoursStart || ''}
                onChangeText={t => setQuietTime('quietHoursStart', t)}
                placeholder="22:00"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.timeInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background,
                  },
                ]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <View style={styles.timeFieldWrap}>
              <Text
                style={[
                  styles.timeLabel,
                  {
                    color: prefs.quietHoursEnabled
                      ? theme.colors.text
                      : theme.colors.textMuted,
                  },
                ]}
              >
                End (HH:MM)
              </Text>
              <TextInput
                editable={prefs.quietHoursEnabled}
                value={prefs.quietHoursEnd || ''}
                onChangeText={t => setQuietTime('quietHoursEnd', t)}
                placeholder="07:00"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.timeInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background,
                  },
                ]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor: saving
                ? theme.colors.primary + '70'
                : theme.colors.primary,
            },
          ]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save preferences"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="save-outline" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      gap: 8,
    },
    backBtn: { padding: 6 },
    title: { fontSize: 18, fontWeight: '600' },
    scrollContent: { padding: 16, paddingBottom: 96 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
    retryBtn: {
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    quietHoursTitle: {
      marginTop: 18,
    },
    eventCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    eventHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    eventLabelWrap: { flex: 1 },
    eventLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    eventDescription: { fontSize: 12, lineHeight: 16 },
    subToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
    },
    subToggleLabel: { fontSize: 13, flex: 1 },
    timeRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    timeFieldWrap: { flex: 1 },
    timeLabel: { fontSize: 12, marginBottom: 4 },
    timeInput: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 18,
    },
    saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  });
