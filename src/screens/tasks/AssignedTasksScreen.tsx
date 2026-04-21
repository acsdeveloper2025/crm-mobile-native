import React from 'react';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TaskListScreen } from './TaskListScreen';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';

type AssignedTasksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Assigned'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const AssignedTasksScreen = (props: AssignedTasksScreenProps) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="ASSIGNED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search assigned tasks..."
    />
  );
};
