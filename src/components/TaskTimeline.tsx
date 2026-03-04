import React from 'react';
import { View, Text } from 'react-native';

interface TaskTimelineProps {
  task?: any;
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ task }) => (
  <View>
    <Text>Timeline</Text>
    <Text>{task?.status || 'No status available'}</Text>
  </View>
);

export default TaskTimeline;
