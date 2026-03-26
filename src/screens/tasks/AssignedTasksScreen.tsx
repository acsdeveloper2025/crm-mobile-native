import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const AssignedTasksScreen = (props: Record<string, unknown>) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="ASSIGNED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search assigned tasks..."
    />
  );
};
