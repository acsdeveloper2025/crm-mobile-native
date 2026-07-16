// 2026-04-28 deep-audit fix (D15): single-screen agent diagnostics.
//
// Goal: when an agent calls support, ask one question — "open Profile →
// Diagnostics and read me what you see." All baseline state in one
// place. Also gives the agent a self-help surface ("last sync 12s ago —
// yes, sync is working") and the first user-facing path to ship the
// log ring buffer to backend (RemoteLogService.upload {source:'manual'}).
//
// Risks addressed:
//   - PII: push token is sensitive (anyone with the token can push
//     notifications to that device). Truncated to first 8 + last 4 chars.
//   - Performance: every section reads from existing services, mostly
//     sync. The one DB call is a single SELECT GROUP BY (cheap). Pull-to-
//     refresh re-fetches; no live polling.
//   - Crash safety: each data source wrapped in try/catch so a single
//     read failure produces a "(unavailable)" line instead of blanking
//     the whole screen. The wrapping ScreenErrorBoundary is the catch-
//     all if React render itself throws.
//   - Accessibility: every button has accessibilityLabel + role.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { config } from '../../config';
import { AuthService } from '../../services/AuthService';
import { NetworkService } from '../../services/NetworkService';
import { PushTokenService } from '../../services/PushTokenService';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';
import { SyncStateService } from '../../sync/SyncStateService';
import { RemoteLogService } from '../../services/RemoteLogService';
import { Logger, type LogBufferEntry } from '../../utils/logger';
import { formatRelativeTime } from '../../utils/relativeTime';
import { PreserveCase } from '../../components/ui/PreserveCase';

const TAG = 'DiagnosticsScreen';

interface QueueStat {
  entityType: string;
  status: string;
  count: number;
}

interface Snapshot {
  appVersion: string;
  platform: string;
  osVersion: string;
  userId: string;
  tokenExpiresAt: string;
  isOnline: boolean;
  connectionType: string;
  lastSyncAt: string;
  pendingItems: number;
  queueStats: QueueStat[];
  permissions: { camera: string; location: string; notifications: string };
  pushTokenMasked: string;
  freeSpaceMB: string;
  recentLogs: LogBufferEntry[];
}

const NA = '(unavailable)';
const PENDING = 'Loading...';

const initialSnapshot: Snapshot = {
  appVersion: PENDING,
  platform: PENDING,
  osVersion: PENDING,
  userId: PENDING,
  tokenExpiresAt: PENDING,
  isOnline: false,
  connectionType: PENDING,
  lastSyncAt: PENDING,
  pendingItems: 0,
  queueStats: [],
  permissions: { camera: PENDING, location: PENDING, notifications: PENDING },
  pushTokenMasked: PENDING,
  freeSpaceMB: PENDING,
  recentLogs: [],
};

const truncatePushToken = (token: string | null | undefined): string => {
  if (!token) return NA;
  if (token.length <= 16) return '***';
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return NA;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

// 2026-07-16: relative time moved to utils/relativeTime (pure + unit-tested).
// The old local copy only handled the past — it clamped negatives to zero —
// and the token line faked the future by replacing " ago" with " from now",
// so a valid token always read "0s from now" and an expired one read
// "35m from now". Both inverted, on the screen support reads aloud.
const formatRelative = formatRelativeTime;

export const DiagnosticsScreen: React.FC = () => {
  const { theme } = useTheme();
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingLogs, setSendingLogs] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // Each source guarded with try/catch — a single failure should not
  // blank the screen.
  const collect = useCallback(async () => {
    const next: Snapshot = { ...initialSnapshot };

    try {
      next.appVersion = config.appVersion || NA;
    } catch {
      next.appVersion = NA;
    }
    try {
      next.platform = Platform.OS;
      next.osVersion = String(Platform.Version);
    } catch {
      next.platform = NA;
      next.osVersion = NA;
    }
    try {
      const user = AuthService.getCurrentUser();
      next.userId = user?.id || NA;
    } catch {
      next.userId = NA;
    }
    try {
      const expiresAt = await AuthService.getTokenExpiry();
      next.tokenExpiresAt = expiresAt || NA;
    } catch {
      next.tokenExpiresAt = NA;
    }
    try {
      next.isOnline = NetworkService.getIsOnline();
      next.connectionType = NetworkService.getConnectionType();
    } catch {
      next.isOnline = false;
      next.connectionType = NA;
    }
    try {
      const status = await SyncStateService.getStatus(false);
      next.lastSyncAt = status.lastSyncAt || 'never';
      next.pendingItems = status.pendingItems;
    } catch {
      next.lastSyncAt = NA;
      next.pendingItems = 0;
    }
    try {
      next.queueStats = await SyncQueueRepository.getStatsByEntityType();
    } catch {
      next.queueStats = [];
    }
    if (Platform.OS === 'android') {
      try {
        const camera = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        const location = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        const notif =
          Platform.Version >= 33
            ? await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              )
            : true;
        next.permissions = {
          camera: camera ? 'granted' : 'denied',
          location: location ? 'granted' : 'denied',
          notifications: notif ? 'granted' : 'denied',
        };
      } catch {
        next.permissions = { camera: NA, location: NA, notifications: NA };
      }
    } else {
      next.permissions = {
        camera: 'iOS — see Settings',
        location: 'iOS — see Settings',
        notifications: 'iOS — see Settings',
      };
    }
    try {
      const token = await PushTokenService.getCachedPushToken();
      next.pushTokenMasked = truncatePushToken(token);
    } catch {
      next.pushTokenMasked = NA;
    }
    try {
      const fs = await RNFS.getFSInfo();
      next.freeSpaceMB = formatBytes(fs.freeSpace);
    } catch {
      next.freeSpaceMB = NA;
    }
    try {
      next.recentLogs = Logger.getRecentLogs(20, 'DEBUG');
    } catch {
      next.recentLogs = [];
    }

    setSnap(next);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line no-void
    void collect();
  }, [collect]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await collect();
    } finally {
      setRefreshing(false);
    }
  }, [collect]);

  const handleSendLogs = useCallback(async () => {
    setSendingLogs(true);
    setSendResult(null);
    try {
      const ok = await RemoteLogService.upload({ source: 'manual' });
      setSendResult(
        ok ? 'Logs sent to support.' : 'Failed to send logs. Try again later.',
      );
    } catch (e) {
      Logger.warn(TAG, 'manual log send failed', e);
      setSendResult('Failed to send logs. Try again later.');
    } finally {
      setSendingLogs(false);
    }
  }, []);

  const cardStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
    >
      {/* 2026-07-16: was a bare in-scroll <Text> title with no way back —
          the navigator sets headerShown:false, so a screen that doesn't
          render ScreenHeader has no back affordance at all. */}
      <ScreenHeader title="Diagnostics" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Pull down to refresh
        </Text>

        {/* App identity */}
        <Section title="App" theme={theme} cardStyle={cardStyle}>
          <Row label="Version" value={snap.appVersion} theme={theme} />
          <Row label="Platform" value={snap.platform} theme={theme} />
          <Row label="OS Version" value={snap.osVersion} theme={theme} />
        </Section>

        {/* Auth */}
        <Section title="Account" theme={theme} cardStyle={cardStyle}>
          <Row label="User ID" value={snap.userId} theme={theme} mono />
          {/* 2026-07-16: labelled "Token Expires" this read as "you are about
              to be logged out" — it is only the 15-minute ACCESS token, which
              the client renews silently on the next 401 (ApiClient's refresh
              interceptor). The session itself is the 30-day refresh token
              (AUTH_REFRESH_TTL_S), and FIELD_AGENT has no absolute session
              cap. Name it precisely so nobody reads a routine value as an
              outage during a support call. */}
          <Row
            label="Access Token"
            value={
              snap.tokenExpiresAt && snap.tokenExpiresAt !== NA
                ? `${snap.tokenExpiresAt} (${formatRelative(
                    snap.tokenExpiresAt,
                  )}) — auto-renews`
                : snap.tokenExpiresAt
            }
            theme={theme}
            mono
          />
        </Section>

        {/* Network */}
        <Section title="Network" theme={theme} cardStyle={cardStyle}>
          <Row
            label="Online"
            value={snap.isOnline ? 'Yes' : 'No'}
            theme={theme}
            highlight={snap.isOnline ? 'good' : 'bad'}
          />
          <Row label="Connection" value={snap.connectionType} theme={theme} />
        </Section>

        {/* Sync */}
        <Section title="Sync" theme={theme} cardStyle={cardStyle}>
          <Row
            label="Last Sync"
            value={
              snap.lastSyncAt && snap.lastSyncAt !== NA
                ? formatRelative(snap.lastSyncAt)
                : snap.lastSyncAt
            }
            theme={theme}
          />
          <Row
            label="Pending Items"
            value={String(snap.pendingItems)}
            theme={theme}
            highlight={snap.pendingItems > 0 ? 'warn' : 'good'}
          />
          {snap.queueStats.length > 0 && (
            <View style={styles.queueGrid}>
              {snap.queueStats.map(qs => (
                <View
                  key={`${qs.entityType}_${qs.status}`}
                  style={[
                    styles.queueCell,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.queueLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {qs.entityType}
                  </Text>
                  <Text
                    style={[styles.queueValue, { color: theme.colors.text }]}
                  >
                    {qs.count}
                  </Text>
                  <Text
                    style={[
                      styles.queueStatus,
                      {
                        color:
                          qs.status === 'FAILED'
                            ? theme.colors.danger
                            : qs.status === 'PENDING'
                            ? theme.colors.warning
                            : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {qs.status}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Permissions */}
        <Section title="Permissions" theme={theme} cardStyle={cardStyle}>
          <Row
            label="Camera"
            value={snap.permissions.camera}
            theme={theme}
            highlight={snap.permissions.camera === 'granted' ? 'good' : 'warn'}
          />
          <Row
            label="Location"
            value={snap.permissions.location}
            theme={theme}
            highlight={
              snap.permissions.location === 'granted' ? 'good' : 'warn'
            }
          />
          <Row
            label="Notifications"
            value={snap.permissions.notifications}
            theme={theme}
            highlight={
              snap.permissions.notifications === 'granted' ? 'good' : 'warn'
            }
          />
        </Section>

        {/* Storage + push token */}
        <Section title="Device" theme={theme} cardStyle={cardStyle}>
          <Row label="Free Space" value={snap.freeSpaceMB} theme={theme} />
          <Row
            label="Push Token"
            value={snap.pushTokenMasked}
            theme={theme}
            mono
          />
        </Section>

        {/* Recent logs */}
        <Section
          title={`Recent Logs (${snap.recentLogs.length})`}
          theme={theme}
          cardStyle={cardStyle}
        >
          {snap.recentLogs.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No log entries yet.
            </Text>
          ) : (
            snap.recentLogs.slice(-10).map((entry, idx) => (
              <PreserveCase
                key={`${idx}_${entry.timestamp}`}
                style={[styles.logLine, { color: theme.colors.textSecondary }]}
                numberOfLines={2}
              >
                {`[${entry.level}] ${entry.tag}: ${entry.message}`}
              </PreserveCase>
            ))
          )}
        </Section>

        {/* Send logs button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: sendingLogs
                ? theme.colors.surfaceAlt
                : theme.colors.primary,
              borderColor: theme.colors.primaryDark,
            },
          ]}
          onPress={handleSendLogs}
          disabled={sendingLogs}
          accessibilityRole="button"
          accessibilityLabel="Send logs to support"
        >
          <Text style={styles.sendButtonText}>
            {sendingLogs ? 'Sending...' : 'Send Logs to Support'}
          </Text>
        </TouchableOpacity>
        {sendResult ? (
          <Text
            style={[
              styles.sendResult,
              {
                color: sendResult.startsWith('Logs sent')
                  ? theme.colors.success
                  : theme.colors.danger,
              },
            ]}
          >
            {sendResult}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

interface SectionProps {
  title: string;
  theme: ReturnType<typeof useTheme>['theme'];
  cardStyle: object;
  children: React.ReactNode;
}
const Section: React.FC<SectionProps> = ({
  title,
  theme,
  cardStyle,
  children,
}) => (
  <View style={[styles.card, cardStyle]}>
    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
      {title}
    </Text>
    {children}
  </View>
);

interface RowProps {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>['theme'];
  mono?: boolean;
  highlight?: 'good' | 'warn' | 'bad';
}
const Row: React.FC<RowProps> = ({ label, value, theme, mono, highlight }) => {
  const valueColor =
    highlight === 'good'
      ? theme.colors.success
      : highlight === 'warn'
      ? theme.colors.warning
      : highlight === 'bad'
      ? theme.colors.danger
      : theme.colors.textSecondary;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
      <PreserveCase
        style={[
          styles.rowValue,
          { color: valueColor },
          mono && styles.rowValueMono,
        ]}
        numberOfLines={2}
      >
        {value}
      </PreserveCase>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  subtitle: { fontSize: 12, marginBottom: 16 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  rowLabel: { fontSize: 13, flexShrink: 0, maxWidth: '40%' },
  rowValue: { fontSize: 13, flex: 1, textAlign: 'right' },
  rowValueMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  queueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  queueCell: {
    minWidth: '30%',
    flexGrow: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  queueLabel: { fontSize: 10 },
  queueValue: { fontSize: 18, fontWeight: '700', marginVertical: 2 },
  queueStatus: { fontSize: 10, fontWeight: '600' },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginBottom: 4,
  },
  empty: { fontSize: 13, fontStyle: 'italic' },
  sendButton: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 12,
  },
  sendButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  sendResult: { fontSize: 13, textAlign: 'center', marginTop: 8 },
});
