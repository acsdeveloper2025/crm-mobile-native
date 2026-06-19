import React from 'react';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TaskListScreen } from './TaskListScreen';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';

type SubmittedTasksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Submitted'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const SubmittedTasksScreen = (props: SubmittedTasksScreenProps) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="SUBMITTED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search submitted tasks..."
    />
  );
};
