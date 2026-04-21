import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SyncLogsSkeleton } from '../../components/ui/Skeleton';
import { Logger } from '../../utils/logger';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';
import type { SyncQueueItem } from '../../types/mobile';

export const SyncLogsScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'FAILED'>('FAILED');
  const failedCount = logs.filter(item => item.status === 'FAILED').length;

  // B6 (audit 2026-04-21 round 2): guard loadLogs setState against
  // unmount. Without this, navigating away during a slow DB read
  // produces the "can't setState on unmounted component" warning and
  // briefly wastes work rebuilding the list.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const results = await SyncQueueRepository.listLogs(filter);
      if (!isMountedRef.current) return;
      setLogs(results);
    } catch (e) {
      Logger.error('SyncLogsScreen', 'Failed to load sync logs', e);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleRetryAll = async () => {
    try {
      // Re-queue all failed items
      await SyncQueueRepository.retryAllFailed();
      Alert.alert(
        'Success',
        'All failed sync items have been reset to PENDING.',
        [{ text: 'OK', onPress: loadLogs }],
      );
    } catch (e: unknown) {
      Alert.alert(
        'Error',
        (e instanceof Error ? e.message : String(e)) ||
          'Failed to retry sync queue.',
      );
    }
  };

  const handleClearLogs = async () => {
    if (!__DEV__) {
      return;
    }

    Alert.alert(
      'Clear Logs',
      'Delete completed sync history only? Unsynced queue items will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Completed',
          style: 'destructive',
          onPress: async () => {
            try {
              await SyncQueueRepository.clearCompleted();
              loadLogs();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: SyncQueueItem }) => {
    const isError = item.status === 'FAILED';

    return (
      <View
        style={[
          styles.logCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          isError && [
            styles.logCardError,
            { borderColor: theme.colors.danger },
          ],
        ]}
      >
        <View style={styles.logHeader}>
          <Text style={[styles.logType, { color: theme.colors.text }]}>
            {item.actionType} {item.entityType}
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.colors.surfaceAlt },
              isError
                ? [
                    styles.badgeError,
                    { backgroundColor: theme.colors.danger + '20' },
                  ]
                : styles.badgeDefault,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: theme.colors.textMuted },
                isError && [
                  styles.badgeTextError,
                  { color: theme.colors.danger },
                ],
              ]}
            >
              {item.status}
            </Text>
          </View>
        </View>

        <Text style={[styles.logMeta, { color: theme.colors.textSecondary }]}>
          ID: {item.entityId}
        </Text>
        <Text style={[styles.logMeta, { color: theme.colors.textSecondary }]}>
          Attempts: {item.attempts}
        </Text>
        <Text style={[styles.logDate, { color: theme.colors.textMuted }]}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>

        {isError && item.lastError && (
          <View
            style={[
              styles.errorContainer,
              {
                backgroundColor: theme.colors.danger + '10',
                borderLeftColor: theme.colors.danger,
              },
            ]}
          >
            <Text style={[styles.errorTitle, { color: theme.colors.danger }]}>
              Error Message:
            </Text>
            <Text style={[styles.errorText, { color: theme.colors.text }]}>
              {item.lastError}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Sync Diagnostics" />
      {/* Header Tabs */}
      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        {/* U10 + U11 (audit 2026-04-21 round 2): 44×44 touch target via
            styles.tab (bumped to minHeight 44) and a11y role +
            selected state. */}
        <TouchableOpacity
          style={[
            styles.tab,
            filter === 'FAILED' && [
              styles.tabActive,
              { backgroundColor: theme.colors.danger + '10' },
            ],
          ]}
          onPress={() => setFilter('FAILED')}
          accessibilityRole="button"
          accessibilityState={{ selected: filter === 'FAILED' }}
          accessibilityLabel="Show failed sync logs only"
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.colors.textMuted },
              filter === 'FAILED' && [
                styles.tabTextActive,
                { color: theme.colors.danger },
              ],
            ]}
          >
            Failed Only
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            filter === 'ALL' && [
              styles.tabActive,
              { backgroundColor: theme.colors.primary + '10' },
            ],
          ]}
          onPress={() => setFilter('ALL')}
          accessibilityRole="button"
          accessibilityState={{ selected: filter === 'ALL' }}
          accessibilityLabel="Show all sync logs"
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.colors.textMuted },
              filter === 'ALL' && [
                styles.tabTextActive,
                { color: theme.colors.primary },
              ],
            ]}
          >
            All Traffic
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadLogs}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {loading ? (
              // M15 (audit 2026-04-21): row-shaped skeleton instead of a
              // centred spinner so the list preview matches the eventual
              // sync-queue layout.
              <SyncLogsSkeleton />
            ) : (
              <>
                <Icon
                  name="checkmark-circle-outline"
                  size={64}
                  color={theme.colors.success}
                />
                <Text style={[styles.emptyText, { color: theme.colors.text }]}>
                  Sync queue is healthy.
                </Text>
                <Text
                  style={[
                    styles.emptySubText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  No {filter.toLowerCase()} logs found.
                </Text>
              </>
            )}
          </View>
        }
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: theme.colors.primary },
            failedCount === 0 && styles.actionButtonDisabled,
          ]}
          onPress={handleRetryAll}
          disabled={failedCount === 0}
        >
          <Icon name="refresh" size={20} color={theme.colors.surface} />
          <Text
            style={[styles.actionButtonText, { color: theme.colors.surface }]}
          >
            Retry Failed {failedCount > 0 ? `(${failedCount})` : ''}
          </Text>
        </TouchableOpacity>
        {__DEV__ ? (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.dangerButton,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.danger,
              },
            ]}
            onPress={handleClearLogs}
          >
            <Icon name="trash-outline" size={20} color={theme.colors.danger} />
            <Text
              style={[
                styles.actionButtonText,
                styles.dangerText,
                { color: theme.colors.danger },
              ]}
            >
              Clear Completed
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    // U10 (round 2): raise padding + minHeight so the two filter tabs
    // clear the 44 px touch-target threshold.
    minHeight: 44,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  logCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  logCardError: {
    borderLeftWidth: 4,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logType: {
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeError: {},
  badgeDefault: {},
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeTextError: {},
  logMeta: {
    fontSize: 12,
    marginBottom: 2,
  },
  logDate: {
    fontSize: 12,
    marginTop: 4,
  },
  errorContainer: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  errorTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dangerButton: {
    borderWidth: 1,
  },
  dangerText: {},
});
