import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { LocalTask } from '../types/mobile';
import { TaskListProjection } from '../projections/TaskListProjection';
import { Logger } from '../utils/logger';

const TAG = 'useTasks';

export const useTasks = (statusFilter?: string, searchQuery?: string): any => {
  const {
    tasks: allTasks,
    isLoading,
    error,
    refreshTasks,
    updateTaskStatus,
    updateVerificationOutcome,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    getTaskPriority,
    getTasksWithPriorities,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
    updateTaskFormData,
  } = useTaskManager();

  const [tasks, setTasks] = useState<LocalTask[]>([]);

  const loadProjectedTasks = useCallback(async () => {
    try {
      const projected = await TaskListProjection.list(statusFilter, searchQuery);
      setTasks(projected);
    } catch (projectionError) {
      Logger.warn(TAG, 'Failed to load projected tasks', projectionError);
      setTasks([]);
    }
  }, [searchQuery, statusFilter]);

  const refreshProjectedTasks = useCallback(async () => {
    try {
      await refreshTasks();
      await loadProjectedTasks();
    } catch (refreshError) {
      Logger.warn(TAG, 'Failed to refresh projected tasks', refreshError);
    }
  }, [loadProjectedTasks, refreshTasks]);

  useFocusEffect(
    useCallback(() => {
      refreshProjectedTasks().catch(() => undefined);
    }, [refreshProjectedTasks]),
  );

  useEffect(() => {
    loadProjectedTasks().catch(() => undefined);
  }, [allTasks.length, loadProjectedTasks]);

  return {
    tasks,
    isLoading,
    error,
    refetch: refreshProjectedTasks,
    fetchTasks: refreshProjectedTasks,
    updateTaskStatus,
    updateVerificationOutcome,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    getTaskPriority,
    getTasksWithPriorities,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
    updateTaskFormData,
  };
};
