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
import { ScreenHeader } from '../../components/ScreenHeader';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';

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

type EventKey =
  | 'caseAssignment'
  | 'caseReassignment'
  | 'caseCompletion'
  | 'caseRevocation'
  | 'systemNotifications';

// 2026-05-14: load-bearing notification types — required for the field
// agent to function (must hear about new work, ownership changes, work
// being revoked, and urgent system alerts). User cannot turn these off;
// the switches render disabled + locked, and the screen force-enables
// them on load even if BE persistence holds a legacy `false`.
const REQUIRED_EVENT_KEYS: ReadonlySet<EventKey> = new Set<EventKey>([
  'caseAssignment',
  'caseReassignment',
  'caseRevocation',
  'systemNotifications',
]);

const EVENT_TYPES: Array<{
  key: EventKey;
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

export const NotificationSettingsScreen = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(), []);

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
      // ADR-0054 Phase 5: GET /notifications/preferences is v2-native — a BARE
      // body `{ preferences, updatedAt }` (no `{ success, data }` wrapper). The
      // device's flat toggle map lives under `.preferences` (the backend stores
      // it as an opaque Record); read it from there.
      const res = await ApiClient.get<{
        preferences?: Partial<NotificationPreferences>;
        updatedAt?: string | null;
      }>(ENDPOINTS.NOTIFICATIONS.PREFERENCES);
      if (!res || typeof res !== 'object' || !res.preferences) {
        throw new Error('Could not load preferences');
      }
      // Force-enable load-bearing event types — required for the agent
      // to receive new work / revocations / urgent system alerts. BE may
      // have legacy `false` from a previous version that allowed opt-out.
      const enforced: NotificationPreferences = {
        ...(res.preferences as NotificationPreferences),
      };
      for (const key of REQUIRED_EVENT_KEYS) {
        const enabledField = `${key}Enabled` as FieldName;
        const pushField = `${key}Push` as FieldName;
        (enforced as Record<FieldName, boolean | string | null>)[enabledField] =
          true;
        (enforced as Record<FieldName, boolean | string | null>)[pushField] =
          true;
      }
      setPrefs(enforced);
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
    // Defense in depth: re-force required keys to true at save time in
    // case state was mutated through some path that bypassed the UI
    // disable. BE should also reject any attempt to set these to false.
    const safePrefs: NotificationPreferences = { ...prefs };
    for (const key of REQUIRED_EVENT_KEYS) {
      const enabledField = `${key}Enabled` as FieldName;
      const pushField = `${key}Push` as FieldName;
      (safePrefs as Record<FieldName, boolean | string | null>)[enabledField] =
        true;
      (safePrefs as Record<FieldName, boolean | string | null>)[pushField] =
        true;
    }
    setSaving(true);
    try {
      // ADR-0054 Phase 5: PUT /notifications/preferences is v2-native — the
      // backend accepts a flat toggle map (its schema wraps it into
      // `{ preferences }`) and returns a BARE `{ preferences, updatedAt }`
      // (no `success` flag). Success = the request resolved without throwing.
      await ApiClient.put<{
        preferences?: Record<string, unknown>;
        updatedAt?: string | null;
      }>(ENDPOINTS.NOTIFICATIONS.PREFERENCES, safePrefs);
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
      edges={['bottom']}
    >
      <ScreenHeader title="Notification Settings" />

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
          const isRequired = REQUIRED_EVENT_KEYS.has(key);
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
                  <View style={styles.eventLabelRow}>
                    <Text
                      style={[styles.eventLabel, { color: theme.colors.text }]}
                    >
                      {label}
                    </Text>
                    {isRequired ? (
                      <View
                        style={[
                          styles.requiredBadge,
                          { backgroundColor: theme.colors.primary + '20' },
                        ]}
                      >
                        <Icon
                          name="lock-closed"
                          size={11}
                          color={theme.colors.primary}
                        />
                        <Text
                          style={[
                            styles.requiredBadgeText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Required
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.eventDescription,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {isRequired
                      ? `${description} Always on — needed for the app to function.`
                      : description}
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  disabled={isRequired}
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
                  disabled={!isEnabled || isRequired}
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

const makeStyles = () =>
  StyleSheet.create({
    safeArea: { flex: 1 },
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
    eventLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 2,
    },
    eventLabel: { fontSize: 15, fontWeight: '600' },
    requiredBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    requiredBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
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
