import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { DatabaseService } from '../../database/DatabaseService';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';

interface SyncQueueItem {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  payload_json: string;
}

export const SyncLogsScreen = () => {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'FAILED'>('FAILED');

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const query = filter === 'FAILED'
        ? `SELECT * FROM sync_queue WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 100`
        : `SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT 100`;
        
      const results = await DatabaseService.query<SyncQueueItem>(query);
      setLogs(results);
    } catch (e) {
      console.error('Failed to load sync logs', e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleRetryAll = async () => {
    try {
      // Re-queue all failed items
      await DatabaseService.execute(
        `UPDATE sync_queue SET status = 'PENDING', attempts = 0, next_retry_at = NULL WHERE status = 'FAILED'`
      );
      Alert.alert('Success', 'All failed sync items have been reset to PENDING.', [
        { text: 'OK', onPress: loadLogs }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to retry sync queue.');
    }
  };

  const handleClearLogs = async () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to permanently delete all completed and failed sync logs? Un-synced data may be lost forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            try {
              await DatabaseService.execute(`DELETE FROM sync_queue`);
              loadLogs();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: SyncQueueItem }) => {
    const isError = item.status === 'FAILED';
    
    return (
      <View style={[
        styles.logCard, 
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        isError && [styles.logCardError, { borderColor: theme.colors.danger }]
      ]}>
        <View style={styles.logHeader}>
          <Text style={[styles.logType, { color: theme.colors.text }]}>{item.action_type} {item.entity_type}</Text>
          <View style={[
            styles.badge, 
            { backgroundColor: theme.colors.surfaceAlt },
            isError ? [styles.badgeError, { backgroundColor: theme.colors.danger + '20' }] : styles.badgeDefault
          ]}>
            <Text style={[
              styles.badgeText, 
              { color: theme.colors.textMuted },
              isError && [styles.badgeTextError, { color: theme.colors.danger }]
            ]}>{item.status}</Text>
          </View>
        </View>
        
        <Text style={[styles.logMeta, { color: theme.colors.textSecondary }]}>ID: {item.entity_id}</Text>
        <Text style={[styles.logMeta, { color: theme.colors.textSecondary }]}>Attempts: {item.attempts}</Text>
        <Text style={[styles.logDate, { color: theme.colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
        
        {isError && item.last_error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.colors.danger + '10', borderLeftColor: theme.colors.danger }]}>
            <Text style={[styles.errorTitle, { color: theme.colors.danger }]}>Error Message:</Text>
            <Text style={[styles.errorText, { color: theme.colors.text }]}>{item.last_error}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity 
          style={[
            styles.tab, 
            filter === 'FAILED' && [styles.tabActive, { backgroundColor: theme.colors.danger + '10' }]
          ]}
          onPress={() => setFilter('FAILED')}>
          <Text style={[
            styles.tabText, 
            { color: theme.colors.textMuted },
            filter === 'FAILED' && [styles.tabTextActive, { color: theme.colors.danger }]
          ]}>
            Failed Only
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.tab, 
            filter === 'ALL' && [styles.tabActive, { backgroundColor: theme.colors.primary + '10' }]
          ]}
          onPress={() => setFilter('ALL')}>
          <Text style={[
            styles.tabText, 
            { color: theme.colors.textMuted },
            filter === 'ALL' && [styles.tabTextActive, { color: theme.colors.primary }]
          ]}>
            All Traffic
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLogs} tintColor={theme.colors.primary} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="checkmark-circle-outline" size={64} color={theme.colors.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>Sync queue is healthy.</Text>
            <Text style={[styles.emptySubText, { color: theme.colors.textMuted }]}>No {filter.toLowerCase()} logs found.</Text>
          </View>
        }
      />

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.colors.primary }]} 
          onPress={handleRetryAll}>
          <Icon name="refresh" size={20} color={theme.colors.surface} />
          <Text style={[styles.actionButtonText, { color: theme.colors.surface }]}>Retry Failed</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.dangerButton, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.danger }]} 
          onPress={handleClearLogs}>
          <Icon name="trash-outline" size={20} color={theme.colors.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText, { color: theme.colors.danger }]}>Clear Logs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
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
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dangerButton: {
    borderWidth: 1,
  },
  dangerText: {}
});
