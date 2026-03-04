import React from 'react';
import { View, Text } from 'react-native';

interface PriorityInputProps {
  taskId: string;
}

const PriorityInput: React.FC<PriorityInputProps> = ({ taskId }) => (
  <View>
    <Text>Priority control unavailable for task {taskId}.</Text>
  </View>
);

export default PriorityInput;
