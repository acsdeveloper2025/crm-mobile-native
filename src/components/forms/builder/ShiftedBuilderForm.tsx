import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, ShiftedBuilderReportData, AddressLocatable, AddressRating, OfficeStatusOffice, DesignationShiftedOffice,
  PremisesStatusBusiness, SightStatus, TPCMetPerson, TPCConfirmation, LocalityTypeResiCumOffice, PoliticalConnection,
  DominatedArea, FeedbackFromNeighbour, FinalStatus, TaskStatus
} from '../../../types';
import { useTasks } from '../../../hooks/useTasks'
import { FormField, SelectField, TextAreaField, NumberDropdownField } from '../../FormControls';
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

interface ShiftedBuilderFormProps {
  taskData: VerificationTask;
}

const ShiftedBuilderForm: React.FC<ShiftedBuilderFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updateShiftedBuilderReport, toggleSaveTask , fetchTasks, updateTaskStatus } = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  
  const report = taskData.shiftedBuilderReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = (formData: any) => {
    if (!isReadOnly) {
      updateShiftedBuilderReport(taskData.id, formData);
    }
  };

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    updateShiftedBuilderReport,
    taskData.id,
    report || ({} as any),
    isReadOnly
  );

  const handleDataRestored = (data: any) => {
    if (!isReadOnly && data.formData) {
      updateShiftedBuilderReport(taskData.id, data.formData);
    }
  };

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: (keyof ShiftedBuilderReportData)[]) => fields.every(field => {
        const value = report[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields: (keyof ShiftedBuilderReportData)[] = [
        'addressLocatable', 'addressRating', 'officeStatus', 'locality', 'addressStructure', 'addressStructureColor',
        'doorColor', 'landmark1', 'landmark2', 'politicalConnection', 'dominatedArea', 'feedbackFromNeighbour',
        'otherObservation', 'finalStatus',
        'oldOfficeShiftedPeriod'
    ];
    if (!checkFields(baseFields)) return false;

    if (report.tpcMetPerson) {
        if (!report.nameOfTpc || report.nameOfTpc.trim() === '' || !report.tpcConfirmation1) return false;
    }
    if (report.tpcMetPerson2) {
        if (!report.nameOfTpc2 || report.nameOfTpc2.trim() === '' || !report.tpcConfirmation2) return false;
    }

    if (report.companyNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnBoard || report.nameOnBoard.trim() === '') return false;
    }

    if (report.officeStatus === OfficeStatusOffice.Opened) {
        const openedOnlyFields: (keyof ShiftedBuilderReportData)[] = [
            'metPerson', 'designation', 'premisesStatus', 'approxArea', 'companyNamePlateStatus'
        ];
        if (!checkFields(openedOnlyFields)) return false;

        if (report.premisesStatus !== PremisesStatusBusiness.Vacant) {
            if (!report.currentCompanyName || !report.currentCompanyPeriod) return false;
        }
    }
    
    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    if (isReadOnly) return;
    updateShiftedBuilderReport(taskData.id, { [name]: value });
  };
  
  const handleImagesChange = (images: any[]) => {
    updateShiftedBuilderReport(taskData.id, { images });
    handleAutoSaveImagesChange(images);
  };

  const handleSelfieImagesChange = (selfieImages: any[]) => {
    updateShiftedBuilderReport(taskData.id, { selfieImages });
    handleAutoSaveImagesChange(selfieImages);
  };

  const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
    <Picker.Item key={value} label={value} value={value} />
  ));

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    officeStatus: getEnumOptions(OfficeStatusOffice),
    designation: getEnumOptions(DesignationShiftedOffice),
    premisesStatus: getEnumOptions(PremisesStatusBusiness),
    sightStatus: getEnumOptions(SightStatus),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    tpcConfirmation: getEnumOptions(TPCConfirmation),
    localityType: getEnumOptions(LocalityTypeResiCumOffice),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus)
  }), []);

  if (!report) {
    return (
      <View style={styles.container}>
        <Text style={[{ color: theme.colors.danger }, styles.noDataText]}>No Shifted Builder report data available.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.BUILDER_SHIFTED}
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Shifted Builder Report</Text>

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
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Address Verification</Text>
          <SelectField label="Address Locatable" id="addressLocatable" name="addressLocatable" value={report.addressLocatable || ''} onValueChange={(val) => handleChange('addressLocatable', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.addressLocatable}
          </SelectField>
          <SelectField label="Address Rating" id="addressRating" name="addressRating" value={report.addressRating || ''} onValueChange={(val) => handleChange('addressRating', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.addressRating}
          </SelectField>
          <SelectField label="Office Status" id="officeStatus" name="officeStatus" value={report.officeStatus || ''} onValueChange={(val) => handleChange('officeStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.officeStatus}
          </SelectField>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Business Details</Text>
          <FormField label="Old Office Shifted Period" id="oldOfficeShiftedPeriod" name="oldOfficeShiftedPeriod" value={report.oldOfficeShiftedPeriod} onChangeText={(val) => handleChange('oldOfficeShiftedPeriod', val)} placeholder="e.g., 6 months ago" disabled={isReadOnly} />
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Third Party Confirmation</Text>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 1</Text>
            <SelectField label="TPC Met Person 1" id="tpcMetPerson" name="tpcMetPerson" value={report.tpcMetPerson || ''} onValueChange={(val) => handleChange('tpcMetPerson', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name of TPC 1" id="nameOfTpc" name="nameOfTpc" value={report.nameOfTpc} onChangeText={(val) => handleChange('nameOfTpc', val)} disabled={isReadOnly} />
            <SelectField label="TPC Confirmation 1" id="tpcConfirmation1" name="tpcConfirmation1" value={report.tpcConfirmation1 || ''} onValueChange={(val) => handleChange('tpcConfirmation1', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcConfirmation}
            </SelectField>
          </View>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 2</Text>
            <SelectField label="TPC Met Person 2" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name of TPC 2" id="nameOfTpc2" name="nameOfTpc2" value={report.nameOfTpc2} onChangeText={(val) => handleChange('nameOfTpc2', val)} disabled={isReadOnly} />
            <SelectField label="TPC Confirmation 2" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcConfirmation}
            </SelectField>
          </View>
        </View>

        {report.officeStatus === OfficeStatusOffice.Opened && (
          <View style={[styles.section, styles.highlightedSection]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Additional Details (Office Open)</Text>
            <FormField label="Met Person" id="metPerson" name="metPerson" value={report.metPerson} onChangeText={(val) => handleChange('metPerson', val)} disabled={isReadOnly} />
            <SelectField label="Designation" id="designation" name="designation" value={report.designation || ''} onValueChange={(val) => handleChange('designation', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.designation}
            </SelectField>
            <SelectField label="Premises Status" id="premisesStatus" name="premisesStatus" value={report.premisesStatus || ''} onValueChange={(val) => handleChange('premisesStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.premisesStatus}
            </SelectField>

            {report.premisesStatus !== PremisesStatusBusiness.Vacant && (
              <>
                <FormField label="Current Company Name" id="currentCompanyName" name="currentCompanyName" value={report.currentCompanyName} onChangeText={(val) => handleChange('currentCompanyName', val)} disabled={isReadOnly} />
                <FormField label="Current Company Period" id="currentCompanyPeriod" name="currentCompanyPeriod" value={report.currentCompanyPeriod} onChangeText={(val) => handleChange('currentCompanyPeriod', val)} placeholder="e.g., 2 years" disabled={isReadOnly} />
              </>
            )}

            <NumberDropdownField label="Approx Area (Sq. Feet)" id="approxArea" name="approxArea" value={report.approxArea || ''} onChange={(val: any) => handleChange('approxArea', val)} min={1} max={100000} disabled={isReadOnly} />

            <SelectField label="Company Name Plate" id="companyNamePlateStatus" name="companyNamePlateStatus" value={report.companyNamePlateStatus || ''} onValueChange={(val) => handleChange('companyNamePlateStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.sightStatus}
            </SelectField>
            {report.companyNamePlateStatus === SightStatus.Sighted && (
              <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly} />
            )}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Property Details</Text>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.localityType}
          </SelectField>
          <NumberDropdownField label="Address Structure (Floors)" id="addressStructure" name="addressStructure" value={report.addressStructure || ''} onChange={(val: any) => handleChange('addressStructure', val)} min={1} max={300} disabled={isReadOnly} />
          <FormField label="Address Structure Color" id="addressStructureColor" name="addressStructureColor" value={report.addressStructureColor} onChangeText={(val) => handleChange('addressStructureColor', val)} disabled={isReadOnly} />
          <FormField label="Door Color" id="doorColor" name="doorColor" value={report.doorColor} onChangeText={(val) => handleChange('doorColor', val)} disabled={isReadOnly} />
          <FormField label="Landmark 1" id="landmark1" name="landmark1" value={report.landmark1} onChangeText={(val) => handleChange('landmark1', val)} disabled={isReadOnly} />
          <FormField label="Landmark 2" id="landmark2" name="landmark2" value={report.landmark2} onChangeText={(val) => handleChange('landmark2', val)} disabled={isReadOnly} />
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Area Assessment</Text>
          <SelectField label="Political Connection" id="politicalConnection" name="politicalConnection" value={report.politicalConnection || ''} onValueChange={(val) => handleChange('politicalConnection', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.politicalConnection}
          </SelectField>
          <SelectField label="Dominated Area" id="dominatedArea" name="dominatedArea" value={report.dominatedArea || ''} onValueChange={(val) => handleChange('dominatedArea', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.dominatedArea}
          </SelectField>
          <SelectField label="Feedback from Neighbour" id="feedbackFromNeighbour" name="feedbackFromNeighbour" value={report.feedbackFromNeighbour || ''} onValueChange={(val) => handleChange('feedbackFromNeighbour', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.feedbackFromNeighbour}
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

                  const result = await VerificationFormService.submitBuilderVerification(
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
  subSection: {
    marginBottom: 16,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 8,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    opacity: 0.7,
  },
  spacer20: { height: 20 },
  spacer100: { height: 100 },
  highlightedSection: { borderWidth: 2 },
  noDataText: { padding: 20 }
});

export default ShiftedBuilderForm;