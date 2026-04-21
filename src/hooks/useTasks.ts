import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { ProjectionStore } from '../store/ProjectionStore';
import { selectTasksByStatus } from '../store/selectors/taskSelectors';
import { useSelector } from '../store/useSelector';
import { Logger } from '../utils/logger';

const TAG = 'useTasks';

export const useTasks = (statusFilter?: string, searchQuery?: string): any => {
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

  // B8 (audit 2026-04-21 round 2): requestId pattern — only the most
  // recent refresh call is allowed to clear the spinner. A rapid
  // tab-switch previously let a stale resolve land after a newer
  // refresh had started, clearing the spinner in error.
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshProjectedTasks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      setError(null);
      await refreshTasks();
      await ProjectionStore.ensureSelector(selector, { force: true });
    } catch (refreshError) {
      Logger.warn(TAG, 'Failed to refresh projected tasks', refreshError);
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Failed to refresh tasks',
        );
      }
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setIsLoading(false);
      }
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
