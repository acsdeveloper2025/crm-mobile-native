import React from 'react';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TaskListScreen } from './TaskListScreen';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';

type CompletedTasksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Completed'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const CompletedTasksScreen = (props: CompletedTasksScreenProps) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="COMPLETED"
      defaultLockedFilter
      defaultSearchPlaceholder="Search completed tasks..."
    />
  );
};
