import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useTask } from '../../hooks/useTask';
import { PhotoGallery } from '../../components/media/PhotoGallery';
import { DatabaseService } from '../../database/DatabaseService';
import { DynamicFormBuilder } from '../../components/forms/DynamicFormBuilder';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import type { FormTemplate } from '../../types/api';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { normalizeVerificationType } from '../../utils/normalizeVerificationType';
import { useTaskManager } from '../../context/TaskContext';

const toBackendFormType = (verificationType: string): string => {
  const normalized = normalizeVerificationType(verificationType);
  switch (normalized) {
    case 'residence-cum-office':
      return 'RESIDENCE_CUM_OFFICE';
    case 'dsa-connector':
      return 'DSA_CONNECTOR';
    case 'property-individual':
      return 'PROPERTY_INDIVIDUAL';
    case 'property-apf':
      return 'PROPERTY_APF';
    default:
      return normalized.toUpperCase();
  }
};

const buildTemplateFromBackend = (
  verificationType: string,
  data: any,
): FormTemplate => {
  const now = new Date().toISOString();
  const fields = Array.isArray(data?.fields) ? data.fields : [];

  return {
    id: `backend-${verificationType}`,
    formType: verificationType,
    verificationType,
    outcome: 'DYNAMIC',
    name: `${verificationType} Verification`,
    description: 'Loaded from backend form definition',
    sections: [
      {
        id: 'main',
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: fields
          .filter((field: any) => field.name !== 'outcome')
          .map((field: any, index: number) => ({
            id: field.name,
            label: field.label || field.name,
            type:
              field.type === 'boolean'
                ? 'checkbox'
                : field.type === 'number'
                  ? 'number'
                  : field.type === 'textarea'
                    ? 'textarea'
                    : field.type === 'select'
                      ? 'select'
                      : 'text',
            name: field.name,
            order: index + 1,
            required: !!field.required,
            options: Array.isArray(field.options)
              ? field.options.map((option: string) => ({
                  label: option,
                  value: option,
                }))
              : undefined,
          })),
      },
    ],
    version: '1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const VerificationFormScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const {
    updateVerificationOutcome,
    updateTaskFormData,
    persistAutoSave,
    getAutoSavedForm,
    submitTaskForm,
  } = useTaskManager();
  const { taskId } = route.params;
  const { task, isLoading: taskLoading } = useTask(taskId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [templateLoading, setTemplateLoading] = useState(false); // don't load immediately
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const outcomeOptions = [
    {
      value: 'POSITIVE',
      label: 'Positive',
      icon: 'checkmark-circle-outline',
      color: theme.colors.success,
    },
    {
      value: 'NEGATIVE',
      label: 'Negative',
      icon: 'close-circle-outline',
      color: theme.colors.danger,
    },
    {
      value: 'SHIFTED',
      label: 'Shifted',
      icon: 'swap-horizontal-outline',
      color: theme.colors.warning,
    },
    {
      value: 'NSP',
      label: 'NSP',
      icon: 'person-remove-outline',
      color: theme.colors.info,
    },
    {
      value: 'ENTRY_RESTRICTED',
      label: 'Entry Restricted',
      icon: 'hand-left-outline',
      color: theme.colors.primary,
    },
    {
      value: 'UNTRACEABLE',
      label: 'Untraceable',
      icon: 'locate-outline',
      color: theme.colors.textMuted,
    },
  ] as const;

  // Sync state once task is loaded
  useEffect(() => {
    if (task && !selectedOutcome && task.verificationOutcome) {
      setSelectedOutcome(task.verificationOutcome);
    }
  }, [task, selectedOutcome]);

  // Initialize draft data
  useEffect(() => {
    if (!task || isInitialized) {
      return;
    }

    let isMounted = true;

    const initializeDraft = async () => {
      try {
        const localDraft = task.formDataJson ? JSON.parse(task.formDataJson) : null;
        if (isMounted && localDraft && typeof localDraft === 'object') {
          setFormValues(localDraft);
        } else if (isMounted && task.verificationType) {
          const savedDraft = await getAutoSavedForm(task.id, task.verificationType);
          if (savedDraft) {
            setFormValues(savedDraft);
            await updateTaskFormData(task.id, savedDraft);
          }
        }
      } catch (error) {
        console.error('Failed to initialize form draft', error);
      } finally {
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };

    initializeDraft();

    return () => {
      isMounted = false;
    };
  }, [getAutoSavedForm, isInitialized, task, updateTaskFormData]);

  // Auto-Save Draft
  useEffect(() => {
    if (!task?.id || !isInitialized || Object.keys(formValues).length === 0) return;

    const draftAutoSave = async () => {
      try {
        await updateTaskFormData(task.id, formValues);
        await persistAutoSave(task.id, {
          formType: task.verificationType || 'DEFAULT',
          formData: formValues,
        });
      } catch (e) {
        console.error('AutoSave Error', e);
      }
    };

    const timeoutId = setTimeout(draftAutoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [formValues, isInitialized, persistAutoSave, task?.id, task?.verificationType, updateTaskFormData]);

  // 1. Fetch exactly the right template for this task when loaded and outcome is set
  useEffect(() => {
    if (!task || !task.verificationType || !selectedOutcome) return;
    
    const loadTemplate = async () => {
      setTemplateLoading(true);
      try {
        const verificationType = task.verificationType || 'DEFAULT';
        const rows = await DatabaseService.query<any>(
          `SELECT sections_json, name, description FROM form_templates 
           WHERE verification_type = ? AND outcome = ? AND is_active = 1 LIMIT 1`,
          [verificationType, selectedOutcome]
        );

        if (rows.length > 0) {
          const tplData = rows[0];
          const localSections = JSON.parse(tplData.sections_json).map((section: any) => ({
            ...section,
            fields: Array.isArray(section.fields)
              ? section.fields.filter((field: any) => field.name !== 'outcome')
              : [],
          }));
          setTemplate({
            id: 'local',
            formType: verificationType,
            verificationType,
            outcome: task.verificationOutcome || 'POSITIVE',
            name: tplData.name,
            description: tplData.description || '',
            sections: localSections,
            version: '1.0',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          return;
        }

        const backendFormType = toBackendFormType(verificationType);
        const response = await ApiClient.get<{ success: boolean; data?: any }>(
          ENDPOINTS.FORMS.TEMPLATE(backendFormType),
          { params: { outcome: selectedOutcome } },
        );

        if (!response.success || !response.data) {
          return;
        }

        const backendTemplate = buildTemplateFromBackend(verificationType, response.data);
        const now = new Date().toISOString();

        await DatabaseService.execute(
          `INSERT OR REPLACE INTO form_templates 
            (id, form_type, verification_type, outcome, name, description, sections_json, version, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            backendTemplate.id,
            backendTemplate.formType,
            backendTemplate.verificationType,
            selectedOutcome,
            backendTemplate.name,
            backendTemplate.description,
            JSON.stringify(backendTemplate.sections),
            backendTemplate.version,
            1,
            now,
            now,
          ],
        );

        setTemplate({
          ...backendTemplate,
          outcome: selectedOutcome,
        });
      } catch (e) {
        console.error('Error loading template', e);
      } finally {
        setTemplateLoading(false);
      }
    };

    loadTemplate();
  }, [task, selectedOutcome]);

  const handleAddPhoto = () => {
    navigation.navigate('CameraCapture', { taskId, componentType: 'photo' });
  };

  const handleAddSelfie = () => {
    navigation.navigate('CameraCapture', { taskId, componentType: 'selfie' });
  };

  const handleOutcomeSelect = async (outcome: string) => {
    if (!task) return;
    try {
      await updateVerificationOutcome(task.id, outcome);
      setSelectedOutcome(outcome);
    } catch (e) {
      console.error('Failed to set outcome', e);
    }
  };

  const handleSubmit = async () => {
    if (!task) return;

    if (!formValues.remarks || !String(formValues.remarks).trim()) {
      Alert.alert('Validation Error', 'Remarks are mandatory in the form.');
      return;
    }

    try {
      // Photo Validations
      const photoQuery = await DatabaseService.query<any>(
        `SELECT component_type, COUNT(*) as cnt FROM attachments WHERE task_id = ? GROUP BY component_type`,
        [task.id]
      );
      
      let photoCount = 0;
      let selfieCount = 0;
      
      photoQuery.forEach(row => {
        if (row.component_type === 'photo') photoCount = row.cnt;
        if (row.component_type === 'selfie') selfieCount = row.cnt;
      });

      if (photoCount < 5 || selfieCount < 1) {
        Alert.alert(
          'Missing Evidence', 
          `You must capture at least 5 location photos (Current: ${photoCount}) and 1 Selfie (Current: ${selfieCount}) before submitting.`
        );
        return;
      }

      setIsSubmitting(true);

      // 1. Prepare Form Data JSON merging the dynamic values
      const formData = {
        ...formValues,
        submittedAt: new Date().toISOString(),
      };

      await submitTaskForm({
        taskId: task.id,
        formType: task.verificationType || 'DEFAULT',
        formData,
        verificationOutcome: selectedOutcome,
      });

      Alert.alert('Success', 'Verification Form saved offline and queued for upload.', [
        { text: 'OK', onPress: () => navigation.navigate('Main', { screen: 'Tasks' }) }
      ]);

    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to save form.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (taskLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const renderOutcomeSelector = () => (
    <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Step 1: Select Outcome</Text>
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
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {renderOutcomeSelector()}

        {/* Media Block */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Step 2: Verification Photos</Text>

          <View style={styles.photoHeader}>
            <Text style={[styles.photoLabel, { color: theme.colors.text }]}>General Photos (min 5)</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleAddPhoto}>
              <Icon name="camera" size={20} color={theme.colors.surface} />
            </TouchableOpacity>
          </View>
          <PhotoGallery taskId={taskId} componentType="photo" />

          <View style={styles.selfieHeader}>
            <Text style={[styles.photoLabel, { color: theme.colors.text }]}>Selfie (min 1)</Text>
            <TouchableOpacity 
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]} 
              onPress={handleAddSelfie}>
              <Icon name="person" size={20} color={theme.colors.surface} />
            </TouchableOpacity>
          </View>
          <PhotoGallery taskId={taskId} componentType="selfie" />
        </View>

        {/* Dynamic Form Block */}
        {selectedOutcome && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Step 3: Verification Details</Text>
            {templateLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loadingContainer} />
            ) : template ? (
              <DynamicFormBuilder
                template={template}
                formValues={formValues}
                onValuesChange={setFormValues}
              />
            ) : (
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>No form template found for this outcome.</Text>
            )}
          </View>
        )}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Submit Action Footer */}
      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity 
          style={[
            styles.submitButton, 
            { backgroundColor: theme.colors.primary },
            (!selectedOutcome || isSubmitting) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || !selectedOutcome}>
          {isSubmitting ? (
            <ActivityIndicator color={theme.colors.surface} />
          ) : (
            <>
              <Icon name="cloud-upload-outline" size={20} color={theme.colors.surface} />
              <Text style={[styles.submitText, { color: theme.colors.surface }]}>Submit Verification</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  outcomeWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  outcomeBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  outcomeBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  outcomeText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '500',
  },
  activeOutcomeText: {
    fontWeight: 'bold',
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selfieHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 24,
  },
  photoLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  loadingContainer: {
    padding: 20,
  },
  spacer: {
    height: 100,
  }
});
