import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LocalTask } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';

interface TaskTimelineProps {
  task: LocalTask;
  compact?: boolean;
}

interface TimelineEvent {
  label: string;
  timestamp: string | undefined;
  icon: string;
  colorName: string;
  description: string;
}

export const TaskTimeline: React.FC<TaskTimelineProps> = ({
  task,
  compact = false,
}) => {
  const { theme } = useTheme();

  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return 'Not available';

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid date';

    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const calculateDuration = (startTime?: string, endTime?: string): string => {
    if (!startTime || !endTime) return 'N/A';

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A';

    const diffMs = end.getTime() - start.getTime();

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getTimelineEvents = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [
      {
        label: 'Case Assigned',
        timestamp: task.assignedAt || task.updatedAt,
        icon: 'clipboard-outline',
        colorName: 'primary',
        description: 'Case was assigned to you',
      },
      {
        label: 'In Progress',
        timestamp:
          task.status === 'IN_PROGRESS' ||
          task.status === 'COMPLETED' ||
          task.status === 'SAVED'
            ? task.updatedAt
            : undefined,
        icon: 'rocket-outline',
        colorName: 'warning', // fallback to warning color
        description: 'Case moved to in-progress status',
      },
      {
        label: 'Last Updated',
        timestamp: task.updatedAt,
        icon: 'save-outline',
        colorName: 'info',
        description: 'Case data was last updated',
      },
      {
        label: 'Completed',
        timestamp:
          task.completedAt ||
          (task.status === 'COMPLETED' ? task.updatedAt : undefined),
        icon: 'checkmark-circle-outline',
        colorName: 'success',
        description: 'Case was marked as complete',
      },
    ];

    // Filter out events that don't have timestamps (except for assigned which should always exist)
    return events.filter((event, index) => {
      if (index === 0) return true; // Always show assignment
      return event.timestamp; // Only show others if they have timestamps
    });
  };

  const timelineEvents = getTimelineEvents();

  const getColor = (colorName: string) => {
    if (colorName === 'primary') return theme.colors.primary;
    if (colorName === 'warning') return theme.colors.warning || '#f59e0b';
    if (colorName === 'info') return theme.colors.info || '#3b82f6';
    if (colorName === 'success') return theme.colors.success;
    return theme.colors.textSecondary;
  };

  if (compact) {
    return (
      <View
        style={[
          styles.compactContainer,
          { backgroundColor: theme.colors.surfaceAlt },
        ]}
      >
        <View style={styles.compactHeader}>
          <Icon name="time-outline" size={14} color={theme.colors.primary} />
          <Text style={[styles.compactTitle, { color: theme.colors.primary }]}>
            Case Timeline
          </Text>
        </View>
        <View style={styles.compactList}>
          {timelineEvents.map((event, index) => (
            <View key={index} style={styles.compactRow}>
              <View style={styles.compactLabelRow}>
                <Icon
                  name={event.icon}
                  size={14}
                  color={getColor(event.colorName)}
                />
                <Text
                  style={[
                    styles.compactLabelText,
                    { color: theme.colors.text },
                  ]}
                >
                  {event.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.compactTimeText,
                  { color: getColor(event.colorName) },
                ]}
              >
                {formatTimestamp(event.timestamp)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.header}>
        <Icon name="time-outline" size={24} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Case Progress Timeline
        </Text>
      </View>

      <View style={styles.timelineWrapper}>
        {/* Vertical line connecting dots */}
        <View
          style={[
            styles.verticalLine,
            { backgroundColor: theme.colors.border },
          ]}
        />

        {timelineEvents.map((event, index) => {
          const hasTimestamp =
            event.timestamp && event.timestamp !== 'Not available';
          const isLast = index === timelineEvents.length - 1;
          const iconColor = hasTimestamp
            ? getColor(event.colorName)
            : theme.colors.textMuted;
          const bgCircle = hasTimestamp
            ? theme.colors.surface
            : theme.colors.surfaceAlt;
          const borderColor = hasTimestamp ? iconColor : theme.colors.border;

          return (
            <View
              key={index}
              style={[styles.eventRow, !isLast && styles.eventRowPadding]}
            >
              <View
                style={[
                  styles.dotContainer,
                  { backgroundColor: bgCircle, borderColor },
                ]}
              >
                <Icon name={event.icon} size={20} color={iconColor} />
              </View>

              <View style={styles.eventContent}>
                <View style={styles.eventHeader}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.eventLabel,
                      {
                        color: hasTimestamp
                          ? iconColor
                          : theme.colors.textMuted,
                      },
                    ]}
                  >
                    {event.label}
                  </Text>
                  {hasTimestamp && (
                    <View
                      style={[
                        styles.timeBadge,
                        { backgroundColor: theme.colors.surfaceAlt },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.timeText,
                          { color: theme.colors.textSecondary },
                        ]}
                      >
                        {formatTimestamp(event.timestamp)}
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.eventDescription,
                    {
                      color: hasTimestamp
                        ? theme.colors.textSecondary
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  {hasTimestamp
                    ? event.description
                    : 'This step was not completed'}
                </Text>

                {!hasTimestamp && event.label !== 'Case Assigned' && (
                  <Text
                    style={[
                      styles.notRecordedText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    No timestamp recorded for this event
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View
        style={[styles.summarySection, { borderTopColor: theme.colors.border }]}
      >
        <View style={styles.summaryRow}>
          <Text
            style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
          >
            Total Duration:
          </Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
            {calculateDuration(
              task.assignedAt,
              task.completedAt || new Date().toISOString(),
            )}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  timelineWrapper: {
    position: 'relative',
    marginLeft: 8,
  },
  verticalLine: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 0,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  eventRowPadding: {
    paddingBottom: 24,
  },
  dotContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  eventContent: {
    flex: 1,
    paddingTop: 4,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 8,
  },
  eventLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
    maxWidth: '100%',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eventDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  notRecordedText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  summarySection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    width: 120,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
  // Compact styles
  compactContainer: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  compactTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  compactList: {
    gap: 8,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactLabelText: {
    fontSize: 12,
  },
  compactTimeText: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
});
