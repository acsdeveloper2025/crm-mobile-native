import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface AcceptTaskButtonProps {
  taskData: { id: string };
  onStatusUpdate: (taskId: string, newStatus: string) => void;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

const AcceptTaskButton: React.FC<AcceptTaskButtonProps> = ({
  taskData,
  onStatusUpdate,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      onStatusUpdate(taskData.id, 'IN_PROGRESS');
      onSuccess?.('Task accepted');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors.primary }]}
      onPress={handlePress}
      disabled={loading}
    >
      <Text style={[styles.text, { color: theme.colors.surface }]}>
        {loading ? 'Starting...' : 'Accept Task'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AcceptTaskButton;
