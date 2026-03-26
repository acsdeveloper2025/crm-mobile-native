import React from 'react';
import { TaskListScreen } from './TaskListScreen';

export const SavedTasksScreen = (props: any) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="SAVED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search saved tasks..."
    />
  );
};
