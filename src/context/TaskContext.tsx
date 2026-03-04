import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/DatabaseService';
import { SyncQueue, SYNC_PRIORITY } from '../services/SyncQueue';
import { SyncService } from '../services/SyncService';
import { StorageService } from '../services/StorageService';
import { AuthService } from '../services/AuthService';
import { NetworkService } from '../services/NetworkService';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import type { GeoLocation, MobileFormSubmissionRequest } from '../types/api';
import type { LocalAttachment, LocalTask } from '../types/mobile';
import { RevokeReason } from '../types/api';
import { TaskStatus } from '../types/enums';
import { Logger } from '../utils/logger';
import {
  resolveFormTypeKey,
  toBackendFormType as toBackendFormTypeKey,
  type FormTypeKey,
} from '../utils/formTypeKey';

const TAG = 'TaskContext';

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
  tasks: LocalTask[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  getTask: (taskId: string) => Promise<LocalTask | null>;
  startTask: (taskId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  updateVerificationOutcome: (taskId: string, outcome: string | null) => Promise<void>;
  updateTaskFormData: (taskId: string, patch: Record<string, unknown>) => Promise<void>;
  toggleSaveTask: (taskId: string, isSaved: boolean) => Promise<void>;
  revokeTask: (taskId: string, reason: RevokeReason) => Promise<void>;
  setTaskPriority: (taskId: string, priority: number | null) => Promise<void>;
  getTaskPriority: (taskId: string) => number | null;
  getTasksWithPriorities: () => LocalTask[];
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

const AUTO_SAVE_KEY = (taskId: string) => `auto_save_${taskId}`;

const FORM_ENDPOINT_MAP: Record<FormTypeKey, (taskId: string) => string> = {
  residence: ENDPOINTS.FORMS.RESIDENCE,
  office: ENDPOINTS.FORMS.OFFICE,
  business: ENDPOINTS.FORMS.BUSINESS,
  'residence-cum-office': ENDPOINTS.FORMS.RESIDENCE_CUM_OFFICE,
  'dsa-connector': ENDPOINTS.FORMS.DSA_CONNECTOR,
  builder: ENDPOINTS.FORMS.BUILDER,
  'property-individual': ENDPOINTS.FORMS.PROPERTY_INDIVIDUAL,
  'property-apf': ENDPOINTS.FORMS.PROPERTY_APF,
  noc: ENDPOINTS.FORMS.NOC,
};

const parseFormData = (raw?: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const parsePriority = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSubmissionPhotoType = (
  componentType: LocalAttachment['componentType'],
): 'verification' | 'selfie' => {
  return componentType === 'selfie' ? 'selfie' : 'verification';
};

const toAttachmentGeoLocation = (attachment: LocalAttachment): GeoLocation | null => {
  if (attachment.latitude == null || attachment.longitude == null) {
    return null;
  }

  return {
    latitude: attachment.latitude,
    longitude: attachment.longitude,
    accuracy: attachment.accuracy ?? 0,
    timestamp: attachment.locationTimestamp || attachment.uploadedAt,
  };
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async (): Promise<LocalTask[]> => {
    const rows = await DatabaseService.query<LocalTask>(
      `SELECT * FROM tasks
       ORDER BY
         is_revoked ASC,
         CASE
           WHEN status = 'IN_PROGRESS' THEN 0
           WHEN status = 'ASSIGNED' THEN 1
           WHEN status = 'COMPLETED' THEN 2
           ELSE 3
         END,
         assigned_at DESC`,
    );
    setTasks(rows);
    return rows;
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await loadTasks();
    } catch (err: any) {
      Logger.error(TAG, 'Failed to load tasks', err);
      setError(err?.message || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [loadTasks]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const getTask = useCallback(async (taskId: string): Promise<LocalTask | null> => {
    const existing = tasks.find(task => task.id === taskId);
    if (existing) {
      return existing;
    }

    const rows = await DatabaseService.query<LocalTask>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId],
    );
    return rows[0] ?? null;
  }, [tasks]);

  const replaceTask = useCallback((taskId: string, nextTask: LocalTask) => {
    setTasks(current => {
      const index = current.findIndex(task => task.id === taskId);
      if (index === -1) {
        return [nextTask, ...current];
      }

      const next = [...current];
      next[index] = nextTask;
      return next;
    });
  }, []);

  const reloadTask = useCallback(async (taskId: string) => {
    const nextTask = await getTask(taskId);
    if (nextTask) {
      replaceTask(taskId, nextTask);
    } else {
      setTasks(current => current.filter(task => task.id !== taskId));
    }
  }, [getTask, replaceTask]);

  const enqueueTaskUpdate = useCallback(async (
    task: LocalTask,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.NORMAL,
  ) => {
    await SyncQueue.enqueue(
      'UPDATE',
      'TASK',
      task.verificationTaskId || task.id,
      { localTaskId: task.id, ...payload },
      priority,
    );
  }, []);

  const updateTaskStatus = useCallback(async (taskId: string, status: string) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const now = new Date().toISOString();
    let sql = `UPDATE tasks SET status = ?, is_saved = 0, sync_status = 'PENDING', local_updated_at = ?`;
    const params: Array<string | number | null> = [status, now];

    if (status === TaskStatus.InProgress) {
      sql += ', in_progress_at = COALESCE(in_progress_at, ?)';
      params.push(now);
    }

    if (status === TaskStatus.Completed) {
      sql += ', completed_at = ?';
      params.push(now);
    }

    sql += ' WHERE id = ?';
    params.push(taskId);

    await DatabaseService.execute(sql, params);

    if (status === TaskStatus.InProgress) {
      await enqueueTaskUpdate(task, { action: 'start' }, SYNC_PRIORITY.HIGH);
    } else if (status === TaskStatus.Completed) {
      await enqueueTaskUpdate(task, { action: 'complete' }, SYNC_PRIORITY.HIGH);
    }

    await reloadTask(taskId);
  }, [enqueueTaskUpdate, getTask, reloadTask]);

  const startTask = useCallback(async (taskId: string) => {
    await updateTaskStatus(taskId, TaskStatus.InProgress);
  }, [updateTaskStatus]);

  const updateVerificationOutcome = useCallback(async (taskId: string, outcome: string | null) => {
    await DatabaseService.execute(
      `UPDATE tasks
       SET verification_outcome = ?, sync_status = 'PENDING', local_updated_at = ?
       WHERE id = ?`,
      [outcome, new Date().toISOString(), taskId],
    );
    await reloadTask(taskId);
  }, [reloadTask]);

  const updateTaskFormData = useCallback(async (
    taskId: string,
    patch: Record<string, unknown>,
  ) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const now = new Date().toISOString();
    const nextFormData = {
      ...parseFormData(task.formDataJson),
      ...patch,
    };
    const nextStatus = task.status === TaskStatus.Assigned ? TaskStatus.InProgress : task.status;

    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?,
           status = ?,
           in_progress_at = CASE WHEN in_progress_at IS NULL AND ? = 'IN_PROGRESS' THEN ? ELSE in_progress_at END,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(nextFormData),
        nextStatus,
        nextStatus,
        now,
        now,
        taskId,
      ],
    );

    await reloadTask(taskId);
  }, [getTask, reloadTask]);

  const toggleSaveTask = useCallback(async (taskId: string, isSaved: boolean) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const now = new Date().toISOString();
    const nextStatus = isSaved && task.status === TaskStatus.Assigned
      ? TaskStatus.InProgress
      : task.status;

    await DatabaseService.execute(
      `UPDATE tasks
       SET is_saved = ?,
           saved_at = ?,
           status = ?,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [
        isSaved ? 1 : 0,
        isSaved ? now : null,
        nextStatus,
        now,
        taskId,
      ],
    );

    await reloadTask(taskId);
  }, [getTask, reloadTask]);

  const revokeTask = useCallback(async (taskId: string, reason: RevokeReason) => {
    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const now = new Date().toISOString();
    await DatabaseService.execute(
      `UPDATE tasks
       SET status = 'REVOKED',
           is_revoked = 1,
           is_saved = 0,
           revoke_reason = ?,
           revoked_at = ?,
           sync_status = 'PENDING',
           local_updated_at = ?
       WHERE id = ?`,
      [reason, now, now, taskId],
    );

    await enqueueTaskUpdate(
      task,
      { action: 'revoke', reason, revoke_reason: reason },
      SYNC_PRIORITY.HIGH,
    );
    await reloadTask(taskId);
  }, [enqueueTaskUpdate, getTask, reloadTask]);

  const setTaskPriority = useCallback(async (taskId: string, priority: number | null) => {
    if (priority === null) {
      return;
    }

    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const now = new Date().toISOString();
    await DatabaseService.execute(
      `UPDATE tasks
       SET priority = ?, sync_status = 'PENDING', local_updated_at = ?
       WHERE id = ?`,
      [String(priority), now, taskId],
    );

    await enqueueTaskUpdate(
      task,
      { action: 'priority', priority },
      SYNC_PRIORITY.NORMAL,
    );
    await reloadTask(taskId);
  }, [enqueueTaskUpdate, getTask, reloadTask]);

  const getTaskPriority = useCallback((taskId: string): number | null => {
    return parsePriority(tasks.find(task => task.id === taskId)?.priority);
  }, [tasks]);

  const getTasksWithPriorities = useCallback(() => {
    return [...tasks].sort((left, right) => {
      const leftPriority = parsePriority(left.priority) ?? 0;
      const rightPriority = parsePriority(right.priority) ?? 0;
      return rightPriority - leftPriority;
    });
  }, [tasks]);

  const clearAutoSave = useCallback(async (taskId: string) => {
    await StorageService.remove(AUTO_SAVE_KEY(taskId));
  }, []);

  const persistAutoSave = useCallback(async (taskId: string, payload: AutoSavePayload) => {
    const timestamp = payload.timestamp || new Date().toISOString();
    const task = await getTask(taskId);

    await StorageService.setJson(AUTO_SAVE_KEY(taskId), {
      ...payload,
      timestamp,
    });

    if (!task) {
      return;
    }

    const formTypeKey = resolveFormTypeKey({
      formType: payload.formType,
      verificationTypeCode: task.verificationTypeCode || null,
      verificationTypeName: task.verificationTypeName || null,
      verificationType: task.verificationType || null,
    });

    if (!formTypeKey) {
      return;
    }

    try {
      await ApiClient.post(ENDPOINTS.TASKS.DETAIL(task.verificationTaskId || task.id) + '/auto-save', {
        formType: toBackendFormTypeKey(formTypeKey),
        formData: payload.formData,
        timestamp,
      });
    } catch (err) {
      Logger.warn(TAG, `Auto-save sync deferred for task ${taskId}`, err);
    }
  }, [getTask]);

  const getAutoSavedForm = useCallback(async (
    taskId: string,
    formType: string,
  ): Promise<Record<string, unknown> | null> => {
    const local = await StorageService.getJson<{
      formType: string;
      formData: Record<string, unknown>;
    }>(AUTO_SAVE_KEY(taskId));

    if (local?.formData) {
      return local.formData;
    }

    const task = await getTask(taskId);
    if (!task) {
      return null;
    }

    const formTypeKey = resolveFormTypeKey({
      formType,
      verificationTypeCode: task.verificationTypeCode || null,
      verificationTypeName: task.verificationTypeName || null,
      verificationType: task.verificationType || null,
    });
    if (!formTypeKey) {
      return null;
    }

    try {
      const response = await ApiClient.get<{
        success: boolean;
        data?: { formData?: Record<string, unknown> };
      }>(
        `${ENDPOINTS.TASKS.DETAIL(task.verificationTaskId || task.id)}/auto-save/${encodeURIComponent(toBackendFormTypeKey(formTypeKey))}`,
      );

      return response.data?.formData ?? null;
    } catch {
      return null;
    }
  }, [getTask]);

  const submitTaskForm = useCallback(async (input: SubmitTaskFormInput) => {
    const task = await getTask(input.taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const submissionId = uuidv4();
    const now = new Date().toISOString();
    const taskFormType = resolveFormTypeKey({
      formType: input.formType,
      verificationTypeCode: task.verificationTypeCode || null,
      verificationTypeName: task.verificationTypeName || null,
      verificationType: task.verificationType || null,
    });
    if (!taskFormType) {
      throw new Error(`Unsupported form type: ${input.formType}`);
    }
    const endpoint = FORM_ENDPOINT_MAP[taskFormType];

    if (!endpoint) {
      throw new Error(`Unsupported form type: ${input.formType}`);
    }

    const attachments = await DatabaseService.query<LocalAttachment>(
      `SELECT * FROM attachments
       WHERE task_id = ?
         AND component_type IN ('photo', 'selfie')
       ORDER BY uploaded_at ASC`,
      [task.id],
    );

    const verificationPhotos = attachments.filter(
      attachment => attachment.componentType === 'photo',
    );
    const selfiePhotos = attachments.filter(
      attachment => attachment.componentType === 'selfie',
    );

    if (verificationPhotos.length < 5) {
      throw new Error('At least 5 verification photos are required before submission.');
    }

    if (selfiePhotos.length < 1) {
      throw new Error('At least 1 selfie is required before submission.');
    }

    const photos = attachments.map(attachment => {
      const geoLocation = toAttachmentGeoLocation(attachment);
      if (!geoLocation) {
        throw new Error('All photos must include geo-location data before submission.');
      }

      return {
        attachmentId: attachment.id,
        type: toSubmissionPhotoType(attachment.componentType),
        geoLocation,
        metadata: {
          fileSize: attachment.size,
          capturedAt: attachment.locationTimestamp || attachment.uploadedAt,
        },
      };
    });

    const locationRows = await DatabaseService.query<GeoLocation>(
      `SELECT latitude, longitude, accuracy, timestamp
       FROM locations
       WHERE task_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [task.id],
    );
    const geoLocation = locationRows[0] ?? null;

    if (!geoLocation) {
      throw new Error('Start the visit and capture location before submitting the form.');
    }

    const deviceInfo = await AuthService.getDeviceInfo();
    const backendFormType = toBackendFormTypeKey(taskFormType) as MobileFormSubmissionRequest['formType'];
    const mergedFormData = {
      ...input.formData,
      outcome: input.verificationOutcome || undefined,
      verificationType: backendFormType,
    };
    const persistedFormData = {
      ...mergedFormData,
      __submission: {
        status: 'pending',
        error: null,
        updatedAt: now,
        submissionId,
      },
    };

    const submissionPayload: MobileFormSubmissionRequest & {
      submissionId: string;
      taskId: string;
      visitId: string;
      localTaskId: string;
      verificationOutcome?: string;
    } = {
      submissionId,
      localTaskId: task.id,
      taskId: task.verificationTaskId || task.id,
      visitId: task.verificationTaskId || task.id,
      caseId: String(task.caseId),
      verificationTaskId: task.verificationTaskId || task.id,
      formType: backendFormType,
      formData: mergedFormData,
      attachmentIds: attachments.map(attachment => attachment.id),
      geoLocation,
      photos,
      metadata: {
        submissionTimestamp: now,
        deviceInfo: {
          platform: deviceInfo.platform,
          model: deviceInfo.model,
          osVersion: deviceInfo.osVersion,
          appVersion: deviceInfo.appVersion,
        },
        networkInfo: {
          type: NetworkService.getConnectionType(),
        },
        formVersion: '1.0',
        validationStatus: 'VALID',
        submissionAttempts: 1,
        isOfflineSubmission: true,
        totalImages: verificationPhotos.length,
        totalSelfies: selfiePhotos.length,
        verificationDate: now,
        formType: backendFormType,
      },
      verificationOutcome: input.verificationOutcome || undefined,
    };

    await DatabaseService.transaction(async tx => {
      await tx.executeSql(
        `INSERT INTO form_submissions
          (id, task_id, case_id, form_type, form_data_json, status, submitted_at, metadata_json, attachment_ids_json, photo_data_json, sync_status, sync_attempts)
         VALUES (?, ?, ?, ?, ?, 'SUBMITTED_LOCALLY', ?, '{}', '[]', '[]', 'PENDING', 0)`,
        [
          submissionId,
          task.id,
          String(task.caseId),
          backendFormType,
          JSON.stringify(mergedFormData),
          now,
        ],
      );

      await tx.executeSql(
        `UPDATE form_submissions
         SET metadata_json = ?, attachment_ids_json = ?, photo_data_json = ?
         WHERE id = ?`,
        [
          JSON.stringify(submissionPayload.metadata),
          JSON.stringify(submissionPayload.attachmentIds),
          JSON.stringify(submissionPayload.photos),
          submissionId,
        ],
      );

      await tx.executeSql(
        `UPDATE tasks
         SET is_saved = 0,
             verification_outcome = COALESCE(?, verification_outcome),
             form_data_json = ?,
             sync_status = 'PENDING',
             local_updated_at = ?
         WHERE id = ?`,
        [
          input.verificationOutcome || null,
          JSON.stringify(persistedFormData),
          now,
          task.id,
        ],
      );
    });

    const pendingAttachmentQueueItems = await DatabaseService.query<{
      id: string;
      payloadJson: string;
    }>(
      `SELECT id, payload_json
       FROM sync_queue
       WHERE entity_type = 'ATTACHMENT'
         AND status IN ('PENDING', 'FAILED')
         AND (
           json_extract(payload_json, '$.localTaskId') = ?
           OR json_extract(payload_json, '$.taskId') = ?
         )`,
      [task.id, task.verificationTaskId || task.id],
    );

    for (const queueItem of pendingAttachmentQueueItems) {
      try {
        const payload = JSON.parse(queueItem.payloadJson) as Record<string, unknown>;
        const nextPayload = {
          ...payload,
          taskId: task.verificationTaskId || task.id,
          localTaskId: task.id,
          submissionId,
          verificationType: payload.verificationType || backendFormType,
          photoType:
            payload.photoType ||
            ((payload.componentType as string | undefined) === 'selfie'
              ? 'selfie'
              : 'verification'),
        };

        await DatabaseService.execute(
          'UPDATE sync_queue SET payload_json = ? WHERE id = ?',
          [JSON.stringify(nextPayload), queueItem.id],
        );
      } catch (queueLinkError) {
        Logger.warn(TAG, `Failed to link attachment queue item ${queueItem.id}`, queueLinkError);
      }
    }

    await SyncQueue.enqueue(
      'CREATE',
      'FORM_SUBMISSION',
      submissionId,
      submissionPayload as unknown as Record<string, unknown>,
      SYNC_PRIORITY.HIGH,
    );

    await clearAutoSave(task.id);
    await reloadTask(task.id);

    try {
      await SyncService.performSync();
      await reloadTask(task.id);
    } catch (err) {
      Logger.warn(TAG, `Immediate sync deferred for form submission ${submissionId}`, err);
    }
  }, [clearAutoSave, getTask, reloadTask]);

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

    await DatabaseService.execute(
      `UPDATE tasks
       SET form_data_json = ?, local_updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(nextFormData), new Date().toISOString(), taskId],
    );

    await reloadTask(taskId);
  }, [getTask, reloadTask]);

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
    await SyncService.performSync();
    await refreshTasks();
  }, [refreshTasks]);

  const value = useMemo<TaskContextValue>(() => ({
    tasks,
    isLoading,
    error,
    refreshTasks,
    getTask,
    startTask,
    updateTaskStatus,
    updateVerificationOutcome,
    updateTaskFormData,
    toggleSaveTask,
    revokeTask,
    setTaskPriority,
    getTaskPriority,
    getTasksWithPriorities,
    submitTaskForm,
    persistAutoSave,
    getAutoSavedForm,
    clearAutoSave,
    updateTaskSubmissionStatus,
    verifyTaskSubmissionStatus,
    syncTasks,
  }), [
    clearAutoSave,
    error,
    getAutoSavedForm,
    getTask,
    getTaskPriority,
    getTasksWithPriorities,
    isLoading,
    persistAutoSave,
    refreshTasks,
    revokeTask,
    setTaskPriority,
    startTask,
    submitTaskForm,
    syncTasks,
    tasks,
    toggleSaveTask,
    updateTaskFormData,
    updateTaskStatus,
    updateTaskSubmissionStatus,
    updateVerificationOutcome,
    verifyTaskSubmissionStatus,
  ]);

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTaskManager = (): TaskContextValue => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskManager must be used within TaskProvider');
  }
  return context;
};
