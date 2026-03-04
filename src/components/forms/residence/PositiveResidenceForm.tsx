import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, ResidenceReportData, AddressLocatable, AddressRating, HouseStatus, Relation,
  WorkingStatus, StayingStatus, DocumentShownStatus, DocumentType, TPCMetPerson, TPCConfirmation,
  LocalityType, SightStatus, PoliticalConnection, DominatedArea, FeedbackFromNeighbour,
  FinalStatus, TaskStatus
} from '../../../types';
import { useTasks } from '../../../hooks/useTasks'
import { FormField, SelectField, TextAreaField, NumberDropdownField } from '../../FormControls';
import ConfirmationModal from '../../ConfirmationModal';
import ImageCapture from '../../ImageCapture';
import SelfieCapture from '../../SelfieCapture';
import ReadOnlyIndicator from '../../ReadOnlyIndicator';
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

interface PositiveResidenceFormProps {
  taskData: VerificationTask;
}

const PositiveResidenceForm: React.FC<PositiveResidenceFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updateResidenceReport, toggleSaveTask, fetchTasks, updateTaskStatus } = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [_submissionSuccess, setSubmissionSuccess] = useState(false);
  const report = taskData.residenceReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = createFormDataChangeHandler(updateResidenceReport, taskData.id, isReadOnly);
  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(updateResidenceReport, taskData.id, report || ({} as any), isReadOnly);
  const handleDataRestored = createDataRestoredHandler(updateResidenceReport, taskData.id, isReadOnly);

  const checkFields = (fields: (keyof ResidenceReportData)[], data: ResidenceReportData) => fields.every(field => {
    const value = data[field];
    return value !== null && value !== undefined && value !== '';
  });

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const baseFields: (keyof ResidenceReportData)[] = [
        'addressLocatable', 'addressRating', 'houseStatus',
        'locality', 'addressStructure', 'applicantStayingFloor', 'addressStructureColor', 'doorColor',
        'doorNamePlateStatus', 'societyNamePlateStatus', 'landmark1', 'landmark2',
        'politicalConnection', 'dominatedArea', 'feedbackFromNeighbour', 'otherObservation', 'finalStatus',
        'stayingPeriod', 'stayingStatus'
    ];

    if (!checkFields(baseFields, report)) return false;

    if (report.tpcMetPerson1) {
        if (!report.tpcName1 || report.tpcName1.trim() === '' || !report.tpcConfirmation1) return false;
    }
    if (report.tpcMetPerson2) {
        if (!report.tpcName2 || report.tpcName2.trim() === '' || !report.tpcConfirmation2) return false;
    }

    if (report.houseStatus === HouseStatus.Opened) {
        const openedFields: (keyof ResidenceReportData)[] = [
            'metPersonName', 'metPersonRelation', 'totalFamilyMembers', 'totalEarning',
            'approxArea', 'documentShownStatus'
        ];
        if (!checkFields(openedFields, report)) return false;

        if (report.workingStatus && report.workingStatus !== WorkingStatus.HouseWife) {
            if (!report.companyName || report.companyName.trim() === '') return false;
        }

        if (report.documentShownStatus === DocumentShownStatus.Showed && !report.documentType) return false;
    }

    if (report.doorNamePlateStatus === SightStatus.Sighted && (!report.nameOnDoorPlate || report.nameOnDoorPlate.trim() === '')) return false;
    if (report.societyNamePlateStatus === SightStatus.Sighted && (!report.nameOnSocietyBoard || report.nameOnSocietyBoard.trim() === '')) return false;
    if (report.finalStatus === FinalStatus.Hold && (!report.holdReason || report.holdReason.trim() === '')) return false;

    return true;
  }, [report, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    let processedValue: any = value;
    
    if (value === '') {
        processedValue = null;
    } else if (['totalFamilyMembers', 'totalEarning', 'approxArea', 'addressStructure'].includes(name)) {
        processedValue = Number(value);
    }

    updateResidenceReport(taskData.id, { [name]: processedValue });
  };
  
  const handleImagesChange = createImageChangeHandler(updateResidenceReport, taskData.id, report || ({} as any), handleAutoSaveImagesChange);
  const handleSelfieImagesChange = createSelfieImageChangeHandler(updateResidenceReport, taskData.id, report || ({} as any), handleAutoSaveImagesChange);

  const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
    <Picker.Item key={value} label={value} value={value} />
  ));

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    houseStatus: getEnumOptions(HouseStatus),
    relation: getEnumOptions(Relation),
    workingStatus: getEnumOptions(WorkingStatus),
    stayingStatus: getEnumOptions(StayingStatus),
    documentShownStatus: getEnumOptions(DocumentShownStatus),
    documentType: getEnumOptions(DocumentType),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    tpcConfirmation: getEnumOptions(TPCConfirmation),
    localityType: getEnumOptions(LocalityType),
    sightStatus: getEnumOptions(SightStatus),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus)}), []);

  if (!report) {
    return (
      <View style={styles.centerContainer}>
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>No residence report data available for this case.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.RESIDENCE_POSITIVE}
      formData={report}
      images={combineImagesForAutoSave(report)}
      onFormDataChange={handleFormDataChange}
      onImagesChange={handleAutoSaveImagesChange}
      onDataRestored={handleDataRestored}
      autoSaveOptions={{ enableAutoSave: !isReadOnly, showIndicator: !isReadOnly, debounceMs: 500 }}>
      <ScrollView style={styles.container}>
        <Text style={[styles.header, { color: theme.colors.text }]}>Positive Residence Report</Text>
        <ReadOnlyIndicator isReadOnly={isReadOnly} caseStatus={taskData.status as any} isSaved={taskData.isSaved} />

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Customer Information</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Name: {taskData.customer.name}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Address: {taskData.addressStreet || taskData.visitAddress || taskData.address || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Bank Name: {typeof taskData.client === 'object' ? taskData.client?.name : taskData.client || taskData.clientName || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Product: {typeof taskData.product === 'object' ? taskData.product?.name : taskData.product || taskData.productName || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Trigger: {taskData.notes || taskData.trigger || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>System Contact: {taskData.systemContactNumber || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Customer Code: {taskData.customerCallingCode || 'N/A'}</Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>Applicant Status: {taskData.applicantStatus || 'N/A'}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Address Verification</Text>
          <SelectField label="Locatable" id="addressLocatable" name="addressLocatable" value={report.addressLocatable || ''} onValueChange={(val) => handleChange('addressLocatable', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.addressLocatable}
          </SelectField>
          <SelectField label="Rating" id="addressRating" name="addressRating" value={report.addressRating || ''} onValueChange={(val) => handleChange('addressRating', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.addressRating}
          </SelectField>
          <SelectField label="House Status" id="houseStatus" name="houseStatus" value={report.houseStatus || ''} onValueChange={(val) => handleChange('houseStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.houseStatus}
          </SelectField>
        </View>

        {report.houseStatus === HouseStatus.Opened && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Personal Details</Text>
            <FormField label="Met Person Name" id="metPersonName" name="metPersonName" value={report.metPersonName} onChangeText={(val) => handleChange('metPersonName', val)} disabled={isReadOnly} />
            <SelectField label="Relation" id="metPersonRelation" name="metPersonRelation" value={report.metPersonRelation || ''} onValueChange={(val) => handleChange('metPersonRelation', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.relation}
            </SelectField>
            <NumberDropdownField label="Family Members" id="totalFamilyMembers" name="totalFamilyMembers" value={report.totalFamilyMembers || ''} onChange={(val) => handleChange('totalFamilyMembers', val)} min={1} max={20} disabled={isReadOnly} />
            <NumberDropdownField label="Total Earning" id="totalEarning" name="totalEarning" value={report.totalEarning || ''} onChange={(val) => handleChange('totalEarning', val)} min={1} max={500} disabled={isReadOnly} />
            <SelectField label="Working Status" id="workingStatus" name="workingStatus" value={report.workingStatus || ''} onValueChange={(val) => handleChange('workingStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.workingStatus}
            </SelectField>
            {report.workingStatus && report.workingStatus !== WorkingStatus.HouseWife && (
              <FormField label="Company Name" id="companyName" name="companyName" value={report.companyName} onChangeText={(val) => handleChange('companyName', val)} disabled={isReadOnly} />
            )}
            <FormField label="Approx Area (Sq Ft)" id="approxArea" name="approxArea" value={report.approxArea} type="number" onChangeText={(val) => handleChange('approxArea', val)} disabled={isReadOnly} />
            <SelectField label="Document Shown" id="documentShownStatus" name="documentShownStatus" value={report.documentShownStatus || ''} onValueChange={(val) => handleChange('documentShownStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.documentShownStatus}
            </SelectField>
            {report.documentShownStatus === DocumentShownStatus.Showed && (
              <SelectField label="Document Type" id="documentType" name="documentType" value={report.documentType || ''} onValueChange={(val) => handleChange('documentType', val)} disabled={isReadOnly}>
                <Picker.Item label="Select..." value="" />
                {options.documentType}
              </SelectField>
            )}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Staying Details</Text>
          <FormField label="Staying Period" id="stayingPeriod" name="stayingPeriod" value={report.stayingPeriod} onChangeText={(val) => handleChange('stayingPeriod', val)} disabled={isReadOnly} />
          <SelectField label="Staying Status" id="stayingStatus" name="stayingStatus" value={report.stayingStatus || ''} onValueChange={(val) => handleChange('stayingStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.stayingStatus}
          </SelectField>

          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Third Party Confirmation</Text>
          <SelectField label="TPC Met Person 1" id="tpcMetPerson1" name="tpcMetPerson1" value={report.tpcMetPerson1 || ''} onValueChange={(val) => handleChange('tpcMetPerson1', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.tpcMetPerson}
          </SelectField>
          <FormField label="Name of TPC 1" id="tpcName1" name="tpcName1" value={report.tpcName1} onChangeText={(val) => handleChange('tpcName1', val)} disabled={isReadOnly} />
          <SelectField label="TPC Confirmation 1" id="tpcConfirmation1" name="tpcConfirmation1" value={report.tpcConfirmation1 || ''} onValueChange={(val) => handleChange('tpcConfirmation1', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.tpcConfirmation}
          </SelectField>

          <SelectField label="TPC Met Person 2" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.tpcMetPerson}
          </SelectField>
          <FormField label="Name of TPC 2" id="tpcName2" name="tpcName2" value={report.tpcName2} onChangeText={(val) => handleChange('tpcName2', val)} disabled={isReadOnly} />
          <SelectField label="TPC Confirmation 2" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.tpcConfirmation}
          </SelectField>
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Property Assessment</Text>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.localityType}
          </SelectField>
          <NumberDropdownField label="Address Structure (Floors)" id="addressStructure" name="addressStructure" value={report.addressStructure || ''} onChange={(val) => handleChange('addressStructure', val)} min={1} max={50} disabled={isReadOnly} />
          <FormField label="Staying Floor" id="applicantStayingFloor" name="applicantStayingFloor" value={report.applicantStayingFloor} onChangeText={(val) => handleChange('applicantStayingFloor', val)} disabled={isReadOnly} />
          <FormField label="Structure Color" id="addressStructureColor" name="addressStructureColor" value={report.addressStructureColor} onChangeText={(val) => handleChange('addressStructureColor', val)} disabled={isReadOnly} />
          <FormField label="Door Color" id="doorColor" name="doorColor" value={report.doorColor} onChangeText={(val) => handleChange('doorColor', val)} disabled={isReadOnly} />
          <SelectField label="Door Plate Status" id="doorNamePlateStatus" name="doorNamePlateStatus" value={report.doorNamePlateStatus || ''} onValueChange={(val) => handleChange('doorNamePlateStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          {report.doorNamePlateStatus === SightStatus.Sighted && (
            <FormField label="Name on Door Plate" id="nameOnDoorPlate" name="nameOnDoorPlate" value={report.nameOnDoorPlate} onChangeText={(val) => handleChange('nameOnDoorPlate', val)} disabled={isReadOnly} />
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Additional Observation</Text>
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
          <TextAreaField label="Other Observations" id="otherObservation" name="otherObservation" value={report.otherObservation} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
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

        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <ImageCapture taskId={taskData.id} images={report.images} onImagesChange={handleImagesChange} isReadOnly={isReadOnly} minImages={MIN_IMAGES} />
          <View style={styles.spacer20} />
          <SelfieCapture taskId={taskData.id} images={report.selfieImages || []} onImagesChange={handleSelfieImagesChange} isReadOnly={isReadOnly} required={true} />
        </View>

        {!isReadOnly && taskData.status === TaskStatus.InProgress && (
          <TouchableOpacity 
            style={[styles.submitBtn, !isFormValid && styles.disabledBtn]} 
            onPress={() => setIsConfirmModalOpen(true)} 
            disabled={!isFormValid || isSubmitting}>
            <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Report'}</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.spacer100} />
      </ScrollView>

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onSave={() => {
          toggleSaveTask(taskData.id, true);
          setIsConfirmModalOpen(false);
          Alert.alert('Success', 'Task saved offline successfully.');
        }}
        onConfirm={async () => {
          setIsSubmitting(true);
          try {
            const formData = { ...report, outcome: taskData.verificationOutcome };
            const allImages = [...(report.images || []), ...(report.selfieImages || [])];
            const result = await VerificationFormService.submitResidenceVerification(taskData.id, taskData.verificationTaskId!, formData, allImages);
            if (result.success) {
              await handleSuccessfulSubmission(taskData.id, fetchTasks, navigation.navigate, setSubmissionSuccess, updateTaskStatus);
            } else {
              setSubmissionError(result.error || 'Submission failed');
            }
          } catch (error) {
            console.error('Submission error:', error);
            setSubmissionError('Network error occurred during submission.');
          } finally {
            setIsSubmitting(false);
          }
        }}
        title="Confirm Submission">
        <Text style={{ color: theme.colors.textSecondary }}>Are you sure you want to submit this residence report? This action cannot be undone.</Text>
        {submissionError && <Text style={[styles.errorTextModal, { color: theme.colors.danger }]}>{submissionError}</Text>}
      </ConfirmationModal>
    </AutoSaveFormWrapper>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  section: { marginBottom: 24, padding: 16, borderRadius: 12, borderWidth: 1 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, borderBottomWidth: 1, paddingBottom: 8 },
  infoText: { fontSize: 14, marginBottom: 4 },
  submitBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  disabledBtn: { backgroundColor: '#9ca3af' },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  errorText: { fontSize: 16, fontWeight: '500' },
  spacer20: { height: 20 },
  spacer100: { height: 100 },
  errorTextModal: { marginTop: 10 }
});

export default PositiveResidenceForm;

