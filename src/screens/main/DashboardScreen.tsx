import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { SyncService } from '../../services/SyncService';
import { DatabaseService } from '../../database/DatabaseService';
import { NotificationCenter } from '../../components/ui/NotificationCenter';
import { notificationService } from '../../services/NotificationService';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

export const DashboardScreen = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [assignedTasks, setAssignedTasks] = useState(0);
  const [inProgressTasks, setInProgressTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [savedTasks, setSavedTasks] = useState(0);
  const [isNotificationCenterVisible, setIsNotificationCenterVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const assignedResult = await DatabaseService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'ASSIGNED' AND (is_revoked IS NULL OR is_revoked = 0)"
      );
      const inProgressResult = await DatabaseService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'IN_PROGRESS' AND (is_revoked IS NULL OR is_revoked = 0)"
      );
      const completedResult = await DatabaseService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'COMPLETED'"
      );
      const savedResult = await DatabaseService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM tasks WHERE is_saved = 1 AND status != 'COMPLETED'"
      );
      setAssignedTasks(assignedResult[0]?.count ?? 0);
      setInProgressTasks(inProgressResult[0]?.count ?? 0);
      setCompletedTasks(completedResult[0]?.count ?? 0);
      setSavedTasks(savedResult[0]?.count ?? 0);
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handleForceSync = async () => {
    try {
      setIsSyncing(true);
      const result = await SyncService.performSync();
      
      if (result.success) {
        Alert.alert(
          'Sync Complete',
          `Uploaded: ${result.uploadedItems}\nDownloaded: ${result.downloadedTasks}`
        );
      } else {
        Alert.alert('Sync Failed', result.errors.join('\n') || 'Unknown error occurred.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', err.message);
    } finally {
      setIsSyncing(false);
      loadStats();
    }
  };

  const navigateToTasks = (filterValue: string) => {
    navigation.navigate('Tasks', { filter: filterValue });
  };

  const navigateToCaseDetails = (taskId: string) => {
    navigation.navigate('TaskDetail', { taskId });
  };

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((notifications) => {
      setUnreadNotifications(notifications.filter(n => !n.isRead).length);
    });
    // Ensure notifications are loaded
    notificationService.loadFromDb();
    return unsubscribe;
  }, []);

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>Good morning,</Text>
            <Text style={[styles.userName, { color: theme.colors.text }]}>{user?.name}</Text>
          </View>
          <TouchableOpacity style={[styles.bellIcon, { backgroundColor: theme.colors.surface }]} onPress={() => setIsNotificationCenterVisible(true)}>
            <Icon name="notifications-outline" size={24} color={theme.colors.text} />
            {unreadNotifications> 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.danger }]}>
                <Text style={styles.unreadBadgeText}>{unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <TouchableOpacity style={[styles.statItem, styles.statItemAssigned, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.primary }]} onPress={() => navigateToTasks('ASSIGNED')}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Assigned</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{assignedTasks}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statItem, styles.statItemInProgress, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.warning || '#f59e0b' }]} onPress={() => navigateToTasks('IN_PROGRESS')}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>In Progress</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{inProgressTasks}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <TouchableOpacity style={[styles.statItem, styles.statItemCompleted, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.success }]} onPress={() => navigateToTasks('COMPLETED')}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Completed</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{completedTasks}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.statItem, styles.statItemSaved, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.info || '#3b82f6' }]} onPress={() => navigateToTasks('SAVED')}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Saved</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{savedTasks}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.syncCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.syncHeader}>
            <Icon name="sync-outline" size={24} color={theme.colors.primary} />
            <Text style={[styles.syncTitle, { color: theme.colors.text }]}>Data Synchronization</Text>
          </View>
          <Text style={[styles.syncInfo, { color: theme.colors.textSecondary }]}>
            Keep your local data updated with the server to ensure latest task assignments and form templates.
          </Text>
          
          <TouchableOpacity 
            style={[
              styles.syncButton, 
              { backgroundColor: theme.colors.primary },
              isSyncing && styles.syncButtonDisabled
            ]} 
            onPress={handleForceSync}
            disabled={isSyncing}>
            {isSyncing ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <>
                <Icon name="cloud-download-outline" size={20} color={theme.colors.surface} />
                <Text style={[styles.syncButtonText, { color: theme.colors.surface }]}>Sync Now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      <NotificationCenter
        visible={isNotificationCenterVisible}
        onClose={() => setIsNotificationCenterVisible(false)}
        onNavigateToCase={navigateToCaseDetails}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  headerLeft: {
    flex: 1,
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
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  statItem: {
    flex: 1,
    padding: 16,
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
  syncCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  syncInfo: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
  },
  syncButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  spacer: {
    height: 40,
  },
});
