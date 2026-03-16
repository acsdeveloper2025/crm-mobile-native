import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { LocalLocation } from '../types/mobile';
import { Logger } from '../utils/logger';
import { LocationRepository } from '../repositories/LocationRepository';
import { ProjectionStore } from '../store/ProjectionStore';
import { selectTaskById } from '../store/selectors/taskSelectors';
import { useSelector } from '../store/useSelector';

const TAG = 'useTask';

export const useTask = (taskId: string) => {
  const selector = useMemo(() => selectTaskById(taskId), [taskId]);
  const task = useSelector(selector);
  const [locations, setLocations] = useState<LocalLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchTaskDetails = useCallback(async (options?: { silent?: boolean }) => {
    if (!taskId) {
      setLocations([]);
      setError('Task not found');
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;

    try {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setError(null);

      const [, locationResult] = await Promise.all([
        ProjectionStore.ensureSelector(selector, { force: true }),
        LocationRepository.listForTask(taskId),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setLocations(locationResult || []);
      if (!ProjectionStore.getTaskSnapshot(taskId)) {
        setError('Task not found');
      }
    } catch (err: any) {
      Logger.error(TAG, `Failed to fetch task ${taskId}`, err);
      if (requestId === requestIdRef.current) {
        setLocations([]);
        setError(err?.message || 'An error occurred fetching the task');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [selector, taskId]);

  useFocusEffect(
    useCallback(() => {
      fetchTaskDetails({ silent: true }).catch(() => undefined);
    }, [fetchTaskDetails]),
  );

  useEffect(() => {
    if (!taskId) {
      return;
    }
    ProjectionStore.ensureSelector(selector).catch(() => undefined);
  }, [selector, taskId]);

  return {
    task,
    locations,
    isLoading,
    error,
    refetch: fetchTaskDetails,
  };
};
