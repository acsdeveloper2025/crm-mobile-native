import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { ProjectionStore } from '../store/ProjectionStore';
import { selectTasksByStatus } from '../store/selectors/taskSelectors';
import { useSelector } from '../store/useSelector';
import { Logger } from '../utils/logger';

const TAG = 'useTasks';

export const useTasks = (statusFilter?: string, searchQuery?: string): unknown => {
  const {
    refreshTasks,
    updateTaskStatus,
    updateVerificationOutcome,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
    updateTaskFormData,
  } = useTaskManager();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selector = useMemo(
    () => selectTasksByStatus(statusFilter, searchQuery),
    [searchQuery, statusFilter],
  );
  const taskIds = useSelector(selector);

  const refreshProjectedTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await refreshTasks();
      await ProjectionStore.ensureSelector(selector, { force: true });
    } catch (refreshError) {
      Logger.warn(TAG, 'Failed to refresh projected tasks', refreshError);
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh tasks');
    } finally {
      setIsLoading(false);
    }
  }, [refreshTasks, selector]);

  useFocusEffect(
    useCallback(() => {
      refreshProjectedTasks().catch(() => undefined);
    }, [refreshProjectedTasks]),
  );

  return {
    taskIds,
    isLoading,
    error,
    refetch: refreshProjectedTasks,
    fetchTasks: refreshProjectedTasks,
    updateTaskStatus,
    updateVerificationOutcome,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
    updateTaskFormData,
  };
};
