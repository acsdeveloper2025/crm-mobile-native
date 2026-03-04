import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, ResiCumOfficeReportData, AddressLocatable, AddressRating, ResiCumOfficeStatus, SightStatus,
  RelationResiCumOffice, StayingStatus, BusinessStatusResiCumOffice, BusinessLocation, DocumentShownStatus,
  DocumentType, TPCMetPerson, TPCConfirmation, LocalityTypeResiCumOffice, PoliticalConnection,
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
  createImageChangeHandler,
  createSelfieImageChangeHandler,
  createAutoSaveImagesChangeHandler,
  combineImagesForAutoSave,
  createFormDataChangeHandler,
  createDataRestoredHandler
} from '../../../utils/imageAutoSaveHelpers';

interface PositiveResiCumOfficeFormProps {
  taskData: VerificationTask;
}

const PositiveResiCumOfficeForm: React.FC<PositiveResiCumOfficeFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updateResiCumOfficeReport, updateTaskStatus, toggleSaveTask , fetchTasks } = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  
  const report = taskData.resiCumOfficeReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = createFormDataChangeHandler(
    updateResiCumOfficeReport,
    taskData.id,
    isReadOnly
  );

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    updateResiCumOfficeReport,
    taskData.id,
    report || ({} as any),
    isReadOnly
  );

  const handleDataRestored = createDataRestoredHandler(
    updateResiCumOfficeReport,
    taskData.id,
    isReadOnly
  );

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: (keyof ResiCumOfficeReportData)[]) => fields.every(field => {
        const value = report[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields: (keyof ResiCumOfficeReportData)[] = [
        'addressLocatable', 'addressRating', 'resiCumOfficeStatus', 'locality', 'addressStructure', 'applicantStayingFloor',
        'addressStructureColor', 'doorColor', 'doorNamePlateStatus', 'societyNamePlateStatus', 'companyNamePlateStatus',
        'landmark1', 'landmark2', 'politicalConnection', 'dominatedArea', 'feedbackFromNeighbour', 'otherObservation', 'finalStatus',
        'residenceSetup', 'businessSetup', 'stayingPeriod', 'stayingStatus', 'companyNatureOfBusiness',
        'businessPeriod', 'businessStatus', 'businessLocation'
    ];
    if (!checkFields(baseFields)) return false;

    if (report.tpcMetPerson1) {
        if (!report.tpcName1 || report.tpcName1.trim() === '' || !report.tpcConfirmation1) return false;
    }
    if (report.tpcMetPerson2) {
        if (!report.tpcName2 || report.tpcName2.trim() === '' || !report.tpcConfirmation2) return false;
    }

    if (report.businessLocation === BusinessLocation.DifferentAddress) {
        if (!report.businessOperatingAddress || report.businessOperatingAddress.trim() === '') return false;
    }

    if (report.resiCumOfficeStatus === ResiCumOfficeStatus.Open) {
        const openedOnlyFields: (keyof ResiCumOfficeReportData)[] = [
            'metPerson', 'relation', 'approxArea', 'documentShownStatus'
        ];
        if (!checkFields(openedOnlyFields)) return false;

        if (report.documentShownStatus === DocumentShownStatus.Yes) {
            if (!report.documentType) return false;
        }
    }

    if (report.doorNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnDoorPlate || report.nameOnDoorPlate.trim() === '') return false;
    }
    if (report.societyNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnSocietyBoard || report.nameOnSocietyBoard.trim() === '') return false;
    }
    if (report.companyNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnBoard || report.nameOnBoard.trim() === '') return false;
    }
    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    let processedValue: string | number | null = value;

    if (name === 'approxArea') {
      processedValue = value === '' ? null : Number(value);
    }
    
    if (value === '') {
        processedValue = null;
    }

    updateResiCumOfficeReport(taskData.id, { [name]: processedValue });
  };

  const handleImagesChange = createImageChangeHandler(
    updateResiCumOfficeReport,
    taskData.id,
    report || ({} as any),
    handleAutoSaveImagesChange
  );

  const handleSelfieImagesChange = createSelfieImageChangeHandler(
    updateResiCumOfficeReport,
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
    resiCumOfficeStatus: getEnumOptions(ResiCumOfficeStatus),
    sightStatus: getEnumOptions(SightStatus),
    relation: getEnumOptions(RelationResiCumOffice),
    stayingStatus: getEnumOptions(StayingStatus),
    businessStatus: getEnumOptions(BusinessStatusResiCumOffice),
    businessLocation: getEnumOptions(BusinessLocation),
    documentShownStatus: getEnumOptions(DocumentShownStatus),
    documentType: getEnumOptions(DocumentType),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    tpcConfirmation: getEnumOptions(TPCConfirmation),
    localityType: getEnumOptions(LocalityTypeResiCumOffice),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus),
  }), []);

  if (!report) {
    return (
      <View style={styles.container}>
        <Text style={[{ color: theme.colors.danger }, styles.noDataText]}>No Positive Resi-cum-Office report data available.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.RESIDENCE_CUM_OFFICE_POSITIVE}
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Positive Resi-cum-Office Report</Text>

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
          <SelectField label="Form Status" id="resiCumOfficeStatus" name="resiCumOfficeStatus" value={report.resiCumOfficeStatus || ''} onValueChange={(val) => handleChange('resiCumOfficeStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.resiCumOfficeStatus}
          </SelectField>
        </View>

        {/* Setup Verification Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Setup Verification</Text>
          <SelectField label="Residence Setup" id="residenceSetup" name="residenceSetup" value={report.residenceSetup || ''} onValueChange={(val) => handleChange('residenceSetup', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          <SelectField label="Business Setup" id="businessSetup" name="businessSetup" value={report.businessSetup || ''} onValueChange={(val) => handleChange('businessSetup', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          <FormField label="Staying Period" id="stayingPeriod" name="stayingPeriod" value={report.stayingPeriod} onChangeText={(val) => handleChange('stayingPeriod', val)} placeholder="e.g., 5 years" disabled={isReadOnly} />
          <SelectField label="Staying Status" id="stayingStatus" name="stayingStatus" value={report.stayingStatus || ''} onValueChange={(val) => handleChange('stayingStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.stayingStatus}
          </SelectField>
        </View>

        {/* Business Details Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Business Details</Text>
          <FormField label="Nature of Business" id="companyNatureOfBusiness" name="companyNatureOfBusiness" value={report.companyNatureOfBusiness} onChangeText={(val) => handleChange('companyNatureOfBusiness', val)} disabled={isReadOnly} />
          <FormField label="Business Period" id="businessPeriod" name="businessPeriod" value={report.businessPeriod} onChangeText={(val) => handleChange('businessPeriod', val)} placeholder="e.g., 2 years" disabled={isReadOnly} />
          <SelectField label="Business Status" id="businessStatus" name="businessStatus" value={report.businessStatus || ''} onValueChange={(val) => handleChange('businessStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.businessStatus}
          </SelectField>
          <SelectField label="Business Location" id="businessLocation" name="businessLocation" value={report.businessLocation || ''} onValueChange={(val) => handleChange('businessLocation', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.businessLocation}
          </SelectField>
          {report.businessLocation === BusinessLocation.DifferentAddress && (
            <FormField label="Operating Address" id="businessOperatingAddress" name="businessOperatingAddress" value={report.businessOperatingAddress || ''} onChangeText={(val) => handleChange('businessOperatingAddress', val)} disabled={isReadOnly} />
          )}
        </View>

        {/* Conditional Details - Only show if open */}
        {report.resiCumOfficeStatus === ResiCumOfficeStatus.Open && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Operational Details</Text>
            <FormField label="Met Person" id="metPerson" name="metPerson" value={report.metPerson} onChangeText={(val) => handleChange('metPerson', val)} disabled={isReadOnly} />
            <SelectField label="Relation" id="relation" name="relation" value={report.relation || ''} onValueChange={(val) => handleChange('relation', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.relation}
            </SelectField>
            <FormField label="Approx Area (Sq. Ft)" id="approxArea" name="approxArea" value={report.approxArea || ''} onChangeText={(val) => handleChange('approxArea', val)} type="number" disabled={isReadOnly} />
            <SelectField label="Document Shown" id="documentShownStatus" name="documentShownStatus" value={report.documentShownStatus || ''} onValueChange={(val) => handleChange('documentShownStatus', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.documentShownStatus}
            </SelectField>
            {report.documentShownStatus === DocumentShownStatus.Yes && (
              <SelectField label="Document Type" id="documentType" name="documentType" value={report.documentType || ''} onValueChange={(val) => handleChange('documentType', val)} disabled={isReadOnly}>
                <Picker.Item label="Select..." value="" />
                {options.documentType}
              </SelectField>
            )}
          </View>
        )}

        {/* TPC Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Third Party Confirmation</Text>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 1</Text>
            <SelectField label="Met Person" id="tpcMetPerson1" name="tpcMetPerson1" value={report.tpcMetPerson1 || ''} onValueChange={(val) => handleChange('tpcMetPerson1', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name" id="tpcName1" name="tpcName1" value={report.tpcName1} onChangeText={(val) => handleChange('tpcName1', val)} disabled={isReadOnly} />
            <SelectField label="Confirmation" id="tpcConfirmation1" name="tpcConfirmation1" value={report.tpcConfirmation1 || ''} onValueChange={(val) => handleChange('tpcConfirmation1', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcConfirmation}
            </SelectField>
          </View>
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>TPC 2</Text>
            <SelectField label="Met Person" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcMetPerson}
            </SelectField>
            <FormField label="Name" id="tpcName2" name="tpcName2" value={report.tpcName2} onChangeText={(val) => handleChange('tpcName2', val)} disabled={isReadOnly} />
            <SelectField label="Confirmation" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcConfirmation}
            </SelectField>
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
          <NumberDropdownField label="Staying Floor" id="applicantStayingFloor" name="applicantStayingFloor" value={report.applicantStayingFloor || ''} onChange={(val) => handleChange('applicantStayingFloor', val)} min={1} max={300} disabled={isReadOnly} />
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
            <FormField label="Name on Society" id="nameOnSocietyBoard" name="nameOnSocietyBoard" value={report.nameOnSocietyBoard} onChangeText={(val) => handleChange('nameOnSocietyBoard', val)} disabled={isReadOnly}  />
          )}
          <SelectField label="Company Plate" id="companyNamePlateStatus" name="companyNamePlateStatus" value={report.companyNamePlateStatus || ''} onValueChange={(val) => handleChange('companyNamePlateStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          {report.companyNamePlateStatus === SightStatus.Sighted && (
            <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly}  />
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
          <TextAreaField label="Other Observations" id="otherObservation" name="otherObservation" value={report.otherObservation} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
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

                  const result = await VerificationFormService.submitResidenceCumOfficeVerification(
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
    width: '50%',
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

export default PositiveResiCumOfficeForm;