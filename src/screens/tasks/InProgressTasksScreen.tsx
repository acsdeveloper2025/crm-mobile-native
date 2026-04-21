import React from 'react';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TaskListScreen } from './TaskListScreen';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';

type InProgressTasksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'InProgress'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const InProgressTasksScreen = (props: InProgressTasksScreenProps) => {
  return (
    <TaskListScreen
      {...props}
      defaultFilter="IN_PROGRESS"
      defaultLockedFilter
      defaultSearchPlaceholder="Search in progress tasks..."
    />
  );
};
