import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, ShiftedResidenceReportData, AddressLocatable, AddressRating, RoomStatusShifted, MetPersonStatusShifted,
  TPCMetPerson, PremisesStatus, LocalityType, SightStatus, PoliticalConnection, DominatedArea,
  FeedbackFromNeighbour, FinalStatus, TaskStatus
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
  createImageChangeHandler,
  createSelfieImageChangeHandler,
  createAutoSaveImagesChangeHandler,
  combineImagesForAutoSave,
  createFormDataChangeHandler,
  createDataRestoredHandler
} from '../../../utils/imageAutoSaveHelpers';

interface ShiftedResidenceFormProps {
  taskData: VerificationTask;
}

const ShiftedResidenceForm: React.FC<ShiftedResidenceFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updateShiftedResidenceReport, toggleSaveTask, fetchTasks , updateTaskStatus} = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  
  const report = taskData.shiftedResidenceReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = createFormDataChangeHandler(
    updateShiftedResidenceReport,
    taskData.id,
    isReadOnly
  );

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    updateShiftedResidenceReport,
    taskData.id,
    report || ({} as any),
    isReadOnly
  );

  const handleDataRestored = createDataRestoredHandler(
    updateShiftedResidenceReport,
    taskData.id,
    isReadOnly
  );

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: (keyof ShiftedResidenceReportData)[]) => fields.every(field => {
        const value = report[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields: (keyof ShiftedResidenceReportData)[] = [
        'addressLocatable', 'addressRating', 'roomStatus',
        'locality', 'addressStructure', 'addressFloor', 'addressStructureColor', 'doorColor',
        'doorNamePlateStatus', 'societyNamePlateStatus', 'landmark1', 'landmark2',
        'politicalConnection', 'dominatedArea', 'feedbackFromNeighbour', 'otherObservation', 'finalStatus',
        'shiftedPeriod'
    ];

    if (!checkFields(baseFields)) return false;

    if (report.tpcMetPerson1) {
        if (!report.tpcName1 || report.tpcName1.trim() === '') return false;
    }
    if (report.tpcMetPerson2) {
        if (!report.tpcName2 || report.tpcName2.trim() === '') return false;
    }

    if (report.roomStatus === RoomStatusShifted.Opened) {
        const openedFields: (keyof ShiftedResidenceReportData)[] = [
            'metPersonName', 'metPersonStatus'
        ];
        if (!checkFields(openedFields)) return false;
    }

    if (report.roomStatus === RoomStatusShifted.Closed) {
        if (!report.premisesStatus) return false;
    }
    
    if (report.doorNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnDoorPlate || report.nameOnDoorPlate.trim() === '') return false;
    }

    if (report.societyNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnSocietyBoard || report.nameOnSocietyBoard.trim() === '') return false;
    }

    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    let processedValue: string | null = value;
    
    if (value === '') {
        processedValue = null;
    }

    updateShiftedResidenceReport(taskData.id, { [name]: processedValue });
  };

  const handleImagesChange = createImageChangeHandler(
    updateShiftedResidenceReport,
    taskData.id,
    report || ({} as any),
    handleAutoSaveImagesChange
  );

  const handleSelfieImagesChange = createSelfieImageChangeHandler(
    updateShiftedResidenceReport,
    taskData.id,
    report || ({} as any),
    handleAutoSaveImagesChange
  );

  const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
    <Picker.Item key={value} label={value} value={value} />
  ));

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    roomStatus: getEnumOptions(RoomStatusShifted),
    metPersonStatus: getEnumOptions(MetPersonStatusShifted),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    premisesStatus: getEnumOptions(PremisesStatus),
    localityType: getEnumOptions(LocalityType),
    sightStatus: getEnumOptions(SightStatus),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus)}), []);

  if (!report) {
    return (
      <View style={styles.container}>
        <Text style={[{ color: theme.colors.danger }, styles.noDataText]}>No Shifted Residence report data available.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.RESIDENCE_SHIFTED}
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Shifted Residence Report</Text>

        {/* Customer Information Section */}
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
            <View style={styles.gridItem}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>{taskData.addressStreet || taskData.visitAddress || taskData.address || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Address Verification Section */}
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
          <SelectField label="Room Status" id="roomStatus" name="roomStatus" value={report.roomStatus || ''} onValueChange={(val) => handleChange('roomStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.roomStatus}
          </SelectField>
        </View>

        {/* Operational Details Section */}
        {report.roomStatus === RoomStatusShifted.Opened && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Operational Details</Text>
            <FormField label="Met Person" id="metPersonName" name="metPersonName" value={report.metPersonName} onChangeText={(val) => handleChange('metPersonName', val)} disabled={isReadOnly} />
            <SelectField label="Met Person Status" id="metPersonStatus" name="metPersonStatus" value={report.metPersonStatus || ''} onValueChange={(val) => handleChange('metPersonStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.metPersonStatus}
            </SelectField>
          </View>
        )}

        {/* Premises Details Section - Only show if room is closed */}
        {report.roomStatus === RoomStatusShifted.Closed && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Premises Details</Text>
            <SelectField label="Premises Status" id="premisesStatus" name="premisesStatus" value={report.premisesStatus || ''} onValueChange={(val) => handleChange('premisesStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.premisesStatus}
            </SelectField>
          </View>
        )}

        {/* Additional Details Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Additional Details</Text>
          <FormField label="Shifted Period" id="shiftedPeriod" name="shiftedPeriod" value={report.shiftedPeriod} onChangeText={(val) => handleChange('shiftedPeriod', val)} placeholder="e.g., 6 months ago" disabled={isReadOnly} />
          
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 1</Text>
            <SelectField label="Met Person" id="tpcMetPerson1" name="tpcMetPerson1" value={report.tpcMetPerson1 || ''} onValueChange={(val) => handleChange('tpcMetPerson1', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name" id="tpcName1" name="tpcName1" value={report.tpcName1} onChangeText={(val) => handleChange('tpcName1', val)} disabled={isReadOnly} />
          </View>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 2</Text>
            <SelectField label="Met Person" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name" id="tpcName2" name="tpcName2" value={report.tpcName2} onChangeText={(val) => handleChange('tpcName2', val)} disabled={isReadOnly} />
          </View>
        </View>

        {/* Property & Area Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Property & Area assessment</Text>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.localityType}
          </SelectField>
          <NumberDropdownField label="Structure (Floors)" id="addressStructure" name="addressStructure" value={report.addressStructure || ''} onChange={(val) => handleChange('addressStructure', val)} min={1} max={300} disabled={isReadOnly} />
          <NumberDropdownField label="Base Floor" id="addressFloor" name="addressFloor" value={report.addressFloor || ''} onChange={(val) => handleChange('addressFloor', val)} min={1} max={300} disabled={isReadOnly} />
          <FormField label="Structure Color" id="addressStructureColor" name="addressStructureColor" value={report.addressStructureColor} onChangeText={(val) => handleChange('addressStructureColor', val)} disabled={isReadOnly} />
          <FormField label="Door Color" id="doorColor" name="doorColor" value={report.doorColor} onChangeText={(val) => handleChange('doorColor', val)} disabled={isReadOnly} />
          
          <SelectField label="Door Plate Status" id="doorNamePlateStatus" name="doorNamePlateStatus" value={report.doorNamePlateStatus || ''} onValueChange={(val) => handleChange('doorNamePlateStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          {report.doorNamePlateStatus === SightStatus.Sighted && (
            <FormField label="Name on Door Plate" id="nameOnDoorPlate" name="nameOnDoorPlate" value={report.nameOnDoorPlate} onChangeText={(val) => handleChange('nameOnDoorPlate', val)} disabled={isReadOnly}  />
          )}
          <SelectField label="Society Plate" id="societyNamePlateStatus" name="societyNamePlateStatus" value={report.societyNamePlateStatus || ''} onValueChange={(val) => handleChange('societyNamePlateStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          {report.societyNamePlateStatus === SightStatus.Sighted && (
            <FormField label="Name on Society Board" id="nameOnSocietyBoard" name="nameOnSocietyBoard" value={report.nameOnSocietyBoard} onChangeText={(val) => handleChange('nameOnSocietyBoard', val)} disabled={isReadOnly}  />
          )}

          <FormField label="Landmark 1" id="landmark1" name="landmark1" value={report.landmark1} onChangeText={(val) => handleChange('landmark1', val)} disabled={isReadOnly} />
          <FormField label="Landmark 2" id="landmark2" name="landmark2" value={report.landmark2} onChangeText={(val) => handleChange('landmark2', val)} disabled={isReadOnly} />
          
          <SelectField label="Political Connection" id="politicalConnection" name="politicalConnection" value={report.politicalConnection || ''} onValueChange={(val) => handleChange('politicalConnection', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.politicalConnection}
          </SelectField>
          <SelectField label="Dominated Area" id="dominatedArea" name="dominatedArea" value={report.dominatedArea || ''} onValueChange={(val) => handleChange('dominatedArea', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.dominatedArea}
          </SelectField>
          <SelectField label="Neighbour Feedback" id="feedbackFromNeighbour" name="feedbackFromNeighbour" value={report.feedbackFromNeighbour || ''} onValueChange={(val) => handleChange('feedbackFromNeighbour', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.feedbackFromNeighbour}
          </SelectField>
          <TextAreaField label="Other Observation" id="otherObservation" name="otherObservation" value={report.otherObservation} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
        </View>

        {/* Final Status Section */}
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
                      ...report,
                      outcome: taskData.verificationOutcome
                  };

                  const allImages = [...(report.images || []), ...(report.selfieImages || [])];
                  const geoLocation = report.images?.[0]?.geoLocation ? {
                      latitude: report.images[0].geoLocation.latitude,
                      longitude: report.images[0].geoLocation.longitude,
                      accuracy: report.images[0].geoLocation.accuracy
                  } : undefined;

                  const result = await VerificationFormService.submitResidenceVerification(
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  gridItem: {
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

export default ShiftedResidenceForm;