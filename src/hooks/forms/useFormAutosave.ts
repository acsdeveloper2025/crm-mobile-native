import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Logger } from '../../utils/logger';

const TAG = 'useFormAutosave';

interface UseFormAutosaveParams {
  taskId: string | null;
  taskFormTypeKey: string | null;
  taskFormDataJson: string | null;
  formValues: Record<string, unknown>;
  setFormValues: (values: Record<string, unknown>) => void;
  getAutoSavedForm: (
    taskId: string,
    formType: string,
  ) => Promise<Record<string, unknown> | null>;
  updateTaskFormData: (
    taskId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  persistAutoSave: (
    taskId: string,
    payload: {
      formType: string;
      formData: Record<string, unknown>;
      timestamp?: string;
    },
  ) => Promise<void>;
}

export const useFormAutosave = ({
  taskId,
  taskFormTypeKey,
  taskFormDataJson,
  formValues,
  setFormValues,
  getAutoSavedForm,
  updateTaskFormData,
  persistAutoSave,
}: UseFormAutosaveParams): {
  isInitialized: boolean;
  autoSaveError: boolean;
  flushNow: () => Promise<void>;
} => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const isMountedRef = useRef(true);
  const latestFormValuesRef = useRef(formValues);
  // B3 (audit 2026-04-21 round 2): records which taskId the values in
  // `latestFormValuesRef` actually belong to, so unmount flushes can
  // detect and drop stale values after a taskId change.
  const valuesTaskIdRef = useRef<string | null>(taskId);
  const latestTaskIdRef = useRef(taskId);
  const latestTaskFormTypeRef = useRef(taskFormTypeKey);

  useEffect(() => {
    latestFormValuesRef.current = formValues;
    valuesTaskIdRef.current = taskId;
  }, [formValues, taskId]);

  useEffect(() => {
    latestTaskIdRef.current = taskId;
  }, [taskId]);

  useEffect(() => {
    latestTaskFormTypeRef.current = taskFormTypeKey;
  }, [taskFormTypeKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      const currentTaskId = latestTaskIdRef.current;
      const latestValues = latestFormValuesRef.current;
      const valuesTaskId = valuesTaskIdRef.current;
      // B3 (audit 2026-04-21 round 2): only flush the pending values if
      // they actually belong to the current task. When `taskId` switches
      // on a mounted screen (React Nav re-uses the screen for a
      // different task), the reset effect clears `isInitialized` but
      // `latestFormValuesRef` still carries the previous task's values.
      // An unmount in the brief window before the init effect writes the
      // new draft would otherwise persist task A's form data under
      // task B, silently corrupting drafts. Tag the ref with its
      // owning taskId so we can drop stale flushes.
      if (
        currentTaskId &&
        valuesTaskId === currentTaskId &&
        Object.keys(latestValues).length > 0
      ) {
        updateTaskFormData(currentTaskId, latestValues).catch(err => {
          Logger.error(TAG, 'Failed to persist form data on unmount', err);
        });
        persistAutoSave(currentTaskId, {
          formType: latestTaskFormTypeRef.current || 'DEFAULT',
          formData: latestValues,
          timestamp: new Date().toISOString(),
        }).catch(err => {
          Logger.error(TAG, 'Failed to persist auto-save on unmount', err);
        });
      }
      isMountedRef.current = false;
    };
  }, [persistAutoSave, updateTaskFormData]);

  useEffect(() => {
    setIsInitialized(false);
    setAutoSaveError(false);
    // B3: clear the cached values + re-tag the owner. The live
    // `formValues` state is owned by the caller; telling it to reset
    // avoids showing task A's data briefly while task B's draft loads.
    latestFormValuesRef.current = {};
    valuesTaskIdRef.current = taskId;
    setFormValues({});
  }, [taskId, setFormValues]);

  useEffect(() => {
    if (!taskId || isInitialized) {
      return;
    }

    let isActive = true;

    const initializeDraft = async () => {
      try {
        const localDraft = taskFormDataJson
          ? JSON.parse(taskFormDataJson)
          : null;
        const localDraftTimestamp =
          localDraft?.__submission?.updatedAt ||
          localDraft?.__autosave?.timestamp;

        // Also check autosave storage for potentially newer data
        let savedDraft: Record<string, unknown> | null = null;
        let savedDraftTimestamp: string | undefined;
        if (taskFormTypeKey) {
          savedDraft = await getAutoSavedForm(taskId, taskFormTypeKey);
          savedDraftTimestamp =
            (savedDraft as any)?.timestamp ||
            (savedDraft as any)?.__autosave?.timestamp;
        }

        // Use whichever draft is newer (compare timestamps if both exist)
        const useLocalDraft = localDraft && typeof localDraft === 'object';
        const useSavedDraft = savedDraft && typeof savedDraft === 'object';
        let chosenDraft: Record<string, unknown> | null = null;

        if (
          useLocalDraft &&
          useSavedDraft &&
          localDraftTimestamp &&
          savedDraftTimestamp
        ) {
          // Both exist with timestamps — use the newer one
          chosenDraft =
            new Date(savedDraftTimestamp) > new Date(localDraftTimestamp)
              ? savedDraft
              : localDraft;
        } else if (useLocalDraft) {
          chosenDraft = localDraft;
        } else if (useSavedDraft) {
          chosenDraft = savedDraft;
        }

        if (isActive && isMountedRef.current && chosenDraft) {
          setFormValues(chosenDraft);
          // Persist the chosen draft back to task DB if it came from autosave
          if (chosenDraft === savedDraft) {
            try {
              await updateTaskFormData(taskId, chosenDraft);
            } catch {
              // Keep restored UI state even if persistence fails temporarily.
            }
          }
        }
      } catch (err) {
        // M2 (audit 2026-04-21): log malformed cached drafts. Prior
        // code silently swallowed the parse error so a field agent
        // whose previously-saved draft went corrupt just saw "no
        // draft" with no trace. Logging surfaces the corruption in
        // telemetry; UI still falls back to empty form state, which
        // is the only safe behaviour.
        Logger.warn(
          'useFormAutosave',
          `Autosave draft for task ${taskId} failed to restore`,
          err,
        );
      } finally {
        if (isActive && isMountedRef.current) {
          setIsInitialized(true);
        }
      }
    };

    initializeDraft();

    return () => {
      isActive = false;
    };
  }, [
    getAutoSavedForm,
    isInitialized,
    setFormValues,
    taskFormDataJson,
    taskFormTypeKey,
    taskId,
    updateTaskFormData,
  ]);

  // Save immediately when app goes to background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        const currentTaskId = latestTaskIdRef.current;
        const latestValues = latestFormValuesRef.current;
        if (currentTaskId && Object.keys(latestValues).length > 0) {
          updateTaskFormData(currentTaskId, latestValues).catch(err => {
            Logger.error(
              TAG,
              'Failed to persist form data on app background',
              err,
            );
          });
          persistAutoSave(currentTaskId, {
            formType: latestTaskFormTypeRef.current || 'DEFAULT',
            formData: latestValues,
            timestamp: new Date().toISOString(),
          }).catch(err => {
            Logger.error(
              TAG,
              'Failed to persist auto-save on app background',
              err,
            );
          });
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => {
      subscription.remove();
    };
  }, [persistAutoSave, updateTaskFormData]);

  useEffect(() => {
    if (!taskId || !isInitialized || Object.keys(formValues).length === 0) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        await updateTaskFormData(taskId, formValues);
        await persistAutoSave(taskId, {
          formType: taskFormTypeKey || 'DEFAULT',
          formData: formValues,
        });
        // Clear error flag on successful save
        if (isMountedRef.current) {
          setAutoSaveError(false);
        }
      } catch (err) {
        Logger.error(
          TAG,
          'Auto-save failed — form data may not be persisted',
          err,
        );
        if (isMountedRef.current) {
          setAutoSaveError(true);
        }
      }
    }, 300); // 300ms — fast enough to survive most crashes without impacting typing UX

    return () => clearTimeout(timeoutId);
  }, [
    formValues,
    isInitialized,
    persistAutoSave,
    taskFormTypeKey,
    taskId,
    updateTaskFormData,
  ]);

  // M6 (audit 2026-04-21): synchronous flush path for callers who
  // need to persist the current form state NOW — e.g. the
  // `beforeRemove` navigation guard that shows "your draft will be
  // auto-saved" and then lets the user leave. Without this, the
  // 300 ms debounce timer could still be pending at the moment of
  // navigation; the effect's cleanup would then cancel it and the
  // last keystrokes would be lost.
  const flushNow = useCallback(async () => {
    const currentTaskId = latestTaskIdRef.current;
    const latestValues = latestFormValuesRef.current;
    if (!currentTaskId || Object.keys(latestValues).length === 0) {
      return;
    }
    try {
      await updateTaskFormData(currentTaskId, latestValues);
      await persistAutoSave(currentTaskId, {
        formType: latestTaskFormTypeRef.current || 'DEFAULT',
        formData: latestValues,
      });
    } catch (err) {
      Logger.error(TAG, 'Autosave flushNow failed', err);
    }
  }, [persistAutoSave, updateTaskFormData]);

  return { isInitialized, autoSaveError, flushNow };
};

export default useFormAutosave;
