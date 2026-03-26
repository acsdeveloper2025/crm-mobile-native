import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const CompletedTasksScreen = (props: any) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="COMPLETED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search completed tasks..."
    />
  );
};
