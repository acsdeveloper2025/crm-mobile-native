import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const InProgressTasksScreen = (props: any) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="IN_PROGRESS"
      defaultLockedFilter
      defaultSearchPlaceholder="Search in progress tasks..."
    />
  );
};
