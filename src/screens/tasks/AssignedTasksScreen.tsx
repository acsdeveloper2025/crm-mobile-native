import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const AssignedTasksScreen = (props: any) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="ASSIGNED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search assigned tasks..."
    />
  );
};
