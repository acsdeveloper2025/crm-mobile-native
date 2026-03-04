import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface TaskCardProps {
  taskData?: any;
  isReorderable?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ taskData }) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {taskData?.title || taskData?.customerName || 'Task'}
      </Text>
      <Text style={{ color: theme.colors.textSecondary }}>
        {taskData?.status || taskData?.taskStatus || 'Unknown'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
});

export default TaskCard;
