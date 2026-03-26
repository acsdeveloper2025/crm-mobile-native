import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { RevokeReason } from '../types/api';
import type { LocalTask } from '../types/mobile';
import { TaskStatus } from '../types/enums';
import { Logger } from '../utils/logger';
import { StorageService } from '../services/StorageService';
import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { SYNC_PRIORITY } from '../services/SyncQueue';
import { NetworkService } from '../services/NetworkService';
import { FetchAssignmentsUseCase } from '../usecases/FetchAssignmentsUseCase';
import { SaveDraftUseCase } from '../usecases/SaveDraftUseCase';
import { SubmitVerificationUseCase } from '../usecases/SubmitVerificationUseCase';
import { RevokeTaskUseCase } from '../usecases/RevokeTaskUseCase';
import { CompleteTaskUseCase } from '../usecases/CompleteTaskUseCase';
import { SyncTasksUseCase } from '../usecases/SyncTasksUseCase';

const TAG = 'TaskContext';
const AUTO_SAVE_KEY = (taskId: string) => `auto_save_${taskId}`;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SubmitTaskFormInput {
  taskId: string;
  formType: string;
  formData: Record<string, unknown>;
  verificationOutcome?: string | null;
}

interface AutoSavePayload {
  formType: string;
  formData: Record<string, unknown>;
  timestamp?: string;
}

interface SubmissionStatusResult {
  submitted: boolean;
  taskStatus?: string;
  error?: string;
}

interface TaskContextValue {
  refreshTasks: () => Promise<void>;
  getTask: (taskId: string) => Promise<LocalTask | null>;
  startTask: (taskId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  updateVerificationOutcome: (taskId: string, outcome: string | null) => Promise<void>;
  updateTaskFormData: (taskId: string, patch: Record<string, unknown>) => Promise<void>;
  toggleSaveTask: (taskId: string, isSaved: boolean) => Promise<void>;
  revokeTask: (taskId: string, reason: RevokeReason) => Promise<void>;
  setTaskPriority: (taskId: string, priority: number | null) => Promise<void>;
  submitTaskForm: (input: SubmitTaskFormInput) => Promise<void>;
  persistAutoSave: (taskId: string, payload: AutoSavePayload) => Promise<void>;
  getAutoSavedForm: (taskId: string, formType: string) => Promise<Record<string, unknown> | null>;
  clearAutoSave: (taskId: string) => Promise<void>;
  updateTaskSubmissionStatus: (
    taskId: string,
    status: 'pending' | 'submitting' | 'success' | 'failed',
    error?: string,
  ) => Promise<void>;
  verifyTaskSubmissionStatus: (taskId: string) => Promise<SubmissionStatusResult>;
  syncTasks: () => Promise<void>;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

const parseFormData = (raw?: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const resolveBackendTaskId = (task: LocalTask): string => {
  const preferred = (task.verificationTaskId || '').trim();
  if (UUID_REGEX.test(preferred)) {
    return preferred;
  }
  if (UUID_REGEX.test(task.id.trim())) {
    return task.id.trim();
  }
  throw new Error(`Invalid task identifier for case ${task.caseId}`);
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const refreshTasks = useCallback(async () => {
    try {
      await FetchAssignmentsUseCase.execute();
    } catch (err: unknown) {
      Logger.error(TAG, 'Failed to load tasks', err);
      throw err;
    }
  }, []);

  const getTask = useCallback(async (taskId: string): Promise<LocalTask | null> => {
    return TaskRepository.getTaskById(taskId);
  }, []);

  const syncIfOnline = useCallback(async () => {
    try {
      const online = await NetworkService.checkConnection();
      if (online) {
        await SyncTasksUseCase.execute();
      }
    } catch (syncError) {
      Logger.warn(TAG, 'Immediate sync deferred after local mutation', syncError);
    }
  }, []);

  const updateTaskStatus = useCallback(async (taskId: string, status: string) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (status === TaskStatus.Completed) {
      await CompleteTaskUseCase.execute(taskId);
      await syncIfOnline();
      return;
    }

    await TaskRepository.updateTaskStatus(taskId, status);
    if (status === TaskStatus.InProgress) {
      await SyncGateway.enqueueTaskStatus(
        resolveBackendTaskId(task),
        task.id,
        TaskStatus.InProgress,
        {},
        SYNC_PRIORITY.CRITICAL,
      );
      await syncIfOnline();
    }
  }, [getTask, syncIfOnline]);

  const startTask = useCallback(async (taskId: string) => {
    await updateTaskStatus(taskId, TaskStatus.InProgress);
  }, [updateTaskStatus]);

  const updateVerificationOutcome = useCallback(async (taskId: string, outcome: string | null) => {
    await TaskRepository.updateVerificationOutcome(taskId, outcome);
  }, []);

  const updateTaskFormData = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    await SaveDraftUseCase.execute(taskId, patch);
  }, []);

  const toggleSaveTask = useCallback(async (taskId: string, isSaved: boolean) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const nextStatus = isSaved && task.status === TaskStatus.Assigned
      ? TaskStatus.InProgress
      : task.status;

    await TaskRepository.toggleSavedState(taskId, isSaved, nextStatus);
    await SyncGateway.enqueueTaskStatus(
      resolveBackendTaskId(task),
      task.id,
      nextStatus,
      { isSaved, savedAt: isSaved ? new Date().toISOString() : null },
      SYNC_PRIORITY.CRITICAL,
    );
  }, [getTask]);

  const revokeTask = useCallback(async (taskId: string, reason: RevokeReason) => {
    await RevokeTaskUseCase.execute(taskId, reason);
  }, []);

  const setTaskPriority = useCallback(async (taskId: string, priority: number | null) => {
    if (priority === null) {
      return;
    }

    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    await TaskRepository.setPriority(taskId, priority);
    await SyncGateway.enqueueTaskUpdate(
      resolveBackendTaskId(task),
      task.id,
      { action: 'priority', priority },
      SYNC_PRIORITY.NORMAL,
    );
  }, [getTask]);

  const clearAutoSave = useCallback(async (taskId: string) => {
    await StorageService.remove(AUTO_SAVE_KEY(taskId));
  }, []);

  const persistAutoSave = useCallback(async (taskId: string, payload: AutoSavePayload) => {
    const timestamp = payload.timestamp || new Date().toISOString();
    await StorageService.setJson(AUTO_SAVE_KEY(taskId), { ...payload, timestamp });
  }, []);

  const getAutoSavedForm = useCallback(async (taskId: string): Promise<Record<string, unknown> | null> => {
    const local = await StorageService.getJson<{ formData: Record<string, unknown> }>(AUTO_SAVE_KEY(taskId));
    return local?.formData || null;
  }, []);

  const submitTaskForm = useCallback(async (input: SubmitTaskFormInput) => {
    await SubmitVerificationUseCase.execute(input);
  }, []);

  const updateTaskSubmissionStatus = useCallback(async (
    taskId: string,
    status: 'pending' | 'submitting' | 'success' | 'failed',
    submissionError?: string,
  ) => {
    const task = await getTask(taskId);
    if (!task) {
      return;
    }

    const nextFormData = {
      ...parseFormData(task.formDataJson),
      __submission: {
        status,
        error: submissionError || null,
        updatedAt: new Date().toISOString(),
      },
    };
    await TaskRepository.updateSubmissionMeta(taskId, nextFormData);
  }, [getTask]);

  const verifyTaskSubmissionStatus = useCallback(async (taskId: string): Promise<SubmissionStatusResult> => {
    const task = await getTask(taskId);
    if (!task) {
      return { submitted: false, error: 'Task not found' };
    }
    const formData = parseFormData(task.formDataJson);
    const submissionMeta = formData.__submission as {
      status?: 'pending' | 'submitting' | 'success' | 'failed';
      error?: string;
    } | undefined;
    return {
      submitted: submissionMeta?.status === 'success',
      taskStatus: task.status,
      error: submissionMeta?.error,
    };
  }, [getTask]);

  const syncTasks = useCallback(async () => {
    await SyncTasksUseCase.execute();
    await refreshTasks();
  }, [refreshTasks]);

  const value = useMemo<TaskContextValue>(() => ({
    refreshTasks,
    getTask,
    startTask,
    updateTaskStatus,
    updateVerificationOutcome,
    updateTaskFormData,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    submitTaskForm,
    persistAutoSave,
    getAutoSavedForm,
    clearAutoSave,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
  }), [
    clearAutoSave,
    getAutoSavedForm,
    getTask,
    persistAutoSave,
    refreshTasks,
    revokeTask,
    setTaskPriority,
    startTask,
    submitTaskForm,
    syncTasks,
    toggleSaveTask,
    updateTaskFormData,
    updateTaskStatus,
    updateTaskSubmissionStatus,
    updateVerificationOutcome,
    verifyTaskSubmissionStatus,
  ]);

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};

export const useTaskManager = (): TaskContextValue => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskManager must be used within TaskProvider');
  }
  return context;
};
