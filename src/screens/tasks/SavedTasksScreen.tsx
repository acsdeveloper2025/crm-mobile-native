import React from 'react';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TaskListScreen } from './TaskListScreen';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';

// H21 completion (2026-04-21): CompositeScreenProps merges the tab-
// navigator context with the root stack. `navigation.navigate` can
// target both tab routes (Dashboard/…) and stack routes
// (TaskDetail/VerificationForm/TaskAttachments) inside TaskListScreen.
type SavedTasksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Saved'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const SavedTasksScreen = (props: SavedTasksScreenProps) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="SAVED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search saved tasks..."
    />
  );
};
