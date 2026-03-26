import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const InProgressTasksScreen = (props: Record<string, unknown>) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="IN_PROGRESS"
      defaultLockedFilter
      defaultSearchPlaceholder="Search in progress tasks..."
    />
  );
};
