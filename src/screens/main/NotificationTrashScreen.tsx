import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { Logger } from '../../utils/logger';
import { notificationService } from '../../services/NotificationService';

const TAG = 'NotificationTrashScreen';

type TrashRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  taskId?: string | null;
  taskNumber?: string | null;
  caseNumber?: string | null;
  createdAt?: string;
  deletedAt?: string;
};

const formatDate = (s?: string) => {
  if (!s) return '';
  try {
    const d = new Date(s);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch {
    return s;
  }
};

export const NotificationTrashScreen: React.FC = () => {
  const { theme } = useTheme();
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notificationService.fetchTrash();
      if (!isMountedRef.current) return;
      setRows(data as TrashRow[]);
    } catch (err) {
      Logger.error(TAG, 'Failed to load trash', err);
      Alert.alert('Error', 'Failed to load deleted notifications.');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const onLongPress = (id: string) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds(new Set([id]));
    } else {
      toggleSelect(id);
    }
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const restoreIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await notificationService.restoreNotifications(ids);
      setRows(prev => prev.filter(r => !ids.includes(r.id)));
    } catch (err) {
      Logger.error(TAG, 'Failed to restore', err);
      Alert.alert('Error', 'Failed to restore notifications.');
    } finally {
      exitSelection();
    }
  };

  const handleRestoreOne = (id: string) => {
    Alert.alert(
      'Restore Notification',
      'Restore this notification to your active feed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => restoreIds([id]) },
      ],
    );
  };

  const handleRestoreSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      'Restore Selected',
      `Restore ${ids.length} notification${ids.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => restoreIds(ids) },
      ],
    );
  };

  const renderItem = ({ item }: { item: TrashRow }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (selectionMode) toggleSelect(item.id);
          else handleRestoreOne(item.id);
        }}
        onLongPress={() => onLongPress(item.id)}
        style={[
          styles.row,
          {
            backgroundColor: isSelected
              ? theme.colors.primary + '15'
              : theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.iconCol}>
          {selectionMode ? (
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: isSelected
                    ? theme.colors.primary
                    : theme.colors.background,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              {isSelected && <Icon name="checkmark" size={16} color="#fff" />}
            </View>
          ) : (
            <Icon
              name="trash-outline"
              size={22}
              color={theme.colors.textSecondary}
            />
          )}
        </View>
        <View style={styles.bodyCol}>
          <Text
            style={[styles.title, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.message, { color: theme.colors.textSecondary }]}
            numberOfLines={2}
          >
            {item.message}
          </Text>
          {(item.caseNumber || item.taskNumber || item.taskId) && (
            <Text
              style={[styles.meta, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              {[
                item.caseNumber ? `Case: ${item.caseNumber}` : null,
                item.taskNumber
                  ? `Task: ${item.taskNumber}`
                  : item.taskId
                  ? `Task: ${item.taskId.slice(0, 8)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          <Text style={[styles.deletedAt, { color: theme.colors.textMuted }]}>
            Deleted {formatDate(item.deletedAt)}
          </Text>
        </View>
        {!selectionMode && (
          <TouchableOpacity
            onPress={() => handleRestoreOne(item.id)}
            style={styles.restoreBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="arrow-undo" size={20} color={theme.colors.info} />
            <Text style={[styles.restoreText, { color: theme.colors.info }]}>
              Restore
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const headerRight = selectionMode ? (
    <View style={styles.headerActions}>
      <TouchableOpacity
        onPress={handleRestoreSelected}
        style={styles.headerBtn}
        disabled={selectedIds.size === 0}
      >
        <Icon name="arrow-undo" size={20} color={theme.colors.info} />
        <Text style={[styles.headerBtnText, { color: theme.colors.info }]}>
          Restore
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={exitSelection} style={styles.headerBtn}>
        <Icon name="close" size={22} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScreenHeader
        title={selectionMode ? `${selectedIds.size} selected` : 'Trash'}
        rightAction={headerRight}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Icon
            name="trash-bin-outline"
            size={64}
            color={theme.colors.border}
          />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            Trash is empty
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: theme.colors.textSecondary },
            ]}
          >
            Deleted notifications appear here for 30 days before being
            permanently removed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconCol: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  message: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  meta: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  deletedAt: { fontSize: 11 },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 8,
  },
  restoreText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBtnText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
});
