import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const SavedTasksScreen = (props: Record<string, unknown>) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="SAVED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search saved tasks..."
    />
  );
};
