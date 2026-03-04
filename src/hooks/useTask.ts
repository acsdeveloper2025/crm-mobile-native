import { useState, useCallback, useMemo } from 'react';
import { DatabaseService } from '../database/DatabaseService';
import { LocalLocation } from '../types/mobile';
import { Logger } from '../utils/logger';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';

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
  const task = useMemo(
    () => tasks.find(item => item.id === taskId) || null,
    [taskId, tasks],
  );

  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;
    
    try {
      setIsLoading(true);
      setError(null);

      const nextTask = await getTask(taskId);
      if (!nextTask) {
        setError('Task not found');
      }

      // Fetch associated locations (if needed for the timeline)
      const locationResult = await DatabaseService.query<LocalLocation>(
        'SELECT * FROM locations WHERE task_id = ? ORDER BY timestamp DESC',
        [taskId]
      );
      setLocations(locationResult || []);
      
    } catch (err: any) {
      Logger.error(TAG, `Failed to fetch task ${taskId}`, err);
      setError(err.message || 'An error occurred fetching the task');
    } finally {
      setIsLoading(false);
    }
  }, [getTask, taskId]);

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
