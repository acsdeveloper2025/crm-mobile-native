import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { Logger } from '../../utils/logger';
import {
  notificationService,
  NotificationData,
} from '../../services/NotificationService';
import Icon from 'react-native-vector-icons/Ionicons';

interface NotificationCenterProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToCase?: (taskId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  visible,
  onClose,
  onNavigateToCase,
}) => {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      notificationService.ensureLoaded().catch(() => undefined);
      loadNotifications();
    }
  }, [visible]);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(updatedNotifications => {
      setNotifications(updatedNotifications);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      await notificationService.refreshFromBackend();
    } catch (error) {
      Logger.error('NotificationCenter', 'Failed to load notifications', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const handleNotificationPress = async (notification: NotificationData) => {
    try {
      if (!notification.isRead) {
        await notificationService.markAsRead(notification.id);
      }

      if (notification.taskId && onNavigateToCase) {
        onNavigateToCase(notification.taskId);
        onClose();
      }
    } catch (error) {
      Logger.error(
        'NotificationCenter',
        'Failed to handle notification press',
        error,
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
    } catch (error) {
      Logger.error('NotificationCenter', 'Failed to mark all as read', error);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await notificationService.clearAllNotifications();
            } catch (error) {
              Logger.error(
                'NotificationCenter',
                'Failed to clear notifications',
                error,
              );
            }
          },
        },
      ],
    );
  };

  const getNotificationIconName = (type: string) => {
    switch (type) {
      case 'CASE_ASSIGNED':
        return 'checkmark-circle';
      case 'CASE_REASSIGNED':
        return 'time';
      case 'CASE_REMOVED':
        return 'close-circle';
      case 'CASE_COMPLETED':
        return 'checkmark-circle';
      case 'CASE_REVOKED':
        return 'close-circle';
      case 'CASE_APPROVED':
        return 'checkmark-circle';
      case 'CASE_REJECTED':
        return 'close-circle';
      case 'SYSTEM_MAINTENANCE':
        return 'build';
      case 'APP_UPDATE':
        return 'information-circle';
      case 'EMERGENCY_ALERT':
        return 'warning';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string, priority?: string) => {
    if (priority === 'URGENT') return theme.colors.danger;
    if (priority === 'HIGH') return theme.colors.warning;

    switch (type) {
      case 'CASE_ASSIGNED':
      case 'CASE_REASSIGNED':
        return theme.colors.info;
      case 'CASE_COMPLETED':
      case 'CASE_APPROVED':
        return theme.colors.success;
      case 'CASE_REVOKED':
      case 'CASE_REJECTED':
      case 'EMERGENCY_ALERT':
        return theme.colors.danger;
      case 'CASE_REMOVED':
        return theme.colors.warning;
      default:
        return theme.colors.textSecondary;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return dateString;
    }
  };

  const renderNotificationItem = ({ item }: { item: NotificationData }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
        !item.isRead && styles.unreadNotification,
        !item.isRead && { borderLeftColor: theme.colors.primary },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Icon
              name={getNotificationIconName(item.type)}
              size={20}
              color={getNotificationColor(item.type, item.priority)}
            />
          </View>
          <View style={styles.notificationInfo}>
            <Text
              style={[styles.notificationTitle, { color: theme.colors.text }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.notificationMessage,
                { color: theme.colors.textSecondary },
              ]}
              numberOfLines={3}
            >
              {item.message}
            </Text>
            {item.caseNumber && (
              <Text
                style={[styles.caseNumber, { color: theme.colors.primary }]}
              >
                Case: {item.caseNumber}
              </Text>
            )}
          </View>
          <View style={styles.notificationMeta}>
            {item.priority === 'URGENT' && (
              <View
                style={[
                  styles.urgentBadge,
                  {
                    backgroundColor: theme.colors.danger + '20',
                    borderColor: theme.colors.danger,
                  },
                ]}
              >
                <Text
                  style={[styles.urgentText, { color: theme.colors.danger }]}
                >
                  URGENT
                </Text>
              </View>
            )}
            {item.priority === 'HIGH' && (
              <View
                style={[
                  styles.highBadge,
                  {
                    backgroundColor: theme.colors.warning + '20',
                    borderColor: theme.colors.warning,
                  },
                ]}
              >
                <Text
                  style={[styles.highText, { color: theme.colors.warning }]}
                >
                  HIGH
                </Text>
              </View>
            )}
            {!item.isRead && (
              <View
                style={[
                  styles.unreadDot,
                  { backgroundColor: theme.colors.primary },
                ]}
              />
            )}
          </View>
        </View>
        <Text style={[styles.timestamp, { color: theme.colors.textMuted }]}>
          {formatDate(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <View
                style={[
                  styles.unreadBadge,
                  { backgroundColor: theme.colors.danger },
                ]}
              >
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleMarkAllAsRead}
              >
                <Icon
                  name="checkmark-done"
                  size={20}
                  color={theme.colors.info}
                />
                <Text
                  style={[
                    styles.headerButtonText,
                    { color: theme.colors.info },
                  ]}
                >
                  Mark All Read
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClearAll}
            >
              <Icon name="trash" size={20} color={theme.colors.danger} />
              <Text
                style={[
                  styles.headerButtonText,
                  { color: theme.colors.danger },
                ]}
              >
                Clear
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              style={[
                styles.loadingText,
                { color: theme.colors.textSecondary },
              ]}
            >
              Loading notifications...
            </Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.centerContainer}>
            <Icon
              name="notifications-off"
              size={64}
              color={theme.colors.border}
            />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              No notifications
            </Text>
            <Text
              style={[
                styles.emptySubtext,
                { color: theme.colors.textSecondary },
              ]}
            >
              You'll see alerts here when you receive them.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotificationItem}
            keyExtractor={item => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            }
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginRight: 8,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  headerButtonText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  unreadBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContainer: {
    paddingBottom: 24,
  },
  notificationItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  unreadNotification: {
    borderLeftWidth: 4,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationInfo: {
    flex: 1,
    marginRight: 8,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 20,
  },
  notificationMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  caseNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  notificationMeta: {
    alignItems: 'flex-end',
  },
  urgentBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  urgentText: {
    fontSize: 10,
    fontWeight: '700',
  },
  highBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  highText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
    marginLeft: 48,
  },
});
