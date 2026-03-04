import { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTaskManager } from '../context/TaskContext';
import { TaskStatus } from '../types/enums';

const REPORT_METHOD_NAMES = [
  'updateResidenceReport',
  'updateShiftedResidenceReport',
  'updateNspResidenceReport',
  'updateEntryRestrictedResidenceReport',
  'updateUntraceableResidenceReport',
  'updateResiCumOfficeReport',
  'updateShiftedResiCumOfficeReport',
  'updateNspResiCumOfficeReport',
  'updateEntryRestrictedResiCumOfficeReport',
  'updateUntraceableResiCumOfficeReport',
  'updatePositiveOfficeReport',
  'updateShiftedOfficeReport',
  'updateNspOfficeReport',
  'updateEntryRestrictedOfficeReport',
  'updateUntraceableOfficeReport',
  'updatePositiveBusinessReport',
  'updateShiftedBusinessReport',
  'updateNspBusinessReport',
  'updateEntryRestrictedBusinessReport',
  'updateUntraceableBusinessReport',
  'updatePositiveBuilderReport',
  'updateShiftedBuilderReport',
  'updateNspBuilderReport',
  'updateEntryRestrictedBuilderReport',
  'updateUntraceableBuilderReport',
  'updatePositiveNocReport',
  'updateShiftedNocReport',
  'updateNspNocReport',
  'updateEntryRestrictedNocReport',
  'updateUntraceableNocReport',
  'updatePositiveDsaReport',
  'updateShiftedDsaReport',
  'updateNspDsaReport',
  'updateEntryRestrictedDsaReport',
  'updateUntraceableDsaReport',
  'updatePositivePropertyApfReport',
  'updateShiftedPropertyApfReport',
  'updateNspPropertyApfReport',
  'updateEntryRestrictedPropertyApfReport',
  'updateUntraceablePropertyApfReport',
  'updatePositivePropertyIndividualReport',
  'updateShiftedPropertyIndividualReport',
  'updateNspPropertyIndividualReport',
  'updateEntryRestrictedPropertyIndividualReport',
  'updateUntraceablePropertyIndividualReport',
  'updateDsaDstConnectorReport',
] as const;

const filterTasks = (
  tasks: ReturnType<typeof useTaskManager>['tasks'],
  statusFilter?: string,
  searchQuery?: string,
) => {
  const query = searchQuery?.trim().toLowerCase() || '';

  return tasks.filter(task => {
    if (statusFilter === TaskStatus.Saved) {
      if (!(task.is_saved === 1 && task.status !== TaskStatus.Completed)) {
        return false;
      }
    } else if (statusFilter === TaskStatus.Revoked) {
      if (task.is_revoked !== 1) {
        return false;
      }
    } else if (statusFilter) {
      if (task.status !== statusFilter || task.is_revoked === 1) {
        return false;
      }
    } else if (task.is_revoked === 1) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      task.customerName,
      task.addressCity,
      String(task.caseId),
      task.verificationTaskNumber,
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });
};

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

  useFocusEffect(
    useCallback(() => {
      refreshTasks().catch(() => undefined);
    }, [refreshTasks]),
  );

  const tasks = useMemo(
    () => filterTasks(allTasks, statusFilter, searchQuery),
    [allTasks, searchQuery, statusFilter],
  );

  const updateTaskReport = useCallback(async (
    taskId: string,
    patch: Record<string, unknown>,
  ) => {
    await updateTaskFormData(taskId, patch);
  }, [updateTaskFormData]);

  const reportMethods = useMemo(() => {
    return REPORT_METHOD_NAMES.reduce<Record<string, typeof updateTaskReport>>((accumulator, methodName) => {
      accumulator[methodName] = updateTaskReport;
      return accumulator;
    }, {});
  }, [updateTaskReport]);

  return {
    tasks,
    isLoading,
    error,
    refetch: refreshTasks,
    fetchTasks: refreshTasks,
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
    ...reportMethods,
  };
};
