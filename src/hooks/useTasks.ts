import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { LocalTask } from '../types/mobile';
import { TaskListProjection } from '../projections/TaskListProjection';

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
    const projected = await TaskListProjection.list(statusFilter, searchQuery);
    setTasks(projected);
  }, [searchQuery, statusFilter]);

  const refreshProjectedTasks = useCallback(async () => {
    await refreshTasks();
    await loadProjectedTasks();
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
