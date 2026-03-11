import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LocalLocation } from '../types/mobile';
import { Logger } from '../utils/logger';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { LocationRepository } from '../repositories/LocationRepository';

const TAG = 'useTask';

export const useTask = (taskId: string) => {
  const {
    tasks,
    isLoading: managerLoading,
    error: managerError,
    getTask,
  } = useTaskManager();
  const [locations, setLocations] = useState<LocalLocation[]>([]);
  const [isLoading, setIsLoading] = useState(managerLoading);
  const [error, setError] = useState<string | null>(null);
  const getTaskRef = useRef(getTask);
  const task = useMemo(
    () => tasks.find(item => item.id === taskId) || null,
    [taskId, tasks],
  );

  useEffect(() => {
    getTaskRef.current = getTask;
  }, [getTask]);

  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;
    
    try {
      setIsLoading(true);
      setError(null);

      const nextTask = await getTaskRef.current(taskId);
      if (!nextTask) {
        setError('Task not found');
      }

      // Fetch associated locations (if needed for the timeline)
      const locationResult = await LocationRepository.listForTask(taskId);
      setLocations(locationResult || []);
      
    } catch (err: any) {
      Logger.error(TAG, `Failed to fetch task ${taskId}`, err);
      setError(err.message || 'An error occurred fetching the task');
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchTaskDetails();
    }, [fetchTaskDetails])
  );

  return {
    task,
    locations,
    isLoading: isLoading || managerLoading,
    error: error || managerError,
    refetch: fetchTaskDetails,
  };
};
