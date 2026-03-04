import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, UntraceableOfficeReportData, OfficeStatusOffice, AddressLocatable, AddressRating,
  LocalityTypeResiCumOffice, DominatedArea, FeedbackFromNeighbour, FinalStatus, TaskStatus,
  CallRemarkUntraceable
} from '../../../types';
import { useTasks } from '../../../hooks/useTasks'
import { FormField, SelectField, TextAreaField } from '../../FormControls';
import ConfirmationModal from '../../ConfirmationModal';
import ImageCapture from '../../ImageCapture';
import SelfieCapture from '../../SelfieCapture';
import PermissionStatus from '../../PermissionStatus';
import AutoSaveFormWrapper from '../../AutoSaveFormWrapper';
import { FORM_TYPES } from '../../../constants/formTypes';
import VerificationFormService from '../../../services/verificationFormService';
import { handleSuccessfulSubmission } from '../../../utils/formSubmissionHelpers';
import { useTheme } from '../../../context/ThemeContext';
import {
  createAutoSaveImagesChangeHandler,
  combineImagesForAutoSave,
} from '../../../utils/imageAutoSaveHelpers';

interface UntraceableOfficeFormProps {
  taskData: VerificationTask;
}

const UntraceableOfficeForm: React.FC<UntraceableOfficeFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updateUntraceableOfficeReport, toggleSaveTask , fetchTasks, updateTaskStatus } = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  
  const report = taskData.untraceableOfficeReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = (formData: any) => {
    if (!isReadOnly) {
      updateUntraceableOfficeReport(taskData.id, formData);
    }
  };

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    updateUntraceableOfficeReport,
    taskData.id,
    report || ({} as any),
    isReadOnly
  );

  const handleDataRestored = (data: any) => {
    if (!isReadOnly && data.formData) {
      updateUntraceableOfficeReport(taskData.id, data.formData);
    }
  };

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: (keyof UntraceableOfficeReportData)[]) => fields.every(field => {
        const value = report[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields: (keyof UntraceableOfficeReportData)[] = [
        'metPerson', 'callRemark', 'locality', 'landmark1', 'landmark2', 'landmark3', 'landmark4',
        'dominatedArea', 'otherObservation', 'finalStatus'
    ];
    if (!checkFields(baseFields)) return false;

    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    if (isReadOnly) return;
    updateUntraceableOfficeReport(taskData.id, { [name]: value });
  };
  
  const handleImagesChange = (images: any[]) => {
    updateUntraceableOfficeReport(taskData.id, { images });
    handleAutoSaveImagesChange(images);
  };

  const handleSelfieImagesChange = (selfieImages: any[]) => {
    updateUntraceableOfficeReport(taskData.id, { selfieImages });
    handleAutoSaveImagesChange(selfieImages);
  };

  const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
    <Picker.Item key={value} label={value} value={value} />
  ));

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    officeStatus: getEnumOptions(OfficeStatusOffice),
    localityType: getEnumOptions(LocalityTypeResiCumOffice),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus),
    callRemark: getEnumOptions(CallRemarkUntraceable)
  }), []);

  if (!report) {
    return (
      <View style={styles.container}>
        <Text style={[{ color: theme.colors.danger }, styles.noDataText]}>No Untraceable Office report data available.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.OFFICE_UNTRACEABLE}
      formData={report}
      images={combineImagesForAutoSave(report)}
      onFormDataChange={handleFormDataChange}
      onImagesChange={handleAutoSaveImagesChange}
      onDataRestored={handleDataRestored}
      autoSaveOptions={{
        enableAutoSave: !isReadOnly,
        showIndicator: !isReadOnly,
        debounceMs: 500,
      }}>
      <ScrollView style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Untraceable Office Report</Text>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Customer Information</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.infoLabel}>Customer Name</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>{taskData.customer.name}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.infoLabel}>Bank Name</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>{typeof taskData.client === 'object' ? taskData.client?.name : taskData.client || taskData.clientName || 'N/A'}</Text>
            </View>
            <View style={styles.gridItemFull}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>{taskData.addressStreet || taskData.visitAddress || taskData.address || 'N/A'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Verification Details</Text>
          <FormField label="Met Person" id="metPerson" name="metPerson" value={report.metPerson} onChangeText={(val) => handleChange('metPerson', val)} disabled={isReadOnly} />
          <SelectField label="Call Remark" id="callRemark" name="callRemark" value={report.callRemark || ''} onValueChange={(val) => handleChange('callRemark', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.callRemark}
          </SelectField>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.localityType}
          </SelectField>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Property Details</Text>
          <FormField label="Landmark 1" id="landmark1" name="landmark1" value={report.landmark1} onChangeText={(val) => handleChange('landmark1', val)} disabled={isReadOnly} />
          <FormField label="Landmark 2" id="landmark2" name="landmark2" value={report.landmark2} onChangeText={(val) => handleChange('landmark2', val)} disabled={isReadOnly} />
          <FormField label="Landmark 3" id="landmark3" name="landmark3" value={report.landmark3} onChangeText={(val) => handleChange('landmark3', val)} disabled={isReadOnly} />
          <FormField label="Landmark 4" id="landmark4" name="landmark4" value={report.landmark4} onChangeText={(val) => handleChange('landmark4', val)} disabled={isReadOnly} />
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Area Assessment</Text>
          <SelectField label="Dominated Area" id="dominatedArea" name="dominatedArea" value={report.dominatedArea || ''} onValueChange={(val) => handleChange('dominatedArea', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.dominatedArea}
          </SelectField>
          <TextAreaField label="Other Observation" id="otherObservation" name="otherObservation" value={report.otherObservation} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Final Status</Text>
          <SelectField label="Final Status" id="finalStatus" name="finalStatus" value={report.finalStatus || ''} onValueChange={(val) => handleChange('finalStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.finalStatus}
          </SelectField>
          {report.finalStatus === FinalStatus.Hold && (
            <FormField label="Reason for Hold" id="holdReason" name="holdReason" value={report.holdReason} onChangeText={(val) => handleChange('holdReason', val)} disabled={isReadOnly} />
          )}
        </View>

        <PermissionStatus showOnlyDenied={true} />

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Photos & Evidence</Text>
          <ImageCapture
            taskId={taskData.verificationTaskId || taskData.id}
            images={report.images}
            onImagesChange={handleImagesChange}
            isReadOnly={isReadOnly}
            minImages={MIN_IMAGES}
            compact={true}
          />
          <View style={styles.spacer20} />
          <SelfieCapture
            taskId={taskData.verificationTaskId || taskData.id}
            images={report.selfieImages || []}
            onImagesChange={handleSelfieImagesChange}
            isReadOnly={isReadOnly}
            required={true}
            title="🤳 Verification Selfie (Required)"
            compact={true}
          />
        </View>

        {!isReadOnly && taskData.status === TaskStatus.InProgress && (
          <View style={styles.footer}>
            <TouchableOpacity 
              style={[
                styles.submitButton, 
                { backgroundColor: isFormValid ? theme.colors.primary : theme.colors.textMuted }
              ]}
              onPress={() => setIsConfirmModalOpen(true)}
              disabled={!isFormValid || isSubmitting}>
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting...' : 'Submit Verification'}
              </Text>
            </TouchableOpacity>
            
            {!isFormValid && (
              <Text style={styles.validationText}>
                Please fill all required fields and capture at least {MIN_IMAGES} photos to submit.
              </Text>
            )}
            
            {submissionSuccess && (
              <Text style={styles.successText}>✅ Case submitted successfully! Redirecting...</Text>
            )}
            
            {submissionError && (
              <Text style={styles.errorText}>{submissionError}</Text>
            )}
          </View>
        )}

        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setIsConfirmModalOpen(false);
            setSubmissionError(null);
          }}
          onSave={() => {
            toggleSaveTask(taskData.id, true);
            setIsConfirmModalOpen(false);
          }}
          onConfirm={async () => {
              setIsSubmitting(true);
              setSubmissionError(null);

              try {
                  const formData = {
                      remarks: report.otherObservation || '',
                      ...report,
                      outcome: taskData.verificationOutcome
                  };

                  const allImages = [...(report.images || []), ...(report.selfieImages || [])];
                  const geoLocation = report.images?.[0]?.geoLocation ? {
                      latitude: report.images[0].geoLocation.latitude,
                      longitude: report.images[0].geoLocation.longitude,
                      accuracy: report.images[0].geoLocation.accuracy
                  } : undefined;

                  const result = await VerificationFormService.submitOfficeVerification(
                      taskData.id,
                      taskData.verificationTaskId!,
                      formData,
                      allImages,
                      geoLocation
                  );

                  if (result.success) {
                      if ((globalThis as any).markAutoSaveFormCompleted) {
                          (globalThis as any).markAutoSaveFormCompleted();
                      }
                      setIsConfirmModalOpen(false);
                      await handleSuccessfulSubmission(
                          taskData.id,
                          fetchTasks,
                          navigation.navigate as any,
                          setSubmissionSuccess,
                          updateTaskStatus
                      );
                  } else {
                      setSubmissionError(result.error || 'Failed to submit verification form');
                  }
              } catch (error) {
                  setSubmissionError(error instanceof Error ? error.message : 'Unknown error occurred');
              } finally {
                  setIsSubmitting(false);
              }
          }}
          title="Submit or Save Task"
          confirmText={isSubmitting ? "Submitting..." : "Submit Task"}
          saveText="Save for Offline">
          <View>
            <Text style={{ color: theme.colors.textSecondary }}>
              You can submit the task to mark it as complete, or save it for offline access if you have a poor internet connection.
            </Text>
          </View>
        </ConfirmationModal>
        
        <View style={styles.spacer100} />
      </ScrollView>
    </AutoSaveFormWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  gridItemFull: {
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    marginTop: 10,
    marginBottom: 40,
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  validationText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  successText: {
    color: '#2e7d32',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  spacer20: { height: 20 },
  spacer100: { height: 100 },
  noDataText: { padding: 20 }
});

export default UntraceableOfficeForm;