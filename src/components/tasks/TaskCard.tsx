import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Alert } from 'react-native';
import { LocalTask } from '../../types/mobile';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { TaskInfoModal } from './TaskInfoModal';
import { TaskRevokeModal } from './TaskRevokeModal';
import { useTaskManager } from '../../context/TaskContext';
import { RevokeReason } from '../../types/api';
import { SyncService } from '../../services/SyncService';
import { LocationService } from '../../services/LocationService';
import { TaskTimeline } from './TaskTimeline';

interface TaskCardProps {
  task: LocalTask;
  onPress: (task: LocalTask) => void;
  onStatusChange?: () => void;
  onAttachmentsPress?: (task: LocalTask) => void;
  isReorderEnabled?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  onStatusChange,
  onAttachmentsPress,
  isReorderEnabled = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}) => {
  const { theme } = useTheme();
  const { startTask, revokeTask } = useTaskManager();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [isAccepting, setIsAccepting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [revokeModalVisible, setRevokeModalVisible] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      })
    ]).start();
  }, [fadeAnim, slideAnim]);

  const getStatusColor = (status: string) => {
    if (!status) return theme.colors.textMuted;
    switch (status.toUpperCase()) {
      case 'ASSIGNED': return theme.colors.primary;
      case 'IN_PROGRESS': return theme.colors.warning;
      case 'COMPLETED': return theme.colors.success;
      default: return theme.colors.textMuted;
    }
  };

  const getCardAccentColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ASSIGNED':
        return theme.colors.assigned;
      case 'IN_PROGRESS':
        return theme.colors.inProgress;
      case 'COMPLETED':
        return theme.colors.completed;
      default:
        return theme.colors.border;
    }
  };

  const getDynamicTimestamp = () => {
    if (task.is_revoked && task.revoked_at) {
      return `Revoked on ${new Date(task.revoked_at).toLocaleString()}`;
    }
    if (task.status === 'COMPLETED' && task.completedAt) {
      return `Completed on ${new Date(task.completedAt).toLocaleString()}`;
    }
    if (task.is_saved && task.saved_at) {
      return `Saved on ${new Date(task.saved_at).toLocaleString()}`;
    }
    if (task.status === 'IN_PROGRESS' && task.in_progress_at) {
      return `Started on ${new Date(task.in_progress_at).toLocaleString()}`;
    }
    if (task.assignedAt) {
      return `Assigned on ${new Date(task.assignedAt).toLocaleString()}`;
    }
    return '';
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const validation = await SyncService.validateVisitStart(task.id);
      if (!validation.allowed) {
        Alert.alert(
          'Cannot Start Visit',
          validation.reason || 'Distance validation failed.',
        );
        return;
      }

      const recordedLocation = await LocationService.recordLocation(
        task.id,
        'CASE_START',
      );
      if (!recordedLocation) {
        Alert.alert(
          'Cannot Start Visit',
          'Location capture is required before starting the visit.',
        );
        return;
      }

      await startTask(task.id);
      onStatusChange?.();
      onPress({ ...task, status: 'IN_PROGRESS' });
    } catch (e: any) {
      Alert.alert('Error', 'Failed to start visit: ' + e.message);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRevoke = async (reason: RevokeReason) => {
    setIsRevoking(true);
    try {
      await revokeTask(task.id, reason);
      setRevokeModalVisible(false);
      onStatusChange?.();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to revoke task: ' + e.message);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <>
      <AnimatedTouchableOpacity 
        style={[
          styles.card, 
          { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderLeftColor: getCardAccentColor(task.status),
          },
          (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS' || task.status === 'COMPLETED') && styles.cardStatusAccent,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]} 
        onPress={() => onPress(task)} 
        activeOpacity={0.7}>
        <View style={styles.header}>
          <Text style={[styles.verificationType, { color: theme.colors.primary }]}>
            {task.verificationTypeName || task.verificationType || 'VERIFICATION'}
          </Text>
          {task.is_saved === 1 && (
            <View style={[styles.savedBadge, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning + '50' }]}>
              <Text style={[styles.savedBadgeText, { color: theme.colors.warning }]}>📝 Draft Saved</Text>
            </View>
          )}
        </View>

        <Text style={[styles.caseId, { color: theme.colors.text }]}>
          Case ID: #{task.caseId}  |  VT ID: {task.verificationTaskNumber || 'N/A'}
        </Text>
        <Text style={[styles.customerName, { color: theme.colors.text }]}>{task.customerName}</Text>
        
        <View style={styles.addressContainer}>
          <Text style={styles.addressIcon}>📍</Text>
          <Text style={[styles.addressText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {task.addressStreet}, {task.addressCity}, {task.addressState} {task.addressPincode}
          </Text>
        </View>

        <Text style={[styles.timestamp, { color: theme.colors.textMuted }]}>{getDynamicTimestamp()}</Text>
        
        {task.is_revoked === 1 && (
          <View style={[styles.revokedBanner, { backgroundColor: theme.colors.danger + '20' }]}>
            <Text style={[styles.revokedBannerText, { color: theme.colors.danger }]}>REVOKED</Text>
          </View>
        )}

        {task.status === 'COMPLETED' && (
          <View style={styles.timelineWrap}>
            <TaskTimeline task={task} />
          </View>
        )}

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <View style={styles.actionButtons}>
            {(task.status === 'ASSIGNED' && task.is_revoked !== 1) && (
              <>
                <TouchableOpacity style={styles.iconButton} onPress={handleAccept} disabled={isAccepting}>
                  {isAccepting ? (
                    <ActivityIndicator size="small" color={theme.colors.success} />
                  ) : (
                    <Icon name="checkmark-circle" size={32} color={theme.colors.success} />
                  )}
                  <Text style={[styles.actionLabel, { color: theme.colors.success }]}>
                    {isAccepting ? 'Accepting...' : 'Accept'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconButton} onPress={() => setRevokeModalVisible(true)}>
                  <Icon name="close-circle" size={32} color={theme.colors.danger} />
                  <Text style={[styles.actionLabel, { color: theme.colors.danger }]}>Revoke</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.iconButton} onPress={() => setInfoModalVisible(true)}>
              <Icon name="information-circle" size={32} color={theme.colors.info || '#3b82f6'} />
              <Text style={[styles.actionLabel, { color: theme.colors.info || '#3b82f6' }]}>Info</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconButton} onPress={() => (onAttachmentsPress ? onAttachmentsPress(task) : onPress(task))}>
              <Icon name="attach" size={28} color={theme.colors.primary} />
              {(task.attachment_count || 0)> 0 && (
                <View style={[styles.badgeContainer, { backgroundColor: theme.colors.danger }]}>
                  <Text style={styles.badgeText}>{task.attachment_count}</Text>
                </View>
              )}
              <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>Attachments</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.statusBadgeContainer}>
            {isReorderEnabled && (
              <View style={styles.reorderButtons}>
                <TouchableOpacity
                  style={[styles.reorderButton, !canMoveUp && styles.reorderButtonDisabled]}
                  onPress={onMoveUp}
                  disabled={!canMoveUp}>
                  <Icon
                    name="chevron-up-outline"
                    size={16}
                    color={canMoveUp ? theme.colors.textSecondary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderButton, !canMoveDown && styles.reorderButtonDisabled]}
                  onPress={onMoveDown}
                  disabled={!canMoveDown}>
                  <Icon
                    name="chevron-down-outline"
                    size={16}
                    color={canMoveDown ? theme.colors.textSecondary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: getStatusColor(task.status) }]}>
              <Text style={[styles.statusText, { color: theme.colors.surface }]}>{task.status ? task.status.replace('_', ' ') : 'UNKNOWN'}</Text>
            </View>
            {(task.status === 'IN_PROGRESS' || task.status === 'REVISIT') && (
              <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
            )}
          </View>
        </View>
      </AnimatedTouchableOpacity>

      <TaskInfoModal 
        visible={infoModalVisible} 
        task={task} 
        onClose={() => setInfoModalVisible(false)} 
      />

      <TaskRevokeModal 
        visible={revokeModalVisible} 
        isRevoking={isRevoking}
        onClose={() => setRevokeModalVisible(false)} 
        onRevoke={handleRevoke}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
  },
  cardStatusAccent: {
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  verificationType: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  savedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  savedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  caseId: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  addressText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 12,
    marginBottom: 12,
  },
  revokedBanner: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  revokedBannerText: {
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  timelineWrap: {
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    position: 'relative',
    padding: 4,
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reorderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderButton: {
    width: 28,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  reorderButtonDisabled: {
    opacity: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
});
