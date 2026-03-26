import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../context/ThemeContext';
import { NotificationCenter } from '../../components/ui/NotificationCenter';
import { notificationService } from '../../services/NotificationService';
import { Logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { TaskRepository } from '../../repositories/TaskRepository';
import { SyncTasksUseCase } from '../../usecases/SyncTasksUseCase';
import { DashboardProjection } from '../../projections/DashboardProjection';

export const DashboardScreen = () => {
  const TAG = 'DashboardScreen';
  const { user } = useAuth();
  const { theme, themePreference, setThemePreference } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [assignedTasks, setAssignedTasks] = useState(0);
  const [inProgressTasks, setInProgressTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [savedTasks, setSavedTasks] = useState(0);
  const [isNotificationCenterVisible, setIsNotificationCenterVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [recentActivity, setRecentActivity] = useState<Array<{ id: string; text: string }>>([]);
  const [lastSyncLabel, setLastSyncLabel] = useState('Not synced yet');

  const loadStats = useCallback(async () => {
    try {
      const stats = await TaskRepository.getDashboardStats();
      setAssignedTasks(stats.assignedCount);
      setInProgressTasks(stats.inProgressCount);
      setCompletedTasks(stats.completedCount);
      setSavedTasks(stats.savedCount);
    } catch { /* ignore */ }
  }, []);

  const loadRecentActivity = useCallback(async () => {
    try {
      const dashboard = await DashboardProjection.getStats();
      const lastSync = dashboard.lastSyncAt;
      const taskRows = await TaskRepository.listRecentActivity(3);

      const items: Array<{ id: string; text: string }> = [];
      if (lastSync) {
        setLastSyncLabel(new Date(lastSync).toLocaleString());
        items.push({
          id: 'last-sync',
          text: `Last sync: ${new Date(lastSync).toLocaleString()}`,
        });
      } else {
        setLastSyncLabel('Not synced yet');
      }

      for (const row of taskRows) {
        const taskLabel = row.verificationTaskNumber || row.id.slice(0, 8);
        const when = row.updatedAt ? ` (${new Date(row.updatedAt).toLocaleString()})` : '';
        items.push({
          id: row.id,
          text: `${taskLabel} - ${row.customerName} - ${row.status.replace('_', ' ')}${when}`,
        });
      }

      setRecentActivity(items);
    } catch {
      setRecentActivity([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      notificationService.refreshFromBackend().catch(error => {
        Logger.warn(TAG, 'Failed to refresh notifications on focus', error);
      });
      Promise.all([loadStats(), loadRecentActivity()]).catch(() => undefined);
    }, [loadStats, loadRecentActivity])
  );

  const getActiveTaskCount = useCallback(async (): Promise<number> => {
    return TaskRepository.getActiveTaskCount();
  }, []);

  const handleForceSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      const { result } = await SyncTasksUseCase.execute();
      const activeTasks = await getActiveTaskCount();
      
      if (result.success) {
        Alert.alert(
          'Sync Complete',
          `Task Status Uploaded: ${result.uploadedStatusItems}\nPending Data Uploaded: ${result.uploadedItems}\nDownloaded Updates: ${result.downloadedTasks}\nAvailable Tasks: ${activeTasks}`
        );
      } else {
        Alert.alert('Sync Failed', result.errors.join('\n') || 'Unknown error occurred.');
      }
    } catch (err: unknown) {
      Alert.alert('Sync Error', err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
      await notificationService.refreshFromBackend().catch(error => {
        Logger.warn(TAG, 'Failed to refresh notifications after sync', error);
      });
      loadStats();
      loadRecentActivity();
    }
  }, [getActiveTaskCount, loadRecentActivity, loadStats]);

  const navigateToTasks = (filterValue: string) => {
    if (filterValue === 'ASSIGNED') {
      navigation.navigate('Assigned');
      return;
    }
    if (filterValue === 'IN_PROGRESS') {
      navigation.navigate('InProgress');
      return;
    }
    if (filterValue === 'COMPLETED') {
      navigation.navigate('Completed');
      return;
    }
    if (filterValue === 'SAVED') {
      navigation.navigate('Saved');
      return;
    }
  };

  const navigateToCaseDetails = (taskId: string) => {
    navigation.navigate('TaskDetail', { taskId });
  };

  const cycleThemePreference = () => {
    const sequence: ThemePreference[] = ['light', 'dark', 'system'];
    const index = sequence.indexOf(themePreference);
    const next = sequence[(index + 1) % sequence.length];
    setThemePreference(next);
  };

  const getThemeIcon = () => {
    if (themePreference === 'light') {
      return 'sunny-outline';
    }
    if (themePreference === 'dark') {
      return 'moon-outline';
    }
    return 'settings-outline';
  };

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((notifications) => {
      setUnreadNotifications(notifications.filter(n => !n.isRead).length);
    });
    notificationService.ensureLoaded().catch(error => {
      Logger.warn(TAG, 'Failed to ensure notification cache is loaded', error);
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={[styles.contentContainer, { paddingTop: Math.max(insets.top, 16) + 8 }]}
      >
        <View style={styles.header}>
        <View style={styles.headerLeft}>
            <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1} ellipsizeMode="tail">
              Welcome, {user?.name || 'Agent'}!
            </Text>
            <Text style={[styles.greeting, { color: theme.colors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">
              Here is your daily summary.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={[styles.bellIcon, { backgroundColor: theme.colors.surface }]} onPress={cycleThemePreference}>
              <Icon name={getThemeIcon()} size={20} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bellIcon, { backgroundColor: theme.colors.surface }]} onPress={() => setIsNotificationCenterVisible(true)}>
              <Icon name="notifications-outline" size={24} color={theme.colors.text} />
              {unreadNotifications > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: theme.colors.danger }]}>
                  <Text style={styles.unreadBadgeText}>{unreadNotifications}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bellIcon, { backgroundColor: theme.colors.surface }]} onPress={() => navigation.navigate('Profile')}>
              <Icon name="person-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.syncSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.syncSectionHeader}>
            <Text style={[styles.syncTitle, { color: theme.colors.text }]}>Sync Center</Text>
            <Text style={[styles.syncMeta, { color: theme.colors.textMuted }]}>Last sync: {lastSyncLabel}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.syncButtonLegacy,
              { backgroundColor: theme.colors.primary },
              isSyncing && styles.syncButtonDisabled
            ]}
            onPress={handleForceSync}
            disabled={isSyncing}>
            {isSyncing ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <>
                <Icon name="sync-outline" size={20} color={theme.colors.surface} />
                <Text style={[styles.syncButtonText, { color: theme.colors.surface }]}>
                  Sync with Server
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <TouchableOpacity style={[styles.statItem, styles.statItemAssigned, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.assigned }]} onPress={() => navigateToTasks('ASSIGNED')}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Assigned</Text>
              <Icon name="clipboard-outline" size={16} color={theme.colors.assigned} />
            </View>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{assignedTasks}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statItem, styles.statItemInProgress, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.warning }]} onPress={() => navigateToTasks('IN_PROGRESS')}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>In Progress</Text>
              <Icon name="time-outline" size={16} color={theme.colors.warning} />
            </View>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{inProgressTasks}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <TouchableOpacity style={[styles.statItem, styles.statItemCompleted, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.completed }]} onPress={() => navigateToTasks('COMPLETED')}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Completed</Text>
              <Icon name="checkmark-done-outline" size={16} color={theme.colors.completed} />
            </View>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{completedTasks}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statItem, styles.statItemSaved, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.saved }]} onPress={() => navigateToTasks('SAVED')}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Saved</Text>
              <Icon name="bookmark-outline" size={16} color={theme.colors.saved} />
            </View>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{savedTasks}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.recentSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.recentTitle, { color: theme.colors.text }]}>Recent Activity</Text>
          {recentActivity.length === 0 ? (
            <Text style={[styles.recentSubtitle, { color: theme.colors.textSecondary }]}>
              Sync to get the latest updates from the server.
            </Text>
          ) : (
            <View style={styles.recentList}>
              {recentActivity.map(item => (
                <Text key={item.id} style={[styles.recentItem, { color: theme.colors.textSecondary }]}>
                  {`• ${item.text}`}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.spacer} />
      </ScrollView>
      </SafeAreaView>

      <NotificationCenter
        visible={isNotificationCenterVisible}
        onClose={() => setIsNotificationCenterVisible(false)}
        onNavigateToCase={navigateToCaseDetails}
      />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 24,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    columnGap: 8,
  },
  bellIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    position: 'relative'
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  greeting: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  statItem: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderTopWidth: 4,
  },
  statItemAssigned: {},
  statItemInProgress: {},
  statItemCompleted: {},
  statItemSaved: {},
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncSection: {
    marginTop: 4,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  syncSectionHeader: {
    marginBottom: 10,
  },
  syncTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  syncMeta: {
    fontSize: 12,
  },
  syncButtonLegacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  syncButtonText: {
    marginLeft: 8,
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  recentSection: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  recentList: {
    rowGap: 6,
  },
  recentItem: {
    fontSize: 13,
    lineHeight: 18,
  },
  recentTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  recentSubtitle: {
    fontSize: 14,
  },
  spacer: {
    height: 40,
  },
});
