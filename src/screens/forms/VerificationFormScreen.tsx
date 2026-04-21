// cspell:words Pagadi Accomodation Adhar Neighbour Bunglow Chawl Patra Resi Existance authorised Authorised
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTask } from '../../hooks/useTask';
import { PhotoGallery } from '../../components/media/PhotoGallery';
import { DynamicFormBuilder } from './DynamicFormBuilder';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import Icon from 'react-native-vector-icons/Ionicons';
import type { FormTemplate } from '../../types/api';
import { useTaskManager } from '../../context/TaskContext';
import { Logger } from '../../utils/logger';
import { resolveFormTypeKey, type FormTypeKey } from '../../utils/formTypeKey';
import { validateTemplateRequiredFields as validateFormTemplateRequiredFields } from '../../services/forms/FormValidationEngine';
import { FormTemplateService } from '../../services/forms/FormTemplateService';
import { FormSubmissionService } from '../../services/forms/FormSubmissionService';
import { useFormAutosave } from '../../hooks/forms/useFormAutosave';
import { NetworkService } from '../../services/NetworkService';
import { styles } from './VerificationFormScreen.styles';
import {
  buildLegacyTemplateForFormType,
  coerceLegacyOutcomeForFormType,
  getAllowedOutcomesForFormType,
  getOutcomeLabelForFormType,
  type LegacyOutcome,
} from './LegacyFormTemplateBuilders';

type VerificationFormScreenProps =
  import('@react-navigation/native-stack').NativeStackScreenProps<
    import('../../navigation/RootNavigator').RootStackParamList,
    'VerificationForm'
  >;

export const VerificationFormScreen = ({
  route,
  navigation,
}: VerificationFormScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    updateVerificationOutcome,
    updateTaskFormData,
    persistAutoSave,
    getAutoSavedForm,
    submitTaskForm,
  } = useTaskManager();
  const { taskId } = route.params || {};
  const { task, isLoading: taskLoading } = useTask(taskId);
  const taskFormTypeKey = React.useMemo<FormTypeKey | null>(() => {
    if (!task) return null;
    return resolveFormTypeKey({
      formType: task.verificationType || null,
      verificationTypeCode: task.verificationTypeCode || null,
      verificationTypeName: task.verificationTypeName || null,
    });
  }, [task]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [templateLoading, setTemplateLoading] = useState(false); // don't load immediately
  const [selectedOutcome, setSelectedOutcome] = useState<LegacyOutcome | null>(
    null,
  );
  const [outcomeWarning, setOutcomeWarning] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [selfieCount, setSelfieCount] = useState(0);
  const taskUuid = task?.id ?? null;
  const taskVerificationOutcome = task?.verificationOutcome ?? null;
  const taskFormDataJson = task?.formDataJson ?? null;
  const effectiveTaskId = task?.id || taskId;
  const {
    autoSaveError,
    isInitialized: autosaveInitialized,
    flushNow: flushAutosaveNow,
  } = useFormAutosave({
    taskId: taskUuid,
    taskFormTypeKey,
    taskFormDataJson,
    formValues,
    setFormValues,
    getAutoSavedForm,
    updateTaskFormData,
    persistAutoSave,
  });

  const formProgress = useMemo(() => {
    if (!template) return { filled: 0, total: 0, percent: 0 };

    let totalRequired = 0;
    let filledRequired = 0;

    const evaluateConditionSimple = (
      condition: any,
      values: Record<string, any>,
    ): boolean => {
      const actual = values[condition.field];
      switch (condition.operator) {
        case 'equals':
          return actual === condition.value;
        case 'notEquals':
          return actual !== condition.value;
        case 'notIn':
          return (
            !Array.isArray(condition.value) || !condition.value.includes(actual)
          );
        case 'in':
          return (
            Array.isArray(condition.value) && condition.value.includes(actual)
          );
        default:
          return true;
      }
    };

    for (const section of template.sections) {
      if (
        section.conditional &&
        !evaluateConditionSimple(section.conditional, formValues)
      )
        continue;
      for (const field of section.fields) {
        if (
          field.conditional &&
          !evaluateConditionSimple(field.conditional, formValues)
        )
          continue;

        let isRequired = Boolean(field.required);
        if (!isRequired && field.requiredWhen) {
          const conditions = Array.isArray(field.requiredWhen)
            ? field.requiredWhen
            : [field.requiredWhen];
          isRequired = conditions.every((c: any) =>
            evaluateConditionSimple(c, formValues),
          );
        }

        if (!isRequired) continue;
        totalRequired += 1;

        const val = formValues[field.name || field.id];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          filledRequired += 1;
        }
      }
    }

    const percent =
      totalRequired > 0
        ? Math.round((filledRequired / totalRequired) * 100)
        : 0;
    return { filled: filledRequired, total: totalRequired, percent };
  }, [template, formValues]);

  const getLegacyTemplate = React.useCallback(
    (verificationType: FormTypeKey, outcome: string): FormTemplate | null =>
      buildLegacyTemplateForFormType(verificationType, outcome),
    [],
  );
  const outcomeOptions = React.useMemo(() => {
    return getAllowedOutcomesForFormType(taskFormTypeKey).map(outcome => ({
      value: outcome,
      label: getOutcomeLabelForFormType(taskFormTypeKey, outcome),
    }));
  }, [taskFormTypeKey]);

  // Sync state once task is loaded — only runs when task data changes, not when
  // selectedOutcome changes (which would create a dependency cycle).
  useEffect(() => {
    if (
      taskUuid &&
      taskFormTypeKey &&
      !selectedOutcome &&
      taskVerificationOutcome
    ) {
      const coercedOutcome = coerceLegacyOutcomeForFormType(
        taskFormTypeKey,
        taskVerificationOutcome,
      );
      if (coercedOutcome.warning) {
        Logger.warn(
          'VerificationFormScreen',
          'Outcome was coerced for task outcome',
          {
            taskId: taskUuid,
            formType: taskFormTypeKey,
            rawOutcome: taskVerificationOutcome,
            fallbackOutcome: coercedOutcome.outcome,
            warning: coercedOutcome.warning,
          },
        );
      }
      setOutcomeWarning(coercedOutcome.warning);
      setSelectedOutcome(coercedOutcome.outcome);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedOutcome excluded to prevent cycle
  }, [taskUuid, taskVerificationOutcome, taskFormTypeKey]);

  // Keep selected outcome valid for the current verification type.
  useEffect(() => {
    if (!selectedOutcome || !taskFormTypeKey) {
      return;
    }

    const allowedOutcomes = getAllowedOutcomesForFormType(taskFormTypeKey);
    if (!allowedOutcomes.includes(selectedOutcome)) {
      const coercedOutcome = coerceLegacyOutcomeForFormType(
        taskFormTypeKey,
        selectedOutcome,
      );
      Logger.warn(
        'VerificationFormScreen',
        'Selected outcome was not allowed and got coerced',
        {
          formType: taskFormTypeKey,
          currentSelectedOutcome: selectedOutcome,
          fallbackOutcome: coercedOutcome.outcome,
          warning: coercedOutcome.warning,
        },
      );
      setOutcomeWarning(coercedOutcome.warning);
      setSelectedOutcome(coercedOutcome.outcome);
    }
  }, [selectedOutcome, taskFormTypeKey]);

  // 1. Fetch exactly the right template for this task when loaded and outcome is set
  useEffect(() => {
    if (!taskUuid || !taskFormTypeKey || !selectedOutcome) {
      setTemplate(null);
      setTemplateLoading(false);
      return;
    }
    let isActive = true;

    const loadTemplate = async () => {
      setTemplateLoading(true);
      try {
        const verificationType = taskFormTypeKey;
        const coercedOutcome = coerceLegacyOutcomeForFormType(
          verificationType,
          selectedOutcome,
        );
        if (coercedOutcome.warning) {
          Logger.warn(
            'VerificationFormScreen',
            'Template load used coerced outcome',
            {
              taskId: taskUuid,
              formType: verificationType,
              selectedOutcome,
              fallbackOutcome: coercedOutcome.outcome,
              warning: coercedOutcome.warning,
            },
          );
          setOutcomeWarning(coercedOutcome.warning);
        }
        const normalizedOutcome = coercedOutcome.outcome;
        const nextTemplate = await FormTemplateService.loadTemplate({
          verificationType,
          outcome: normalizedOutcome,
          getLegacyTemplate,
        });

        if (isActive) {
          setTemplate(nextTemplate);
        }
      } catch (e) {
        Logger.error('VerificationFormScreen', 'Error loading template', e);
      } finally {
        if (isActive) {
          setTemplateLoading(false);
        }
      }
    };

    loadTemplate();
    return () => {
      isActive = false;
    };
  }, [getLegacyTemplate, taskUuid, selectedOutcome, taskFormTypeKey]);

  const taskMeta = useMemo(
    () => ({
      caseId: task?.caseId != null ? String(task.caseId) : undefined,
      taskNumber: task?.verificationTaskNumber || undefined,
      customerName: task?.customerName || undefined,
      clientName: task?.clientName || undefined,
      productName: task?.productName || undefined,
      verificationType:
        task?.verificationTypeName || task?.verificationType || undefined,
    }),
    [task],
  );

  const handleAddPhoto = () => {
    navigation.navigate('CameraCapture', {
      taskId: effectiveTaskId,
      componentType: 'photo',
      taskMeta,
    });
  };

  const handleAddSelfie = () => {
    navigation.navigate('CameraCapture', {
      taskId: effectiveTaskId,
      componentType: 'selfie',
      taskMeta,
    });
  };

  const handleOutcomeSelect = async (outcome: LegacyOutcome) => {
    if (!task) return;
    try {
      await updateVerificationOutcome(task.id, outcome);
      setOutcomeWarning(null);
      setSelectedOutcome(outcome);
    } catch (e) {
      Logger.error('VerificationFormScreen', 'Failed to set outcome', e);
    }
  };
  const handleOutcomeChange = (outcome: string) => {
    if (!outcome) {
      return;
    }
    // H13 (audit 2026-04-21): log the failure so a broken outcome
    // selection surfaces in telemetry / crash reports. The UX
    // fallback (selector stays on the prior value visually) is
    // intentional — a toast/alert here would be noisy for the
    // common case of a transient DB contention retry.
    handleOutcomeSelect(outcome as LegacyOutcome).catch(err => {
      Logger.warn(
        'VerificationFormScreen',
        'Failed to apply outcome selection',
        err,
      );
    });
  };

  const handleFieldChange = React.useCallback(
    (fieldId: string, value: unknown) => {
      setFormValues(currentValues => {
        if (currentValues[fieldId] === value) {
          return currentValues;
        }
        return {
          ...currentValues,
          [fieldId]: value,
        };
      });
    },
    [],
  );

  // Navigation guard — warn user before leaving with unsaved changes
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (Object.keys(formValues).length === 0 || isSubmitting) {
        return; // No unsaved data or already submitting
      }
      e.preventDefault();
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved form data. Your draft will be auto-saved. Leave anyway?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: async () => {
              // M6 (audit 2026-04-21): flush synchronously before
              // dispatching the pending nav action. Without this, the
              // 300 ms autosave debounce could still be pending; the
              // unmount cleanup would then cancel it and the user's
              // last keystrokes would be lost — directly contradicting
              // the "your draft will be auto-saved" alert text above.
              try {
                await flushAutosaveNow();
              } catch {
                // best effort — navigation happens regardless so the
                // user isn't trapped on the screen.
              }
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, formValues, isSubmitting, flushAutosaveNow]);

  const handleSave = async () => {
    if (!task || !selectedOutcome) return;

    try {
      setIsSaving(true);
      await updateTaskFormData(task.id, formValues);
      await persistAutoSave(task.id, {
        formType: taskFormTypeKey || 'DEFAULT',
        formData: formValues,
      });
      Alert.alert(
        'Saved',
        'Your form has been saved locally. You can continue filling it later.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: unknown) {
      Alert.alert(
        'Save Error',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!task) return;

    if (!template) {
      Alert.alert('Validation Error', 'Form template is not loaded yet.');
      return;
    }

    const templateValidation = validateFormTemplateRequiredFields(
      template,
      formValues,
    );
    if (!templateValidation.isValid) {
      const preview = templateValidation.missingFields.slice(0, 6).join(', ');
      const hasMore = templateValidation.missingFields.length > 6;
      Alert.alert(
        'Validation Error',
        `Please fill all required fields: ${preview}${hasMore ? ' ...' : ''}`,
      );
      return;
    }

    // Offline confirmation — let user know form will be queued
    const isOnline = NetworkService.getIsOnline();
    if (!isOnline) {
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          'You Are Offline',
          'The form will be saved locally and uploaded automatically when connection is restored. Continue?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Save Offline', onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;
    }

    try {
      setIsSubmitting(true);

      await FormSubmissionService.submitVerificationForm({
        task,
        template,
        formValues,
        selectedOutcome,
        taskFormTypeKey,
        submitTaskForm,
      });

      Alert.alert(
        'Success',
        'Verification submitted successfully and queued for upload.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Main', { screen: 'Completed' }),
          },
        ],
      );
    } catch (err: unknown) {
      const message = String(
        err instanceof Error
          ? err.message
          : String(err) || 'Failed to submit form.',
      );
      const title = message.startsWith(
        'You must capture at least 5 location photos',
      )
        ? 'Missing Evidence'
        : 'Submission Error';
      Alert.alert(title, message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (taskLoading) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text
          style={[
            styles.centerLoadingText,
            { color: theme.colors.textSecondary },
          ]}
        >
          Loading verification form...
        </Text>
      </View>
    );
  }

  const renderOutcomeSelector = () => (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.stepHeader}>
        <View
          style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={[styles.stepBadgeText, { color: theme.colors.surface }]}>
            2
          </Text>
        </View>
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
          Select Outcome
        </Text>
      </View>
      <View
        style={[
          styles.outcomePickerContainer,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Picker
          selectedValue={selectedOutcome ?? ''}
          onValueChange={handleOutcomeChange}
          dropdownIconColor={theme.colors.text}
          style={{ color: theme.colors.text }}
        >
          <Picker.Item
            label="Select Outcome"
            value=""
            color={theme.colors.textMuted}
          />
          {outcomeOptions.map(option => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
      {!selectedOutcome ? (
        <Text
          style={[styles.stateHintText, { color: theme.colors.textSecondary }]}
        >
          Select an outcome to load the exact form fields.
        </Text>
      ) : null}
      {outcomeWarning ? (
        <View
          style={[
            styles.outcomeWarningCard,
            {
              backgroundColor: `${theme.colors.warning}18`,
              borderColor: `${theme.colors.warning}40`,
            },
          ]}
        >
          <Icon name="warning-outline" size={16} color={theme.colors.warning} />
          <Text
            style={[styles.outcomeWarningText, { color: theme.colors.warning }]}
          >
            {outcomeWarning}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Verification Form" />
      {autoSaveError && (
        <View style={styles.autoSaveErrorBanner}>
          <Icon name="warning-outline" size={18} color="#DC2626" />
          <Text style={styles.autoSaveErrorText}>
            Auto-save failed. Your changes may not be preserved. Please check
            device storage.
          </Text>
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContentWithFooter,
            { paddingBottom: Math.max(insets.bottom, 16) + 80 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Block */}
          <View
            style={[
              styles.section,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.stepHeader}>
              <View
                style={[
                  styles.stepBadge,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.stepBadgeText,
                    { color: theme.colors.surface },
                  ]}
                >
                  1
                </Text>
              </View>
              <Text
                style={[styles.sectionTitle, { color: theme.colors.textMuted }]}
              >
                Verification Photos
              </Text>
            </View>

            <View style={styles.photoHeader}>
              <Text style={[styles.photoLabel, { color: theme.colors.text }]}>
                General Photos (min 5){' '}
                <Text
                  style={{
                    color:
                      photoCount >= 5
                        ? theme.colors.success || '#16A34A'
                        : theme.colors.danger,
                  }}
                >
                  ({photoCount} captured)
                </Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleAddPhoto}
              >
                <Icon name="camera" size={20} color={theme.colors.surface} />
              </TouchableOpacity>
            </View>
            <PhotoGallery
              taskId={effectiveTaskId}
              componentType="photo"
              onPhotosLoaded={setPhotoCount}
            />

            <View style={styles.selfieHeader}>
              <Text style={[styles.photoLabel, { color: theme.colors.text }]}>
                Selfie (min 1){' '}
                <Text
                  style={{
                    color:
                      selfieCount >= 1
                        ? theme.colors.success || '#16A34A'
                        : theme.colors.danger,
                  }}
                >
                  ({selfieCount} captured)
                </Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleAddSelfie}
              >
                <Icon name="person" size={20} color={theme.colors.surface} />
              </TouchableOpacity>
            </View>
            <PhotoGallery
              taskId={effectiveTaskId}
              componentType="selfie"
              onPhotosLoaded={setSelfieCount}
            />
          </View>

          {renderOutcomeSelector()}

          {/* Progress Bar */}
          {template && selectedOutcome && formProgress.total > 0 ? (
            <View
              style={[
                styles.section,
                styles.progressSection,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.progressText, { color: theme.colors.text }]}>
                {formProgress.filled}/{formProgress.total} required fields
                completed ({formProgress.percent}%)
              </Text>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                {/* eslint-disable react-native/no-inline-styles */}
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${formProgress.percent}%`,
                      backgroundColor:
                        formProgress.percent === 100
                          ? '#22C55E'
                          : theme.colors.primary,
                    },
                  ]}
                />
                {/* eslint-enable react-native/no-inline-styles */}
              </View>
            </View>
          ) : null}

          {/* Dynamic Form Block */}
          <View
            style={[
              styles.section,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.stepHeader}>
              <View
                style={[
                  styles.stepBadge,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.stepBadgeText,
                    { color: theme.colors.surface },
                  ]}
                >
                  3
                </Text>
              </View>
              <Text
                style={[styles.sectionTitle, { color: theme.colors.textMuted }]}
              >
                Verification Details
              </Text>
            </View>
            {!selectedOutcome ? (
              <View
                style={[
                  styles.stateCard,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Icon
                  name="information-circle-outline"
                  size={18}
                  color={theme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.stateCardText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Choose an outcome in Step 2 to continue.
                </Text>
              </View>
            ) : templateLoading || (!!taskUuid && !autosaveInitialized) ? (
              // Gate form render until the autosaved draft has hydrated.
              // Without this gate, a user can type into an empty field
              // during the brief window between first render and the
              // draft-hydration effect — setFormValues(chosenDraft) then
              // replaces the entire state and their keystrokes are lost.
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text
                  style={[
                    styles.stateHintText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Loading form fields...
                </Text>
              </View>
            ) : template ? (
              <DynamicFormBuilder
                template={template}
                formValues={formValues}
                onFieldChange={handleFieldChange}
              />
            ) : (
              <View
                style={[
                  styles.stateCard,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Icon
                  name="alert-circle-outline"
                  size={18}
                  color={theme.colors.warning}
                />
                <Text
                  style={[
                    styles.stateCardText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  No form template found for this outcome.
                </Text>
              </View>
            )}
          </View>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                marginBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            {!selectedOutcome ? (
              <View
                style={[
                  styles.submitButton,
                  styles.submitButtonInactive,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Icon
                  name="lock-closed-outline"
                  size={20}
                  color={theme.colors.textMuted}
                />
                <Text
                  style={[styles.submitText, { color: theme.colors.textMuted }]}
                >
                  Select Outcome First
                </Text>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    styles.actionButtonSecondary,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.border,
                    },
                    isSaving && styles.actionButtonDimmed,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving || isSubmitting || templateLoading}
                >
                  {isSaving ? (
                    <>
                      <ActivityIndicator color={theme.colors.text} />
                      <Text
                        style={[
                          styles.submitText,
                          { color: theme.colors.text },
                        ]}
                      >
                        Saving...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="save-outline"
                        size={20}
                        color={theme.colors.text}
                      />
                      <Text
                        style={[
                          styles.submitText,
                          { color: theme.colors.text },
                        ]}
                      >
                        Save
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    styles.actionButtonPrimary,
                    { backgroundColor: theme.colors.primary },
                    isSubmitting && styles.actionButtonDimmed,
                  ]}
                  onPress={handleSubmit}
                  disabled={isSubmitting || isSaving || templateLoading}
                >
                  {isSubmitting ? (
                    <>
                      <ActivityIndicator color={theme.colors.surface} />
                      <Text
                        style={[
                          styles.submitText,
                          { color: theme.colors.surface },
                        ]}
                      >
                        Submitting...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="cloud-upload-outline"
                        size={20}
                        color={theme.colors.surface}
                      />
                      <Text
                        style={[
                          styles.submitText,
                          { color: theme.colors.surface },
                        ]}
                      >
                        Submit Verification
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};
