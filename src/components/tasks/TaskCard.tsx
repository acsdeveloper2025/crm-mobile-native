import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LocalTask } from '../../types/mobile';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { startVisitUseCase } from '../../usecases/StartVisitUseCase';

interface TaskCardProps {
  task: LocalTask;
  onPress: (task: LocalTask) => void;
  onStatusChange?: () => void;
  onAttachmentsPress?: (task: LocalTask) => void;
  onInfoPress?: (task: LocalTask) => void;
  onRevokePress?: (task: LocalTask) => void;
  isReorderEnabled?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveTask?: (taskId: string, direction: 'up' | 'down') => void;
}

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

const TaskCardComponent: React.FC<TaskCardProps> = ({
  task,
  onPress,
  onStatusChange,
  onAttachmentsPress,
  onInfoPress,
  onRevokePress,
  isReorderEnabled = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveTask,
}) => {
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [isAccepting, setIsAccepting] = useState(false);

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
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const getStatusColor = (status: string) => {
    if (!status) return theme.colors.textMuted;
    switch (status.toUpperCase()) {
      case 'ASSIGNED':
        return theme.colors.primary;
      case 'IN_PROGRESS':
        return theme.colors.warning;
      case 'COMPLETED':
        return theme.colors.success;
      default:
        return theme.colors.textMuted;
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
    if (task.isRevoked && task.revokedAt) {
      return `Revoked on ${new Date(task.revokedAt).toLocaleString()}`;
    }
    if (task.status === 'COMPLETED' && task.completedAt) {
      return `Completed on ${new Date(task.completedAt).toLocaleString()}`;
    }
    if (task.isSaved && task.savedAt) {
      return `Saved on ${new Date(task.savedAt).toLocaleString()}`;
    }
    if (task.status === 'IN_PROGRESS' && task.inProgressAt) {
      return `Started on ${new Date(task.inProgressAt).toLocaleString()}`;
    }
    if (task.assignedAt) {
      return `Assigned on ${new Date(task.assignedAt).toLocaleString()}`;
    }
    return '';
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await startVisitUseCase(task.id);
      onStatusChange?.();
    } catch (e: unknown) {
      Alert.alert(
        'Error',
        'Failed to accept task: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderLeftColor: getCardAccentColor(task.status),
        },
        (task.status === 'ASSIGNED' ||
          task.status === 'IN_PROGRESS' ||
          task.status === 'COMPLETED') &&
          styles.cardStatusAccent,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text
          style={[styles.verificationType, { color: theme.colors.primary }]}
        >
          {task.verificationTypeName || task.verificationType || 'VERIFICATION'}
        </Text>
        {task.isSaved === 1 && (
          <View
            style={[
              styles.savedBadge,
              {
                backgroundColor: theme.colors.warning + '20',
                borderColor: theme.colors.warning + '50',
              },
            ]}
          >
            <Text
              style={[styles.savedBadgeText, { color: theme.colors.warning }]}
            >
              Draft Saved
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.caseId, { color: theme.colors.text }]}>
        Case ID: #{task.caseId} | VT ID: {task.verificationTaskNumber || 'N/A'}
      </Text>
      <Text style={[styles.customerName, { color: theme.colors.text }]}>
        {task.customerName}
      </Text>

      <View style={styles.addressContainer}>
        <Text style={styles.addressIcon}>📍</Text>
        <Text
          style={[styles.addressText, { color: theme.colors.textSecondary }]}
          numberOfLines={2}
        >
          {task.addressStreet}, {task.addressCity}, {task.addressState}{' '}
          {task.addressPincode}
        </Text>
      </View>

      <Text style={[styles.timestamp, { color: theme.colors.textMuted }]}>
        {getDynamicTimestamp()}
      </Text>

      {task.isRevoked === 1 && (
        <View
          style={[
            styles.revokedBanner,
            { backgroundColor: theme.colors.danger + '20' },
          ]}
        >
          <Text
            style={[styles.revokedBannerText, { color: theme.colors.danger }]}
          >
            REVOKED
          </Text>
        </View>
      )}

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.actionButtons}>
          {task.status === 'ASSIGNED' && task.isRevoked !== 1 && (
            <>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleAccept}
                disabled={isAccepting}
                accessibilityRole="button"
                accessibilityLabel={
                  isAccepting ? 'Accepting task' : 'Accept task'
                }
              >
                {isAccepting ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.success}
                  />
                ) : (
                  <Icon
                    name="checkmark-circle"
                    size={32}
                    color={theme.colors.success}
                  />
                )}
                <Text
                  style={[styles.actionLabel, { color: theme.colors.success }]}
                >
                  {isAccepting ? 'Accepting...' : 'Accept'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => onRevokePress?.(task)}
                accessibilityRole="button"
                accessibilityLabel="Revoke task"
              >
                <Icon
                  name="close-circle"
                  size={32}
                  color={theme.colors.danger}
                />
                <Text
                  style={[styles.actionLabel, { color: theme.colors.danger }]}
                >
                  Revoke
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onInfoPress?.(task)}
            accessibilityRole="button"
            accessibilityLabel="Task info"
          >
            <Icon
              name="information-circle"
              size={32}
              color={theme.colors.info || '#3b82f6'}
            />
            <Text
              style={[
                styles.actionLabel,
                { color: theme.colors.info || '#3b82f6' },
              ]}
            >
              Info
            </Text>
          </TouchableOpacity>

          {/* UX (2026-04-21): hide the Attachments button on COMPLETED
              tasks — once the agent submits, the verification is closed
              and the attached documents are no longer relevant to the
              field-app user. Keep the button on ASSIGNED / IN_PROGRESS /
              SAVED / REVOKED so the agent can still reference docs
              while work is ongoing. */}
          {task.status !== 'COMPLETED' && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() =>
                onAttachmentsPress ? onAttachmentsPress(task) : onPress(task)
              }
              accessibilityRole="button"
              accessibilityLabel={
                (task.attachmentCount || 0) > 0
                  ? `Attachments (${task.attachmentCount})`
                  : 'Attachments'
              }
            >
              <Icon name="attach" size={28} color={theme.colors.primary} />
              {(task.attachmentCount || 0) > 0 && (
                <View
                  style={[
                    styles.badgeContainer,
                    { backgroundColor: theme.colors.danger },
                  ]}
                >
                  <Text style={styles.badgeText}>{task.attachmentCount}</Text>
                </View>
              )}
              <Text
                style={[styles.actionLabel, { color: theme.colors.primary }]}
              >
                Attachments
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statusBadgeContainer}>
          {isReorderEnabled && (
            <View style={styles.reorderButtons}>
              <TouchableOpacity
                style={[
                  styles.reorderButton,
                  { backgroundColor: theme.colors.surfaceAlt },
                  !canMoveUp && styles.reorderButtonDisabled,
                ]}
                onPress={() => onMoveTask?.(task.id, 'up')}
                disabled={!canMoveUp}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Move task up"
              >
                <Icon
                  name="chevron-up-outline"
                  size={18}
                  color={
                    canMoveUp
                      ? theme.colors.textSecondary
                      : theme.colors.textMuted
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.reorderButton,
                  { backgroundColor: theme.colors.surfaceAlt },
                  !canMoveDown && styles.reorderButtonDisabled,
                ]}
                onPress={() => onMoveTask?.(task.id, 'down')}
                disabled={!canMoveDown}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Move task down"
              >
                <Icon
                  name="chevron-down-outline"
                  size={18}
                  color={
                    canMoveDown
                      ? theme.colors.textSecondary
                      : theme.colors.textMuted
                  }
                />
              </TouchableOpacity>
            </View>
          )}
          <View
            style={[
              styles.badge,
              { backgroundColor: getStatusColor(task.status) },
            ]}
          >
            <Text style={[styles.statusText, { color: theme.colors.surface }]}>
              {task.status ? task.status.replace('_', ' ') : 'UNKNOWN'}
            </Text>
          </View>
          {(task.status === 'IN_PROGRESS' || task.status === 'REVISIT') && (
            <Icon
              name="chevron-forward"
              size={20}
              color={theme.colors.textMuted}
            />
          )}
        </View>
      </View>
    </AnimatedTouchableOpacity>
  );
};

const areEqual = (prev: TaskCardProps, next: TaskCardProps): boolean => {
  const prevTask = prev.task;
  const nextTask = next.task;
  return (
    prevTask.id === nextTask.id &&
    prevTask.status === nextTask.status &&
    prevTask.isSaved === nextTask.isSaved &&
    prevTask.savedAt === nextTask.savedAt &&
    prevTask.isRevoked === nextTask.isRevoked &&
    prevTask.revokedAt === nextTask.revokedAt &&
    prevTask.completedAt === nextTask.completedAt &&
    prevTask.inProgressAt === nextTask.inProgressAt &&
    prevTask.assignedAt === nextTask.assignedAt &&
    prevTask.attachmentCount === nextTask.attachmentCount &&
    prevTask.priority === nextTask.priority &&
    prevTask.customerName === nextTask.customerName &&
    prevTask.addressStreet === nextTask.addressStreet &&
    prevTask.addressCity === nextTask.addressCity &&
    prevTask.addressState === nextTask.addressState &&
    prevTask.addressPincode === nextTask.addressPincode &&
    prevTask.verificationTypeName === nextTask.verificationTypeName &&
    prevTask.verificationType === nextTask.verificationType &&
    prevTask.verificationTaskNumber === nextTask.verificationTaskNumber &&
    prev.canMoveUp === next.canMoveUp &&
    prev.canMoveDown === next.canMoveDown &&
    prev.isReorderEnabled === next.isReorderEnabled
  );
};

export const TaskCard = React.memo(TaskCardComponent, areEqual);

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
    // H20 (audit 2026-04-21): 44×44 min tap target.
    position: 'relative',
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  // U8 (audit 2026-04-21 round 2): sized to 40×40 (just below 44 for
  // density in the badge row but large enough to hit reliably) with
  // 12/12 hitSlop applied inline at call sites. Background override
  // now comes from theme.colors.surfaceAlt so dark mode doesn't lose
  // visibility.
  reorderButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
