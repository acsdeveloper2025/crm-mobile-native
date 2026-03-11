// cspell:words Pagadi Accomodation Adhar Neighbour Bunglow Chawl Patra Resi Existance authorised Authorised
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTask } from '../../hooks/useTask';
import { PhotoGallery } from '../../components/media/PhotoGallery';
import { DynamicFormBuilder } from './DynamicFormBuilder';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import type { FormTemplate } from '../../types/api';
import { useTaskManager } from '../../context/TaskContext';
import { Logger } from '../../utils/logger';
import {
  resolveFormTypeKey,
  type FormTypeKey,
} from '../../utils/formTypeKey';
import { validateTemplateRequiredFields as validateFormTemplateRequiredFields } from '../../services/forms/FormValidationEngine';
import { FormTemplateService } from '../../services/forms/FormTemplateService';
import { FormSubmissionService } from '../../services/forms/FormSubmissionService';
import { useFormAutosave } from '../../hooks/forms/useFormAutosave';
import { styles } from './VerificationFormScreen.styles';
import {
  buildLegacyTemplateForFormType,
  coerceLegacyOutcomeForFormType,
  getAllowedOutcomesForFormType,
  getOutcomeLabelForFormType,
  type LegacyOutcome,
} from './LegacyFormTemplateBuilders';

export const VerificationFormScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    updateVerificationOutcome,
    updateTaskFormData,
    persistAutoSave,
    getAutoSavedForm,
    submitTaskForm,
  } = useTaskManager();
  const { taskId } = route.params;
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
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [templateLoading, setTemplateLoading] = useState(false); // don't load immediately
  const [selectedOutcome, setSelectedOutcome] = useState<LegacyOutcome | null>(null);
  const [outcomeWarning, setOutcomeWarning] = useState<string | null>(null);
  const taskUuid = task?.id ?? null;
  const taskVerificationOutcome = task?.verificationOutcome ?? null;
  const taskFormDataJson = task?.formDataJson ?? null;
  const effectiveTaskId = task?.id || taskId;
  useFormAutosave({
    taskId: taskUuid,
    taskFormTypeKey,
    taskFormDataJson,
    formValues,
    setFormValues,
    getAutoSavedForm,
    updateTaskFormData,
    persistAutoSave,
  });

  const getLegacyTemplate = React.useCallback(
    (verificationType: FormTypeKey, outcome: string): FormTemplate | null =>
      buildLegacyTemplateForFormType(verificationType, outcome),
    [],
  );
  const outcomeOptions = React.useMemo(() => {
    const colorByOutcome: Record<LegacyOutcome, string> = {
      POSITIVE: theme.colors.success,
      SHIFTED: theme.colors.warning,
      NSP: theme.colors.info,
      ENTRY_RESTRICTED: theme.colors.primary,
      UNTRACEABLE: theme.colors.textMuted,
    };
    const iconByOutcome: Record<LegacyOutcome, string> = {
      POSITIVE: 'checkmark-circle-outline',
      SHIFTED: 'swap-horizontal-outline',
      NSP: 'person-remove-outline',
      ENTRY_RESTRICTED: 'hand-left-outline',
      UNTRACEABLE: 'locate-outline',
    };

    return getAllowedOutcomesForFormType(taskFormTypeKey).map(outcome => ({
      value: outcome,
      label: getOutcomeLabelForFormType(taskFormTypeKey, outcome),
      icon: iconByOutcome[outcome],
      color: colorByOutcome[outcome],
    }));
  }, [taskFormTypeKey, theme.colors.info, theme.colors.primary, theme.colors.success, theme.colors.textMuted, theme.colors.warning]);

  // Sync state once task is loaded
  useEffect(() => {
    if (taskUuid && taskFormTypeKey && !selectedOutcome && taskVerificationOutcome) {
      const coercedOutcome = coerceLegacyOutcomeForFormType(taskFormTypeKey, taskVerificationOutcome);
      if (coercedOutcome.warning) {
        Logger.warn('VerificationFormScreen', 'Outcome was coerced for task outcome', {
          taskId: taskUuid,
          formType: taskFormTypeKey,
          rawOutcome: taskVerificationOutcome,
          fallbackOutcome: coercedOutcome.outcome,
          warning: coercedOutcome.warning,
        });
      }
      setOutcomeWarning(coercedOutcome.warning);
      setSelectedOutcome(coercedOutcome.outcome);
    }
  }, [taskUuid, taskVerificationOutcome, taskFormTypeKey, selectedOutcome]);

  // Keep selected outcome valid for the current verification type.
  useEffect(() => {
    if (!selectedOutcome || !taskFormTypeKey) {
      return;
    }

    const allowedOutcomes = getAllowedOutcomesForFormType(taskFormTypeKey);
    if (!allowedOutcomes.includes(selectedOutcome)) {
      const coercedOutcome = coerceLegacyOutcomeForFormType(taskFormTypeKey, selectedOutcome);
      Logger.warn('VerificationFormScreen', 'Selected outcome was not allowed and got coerced', {
        formType: taskFormTypeKey,
        currentSelectedOutcome: selectedOutcome,
        fallbackOutcome: coercedOutcome.outcome,
        warning: coercedOutcome.warning,
      });
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
        const coercedOutcome = coerceLegacyOutcomeForFormType(verificationType, selectedOutcome);
        if (coercedOutcome.warning) {
          Logger.warn('VerificationFormScreen', 'Template load used coerced outcome', {
            taskId: taskUuid,
            formType: verificationType,
            selectedOutcome,
            fallbackOutcome: coercedOutcome.outcome,
            warning: coercedOutcome.warning,
          });
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
        console.error('Error loading template', e);
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

  const handleAddPhoto = () => {
    navigation.navigate('CameraCapture', { taskId: effectiveTaskId, componentType: 'photo' });
  };

  const handleAddSelfie = () => {
    navigation.navigate('CameraCapture', { taskId: effectiveTaskId, componentType: 'selfie' });
  };

  const handleOutcomeSelect = async (outcome: LegacyOutcome) => {
    if (!task) return;
    try {
      await updateVerificationOutcome(task.id, outcome);
      setOutcomeWarning(null);
      setSelectedOutcome(outcome);
    } catch (e) {
      console.error('Failed to set outcome', e);
    }
  };

  const handleSubmit = async () => {
    if (!task) return;

    if (!template) {
      Alert.alert('Validation Error', 'Form template is not loaded yet.');
      return;
    }

    const templateValidation = validateFormTemplateRequiredFields(template, formValues);
    if (!templateValidation.isValid) {
      const preview = templateValidation.missingFields.slice(0, 6).join(', ');
      const hasMore = templateValidation.missingFields.length > 6;
      Alert.alert(
        'Validation Error',
        `Please fill all required fields: ${preview}${hasMore ? ' ...' : ''}`,
      );
      return;
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

      Alert.alert('Success', 'Verification Form saved offline and queued for upload.', [
        { text: 'OK', onPress: () => navigation.navigate('Main', { screen: 'Completed' }) }
      ]);

    } catch (err: any) {
      const message = String(err?.message || 'Failed to save form.');
      const title = message.startsWith('You must capture at least 5 location photos')
        ? 'Missing Evidence'
        : 'Submission Error';
      Alert.alert(title, message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (taskLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.centerLoadingText, { color: theme.colors.textSecondary }]}>Loading verification form...</Text>
      </View>
    );
  }

  const renderOutcomeSelector = () => (
    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.stepBadgeText, { color: theme.colors.surface }]}>1</Text>
        </View>
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Select Outcome</Text>
      </View>
      <View style={styles.outcomeWrapper}>
        {outcomeOptions.map(option => {
          const isActive = selectedOutcome === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.outcomeBtn,
                { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                isActive && [
                  styles.outcomeBtnActive,
                  { backgroundColor: `${option.color}20`, borderColor: option.color },
                ],
              ]}
              onPress={() => handleOutcomeSelect(option.value)}>
              <Icon
                name={option.icon}
                size={24}
                color={isActive ? option.color : theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.outcomeText,
                  { color: theme.colors.textSecondary },
                  isActive && styles.activeOutcomeText,
                  isActive && { color: option.color },
                ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!selectedOutcome ? (
        <Text style={[styles.stateHintText, { color: theme.colors.textSecondary }]}>
          Select an outcome to load the exact form fields.
        </Text>
      ) : null}
      {outcomeWarning ? (
        <View style={[styles.outcomeWarningCard, { backgroundColor: `${theme.colors.warning}18`, borderColor: `${theme.colors.warning}40` }]}>
          <Icon name="warning-outline" size={16} color={theme.colors.warning} />
          <Text style={[styles.outcomeWarningText, { color: theme.colors.warning }]}>
            {outcomeWarning}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
        showsVerticalScrollIndicator={false}>

        {renderOutcomeSelector()}

        {/* Media Block */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.stepBadgeText, { color: theme.colors.surface }]}>2</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Verification Photos</Text>
          </View>

          <View style={styles.photoHeader}>
            <Text style={[styles.photoLabel, { color: theme.colors.text }]}>General Photos (min 5)</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleAddPhoto}>
              <Icon name="camera" size={20} color={theme.colors.surface} />
            </TouchableOpacity>
          </View>
          <PhotoGallery taskId={effectiveTaskId} componentType="photo" />

          <View style={styles.selfieHeader}>
            <Text style={[styles.photoLabel, { color: theme.colors.text }]}>Selfie (min 1)</Text>
            <TouchableOpacity 
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]} 
              onPress={handleAddSelfie}>
              <Icon name="person" size={20} color={theme.colors.surface} />
            </TouchableOpacity>
          </View>
          <PhotoGallery taskId={effectiveTaskId} componentType="selfie" />
        </View>

        {/* Dynamic Form Block */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.stepBadgeText, { color: theme.colors.surface }]}>3</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Verification Details</Text>
          </View>
          {!selectedOutcome ? (
            <View style={[styles.stateCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <Icon name="information-circle-outline" size={18} color={theme.colors.textMuted} />
              <Text style={[styles.stateCardText, { color: theme.colors.textSecondary }]}>
                Choose an outcome in Step 1 to continue.
              </Text>
            </View>
          ) : templateLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.stateHintText, { color: theme.colors.textSecondary }]}>
                Loading form fields...
              </Text>
            </View>
          ) : template ? (
            <DynamicFormBuilder
              template={template}
              formValues={formValues}
              onValuesChange={setFormValues}
            />
          ) : (
            <View style={[styles.stateCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <Icon name="alert-circle-outline" size={18} color={theme.colors.warning} />
              <Text style={[styles.stateCardText, { color: theme.colors.textSecondary }]}>
                No form template found for this outcome.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      {/* Submit Action Footer */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}>
        <TouchableOpacity 
          style={[
            styles.submitButton, 
            { backgroundColor: selectedOutcome ? theme.colors.primary : theme.colors.border },
            (!selectedOutcome || isSubmitting) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || !selectedOutcome}>
          {isSubmitting ? (
            <>
              <ActivityIndicator color={theme.colors.surface} />
              <Text style={[styles.submitText, { color: theme.colors.surface }]}>Saving...</Text>
            </>
          ) : (
            <>
              <Icon
                name={selectedOutcome ? 'cloud-upload-outline' : 'lock-closed-outline'}
                size={20}
                color={theme.colors.surface}
              />
              <Text style={[styles.submitText, { color: theme.colors.surface }]}>
                {selectedOutcome ? 'Submit Verification' : 'Select Outcome First'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
