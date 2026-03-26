import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const CompletedTasksScreen = (props: Record<string, unknown>) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="COMPLETED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search completed tasks..."
    />
  );
};
