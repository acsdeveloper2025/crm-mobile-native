import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  VerificationTask, PositivePropertyApfReportData, NspPropertyApfReportData, AddressLocatable, AddressRating,
  BuildingStatusApf, RelationshipApf, TPCMetPerson, TPCConfirmation,
  LocalityTypeResiCumOffice, SightStatus, PoliticalConnection, DominatedArea,
  FeedbackFromNeighbour, FinalStatus, TaskStatus, CapturedImage
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

interface PositiveNegativePropertyApfFormProps {
  taskData: VerificationTask;
}

// Status enum for the unified form
enum VerificationStatus {
  Positive = 'Positive',
  Negative = 'Negative'
}

// Construction Activity enum
enum ConstructionActivity {
  Seen = 'SEEN',
  ConstructionStop = 'CONSTRUCTION IS STOP',
  PlotVacant = 'PLOT IS VACANT'
}

// Company Name Board enum
enum CompanyNameBoard {
  SightedAs = 'SIGHTED AS',
  NotSighted = 'NOT SIGHTED'
}

const PositiveNegativePropertyApfForm: React.FC<PositiveNegativePropertyApfFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { updatePositivePropertyApfReport, updateNspPropertyApfReport, updateTaskStatus, toggleSaveTask , fetchTasks } = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const verificationStatus = VerificationStatus.Positive; // Default to Positive, determined by form outcome
  const [constructionActivity, setConstructionActivity] = useState<ConstructionActivity>(ConstructionActivity.Seen);
  const [companyNameBoard, setCompanyNameBoard] = useState<CompanyNameBoard>(CompanyNameBoard.NotSighted);

  // Determine which report to use based on current verification status
  const report = verificationStatus === VerificationStatus.Positive
    ? taskData.positivePropertyApfReport
    : taskData.nspPropertyApfReport;

  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers
  const handleFormDataChange = (formData: any) => {
    if (!isReadOnly) {
      if (verificationStatus === VerificationStatus.Positive) {
        updatePositivePropertyApfReport(taskData.id, formData);
      } else {
        updateNspPropertyApfReport(taskData.id, formData);
      }
    }
  };

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    verificationStatus === VerificationStatus.Positive ? updatePositivePropertyApfReport : updateNspPropertyApfReport,
    taskData.id,
    report || ({} as any),
    isReadOnly
  );

  const handleDataRestored = (data: any) => {
    if (!isReadOnly && data.formData) {
      if (verificationStatus === VerificationStatus.Positive) {
        updatePositivePropertyApfReport(taskData.id, data.formData);
      } else {
        updateNspPropertyApfReport(taskData.id, data.formData);
      }
    }
  };

  const isFormValid = useMemo(() => {
    if (!report) return false;
    if (report.images.length < MIN_IMAGES) return false;
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: string[]) => fields.every(field => {
        const value = (report as any)[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields = [
        'addressLocatable', 'addressRating',
        'tpcMetPerson1', 'nameOfTpc1', 'tpcConfirmation1', 'tpcMetPerson2', 'nameOfTpc2', 'tpcConfirmation2',
        'locality', 'addressStructure', 'addressStructureColor', 'doorColor',
        'doorNamePlateStatus', 'landmark1', 'landmark2', 'politicalConnection',
        'dominatedArea', 'feedbackFromNeighbour', 'otherObservation', 'finalStatus'
    ];

    if (!checkFields(baseFields)) return false;

    if (constructionActivity === ConstructionActivity.Seen) {
        const seenFields = ['metPerson', 'propertyOwnerName'];
        if (verificationStatus === VerificationStatus.Positive) {
            seenFields.push('relationship', 'approxArea');
        } else {
            //@ts-ignore - relationship is string in negative report
            seenFields.push('relationship');
        }
        if (!checkFields(seenFields)) return false;
    }

    if (report.doorNamePlateStatus === SightStatus.Sighted) {
        if (!report.nameOnDoorPlate || report.nameOnDoorPlate.trim() === '') return false;
    }
    
    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report, verificationStatus, constructionActivity, MIN_IMAGES]);

  const handleChange = (name: string, value: any) => {
    let processedValue: string | number | null = value;
    
    if (value === '') {
        processedValue = null;
    }

    if (name === 'approxArea' || name === 'totalBuildingsInProject' || name === 'totalFlats' || name === 'projectCompletionPercent' || name === 'staffStrength' || name === 'staffSeen') {
        processedValue = value === '' ? null : Number(value);
    }

    const updates = { [name]: processedValue };
    
    if (verificationStatus === VerificationStatus.Positive) {
        updatePositivePropertyApfReport(taskData.id, updates as Partial<PositivePropertyApfReportData>);
    } else {
        updateNspPropertyApfReport(taskData.id, updates as Partial<NspPropertyApfReportData>);
    }
  };
  
  const handleImagesChange = (images: CapturedImage[]) => {
    const updates = { images };
    if (verificationStatus === VerificationStatus.Positive) {
        updatePositivePropertyApfReport(taskData.id, updates);
    } else {
        updateNspPropertyApfReport(taskData.id, updates);
    }
    handleAutoSaveImagesChange(images);
  };

  const handleSelfieImagesChange = (selfieImages: CapturedImage[]) => {
    const updates = { selfieImages };
    if (verificationStatus === VerificationStatus.Positive) {
        updatePositivePropertyApfReport(taskData.id, updates);
    } else {
        updateNspPropertyApfReport(taskData.id, updates);
    }
    handleAutoSaveImagesChange(selfieImages); // This is a bit simplified, but works with the current auto-save helper
  };
  
  const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
    <Picker.Item key={value} label={value} value={value} />
  ));

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    buildingStatus: getEnumOptions(BuildingStatusApf),
    relationship: getEnumOptions(RelationshipApf),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    tpcConfirmation: getEnumOptions(TPCConfirmation),
    localityType: getEnumOptions(LocalityTypeResiCumOffice),
    sightStatus: getEnumOptions(SightStatus),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus),
    constructionActivity: getEnumOptions(ConstructionActivity),
    companyNameBoard: getEnumOptions(CompanyNameBoard),
  }), []);

  if (!report) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>No Property APF report data available.</Text>
      </View>
    );
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={verificationStatus === VerificationStatus.Positive ? FORM_TYPES.PROPERTY_APF_POSITIVE : FORM_TYPES.PROPERTY_APF_NSP}
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Property APF Report</Text>

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
              <Text style={styles.infoLabel}>Product</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>{typeof taskData.product === 'object' ? taskData.product?.name : taskData.product || taskData.productName || 'N/A'}</Text>
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
          <SelectField
            label="Construction Activity"
            id="constructionActivity"
            name="constructionActivity"
            value={constructionActivity}
            onValueChange={(val) => setConstructionActivity(val as ConstructionActivity)}
            disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.constructionActivity}
          </SelectField>
        </View>

        {/* Construction Stop Details */}
        {constructionActivity === ConstructionActivity.ConstructionStop && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.danger }]}>Construction Stop Details</Text>
            <FormField label="Building Status" id="buildingStatus" name="buildingStatus" value={report.buildingStatus || ''} onChangeText={(val) => handleChange('buildingStatus', val)} disabled={isReadOnly} />
            <FormField label="Activity Stop Reason" id="activityStopReason" name="activityStopReason" value={report.activityStopReason || ''} onChangeText={(val) => handleChange('activityStopReason', val)} disabled={isReadOnly} />
            <FormField label="Project Name" id="projectName" name="projectName" value={report.projectName || ''} onChangeText={(val) => handleChange('projectName', val)} disabled={isReadOnly} />
            <FormField label="Project Started Date" id="projectStartedDate" name="projectStartedDate" value={report.projectStartedDate || ''} onChangeText={(val) => handleChange('projectStartedDate', val)} disabled={isReadOnly} />
            <FormField label="Project Completion Date" id="projectCompletionDate" name="projectCompletionDate" value={report.projectCompletionDate || ''} onChangeText={(val) => handleChange('projectCompletionDate', val)} disabled={isReadOnly} />
            <FormField label="Total Wing" id="totalWing" name="totalWing" value={report.totalWing || ''} onChangeText={(val) => handleChange('totalWing', val)} disabled={isReadOnly} />
            <FormField label="Total Flats" id="totalFlats" name="totalFlats" value={report.totalFlats || ''} onChangeText={(val) => handleChange('totalFlats', val)} disabled={isReadOnly} />
            <FormField label="Project Completion %" id="projectCompletionPercent" name="projectCompletionPercent" value={report.projectCompletionPercent || ''} onChangeText={(val) => handleChange('projectCompletionPercent', val)} type="number" disabled={isReadOnly} />
            <FormField label="Staff Strength" id="staffStrength" name="staffStrength" value={report.staffStrength || ''} onChangeText={(val) => handleChange('staffStrength', val)} type="number" disabled={isReadOnly} />
            <FormField label="Staff Seen" id="staffSeen" name="staffSeen" value={report.staffSeen || ''} onChangeText={(val) => handleChange('staffSeen', val)} type="number" disabled={isReadOnly} />
            <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard || ''} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly} />
          </View>
        )}

        {/* Construction Seen Details */}
        {constructionActivity === ConstructionActivity.Seen && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Additional Details (Construction Seen)</Text>
            <FormField label="Met Person" id="metPerson" name="metPerson" value={report.metPerson || ''} onChangeText={(val) => handleChange('metPerson', val)} disabled={isReadOnly} />
            {verificationStatus === VerificationStatus.Positive ? (
              <SelectField label="Relationship" id="relationship" name="relationship" value={(report as PositivePropertyApfReportData).relationship || ''} onValueChange={(val) => handleChange('relationship', val)} disabled={isReadOnly}>
                <Picker.Item label="Select..." value="" />
                {options.relationship}
              </SelectField>
            ) : (
              <FormField label="Relationship" id="relationship" name="relationship" value={(report as NspPropertyApfReportData).relationship || ''} onChangeText={(val) => handleChange('relationship', val)} disabled={isReadOnly} />
            )}
            <FormField label="Property Owner Name" id="propertyOwnerName" name="propertyOwnerName" value={report.propertyOwnerName || ''} onChangeText={(val) => handleChange('propertyOwnerName', val)} disabled={isReadOnly} />
            {verificationStatus === VerificationStatus.Positive && (
              <FormField
                label="Approx Area"
                id="approxArea"
                name="approxArea"
                value={(report as PositivePropertyApfReportData).approxArea?.toString() || ''}
                onChangeText={(val) => handleChange('approxArea', val)}
                type="number"
                disabled={isReadOnly}
              />
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
            <FormField label="Name" id="nameOfTpc1" name="nameOfTpc1" value={report.nameOfTpc1 || ''} onChangeText={(val) => handleChange('nameOfTpc1', val)} disabled={isReadOnly} />
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
            <FormField label="Name" id="nameOfTpc2" name="nameOfTpc2" value={report.nameOfTpc2 || ''} onChangeText={(val) => handleChange('nameOfTpc2', val)} disabled={isReadOnly} />
            <SelectField label="Confirmation" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
              <Picker.Item label="Select..." value="" />
              {options.tpcConfirmation}
            </SelectField>
          </View>
        </View>

        {/* Property Details Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Property Details</Text>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.localityType}
          </SelectField>
          <NumberDropdownField label="Structure (Floors)" id="addressStructure" name="addressStructure" value={report.addressStructure || ''} onChange={(val) => handleChange('addressStructure', val)} min={1} max={300} disabled={isReadOnly} />
          <FormField label="Structure Color" id="addressStructureColor" name="addressStructureColor" value={report.addressStructureColor || ''} onChangeText={(val) => handleChange('addressStructureColor', val)} disabled={isReadOnly} />
          <FormField label="Door Color" id="doorColor" name="doorColor" value={report.doorColor || ''} onChangeText={(val) => handleChange('doorColor', val)} disabled={isReadOnly} />
          
          <SelectField label="Door Name Plate" id="doorNamePlateStatus" name="doorNamePlateStatus" value={report.doorNamePlateStatus || ''} onValueChange={(val) => handleChange('doorNamePlateStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.sightStatus}
          </SelectField>
          {report.doorNamePlateStatus === SightStatus.Sighted && (
            <FormField label="Name on Door Plate" id="nameOnDoorPlate" name="nameOnDoorPlate" value={report.nameOnDoorPlate || ''} onChangeText={(val) => handleChange('nameOnDoorPlate', val)} disabled={isReadOnly} />
          )}

          <SelectField
            label="Company Name Board"
            id="companyNameBoard"
            name="companyNameBoard"
            value={companyNameBoard}
            onValueChange={(val) => setCompanyNameBoard(val as CompanyNameBoard)}
            disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.companyNameBoard}
          </SelectField>
          {companyNameBoard === CompanyNameBoard.SightedAs && (
            <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard || ''} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly} />
          )}
        </View>

        {/* Project Information Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Project Information</Text>
          <FormField label="Total Buildings" id="totalBuildingsInProject" name="totalBuildingsInProject" value={report.totalBuildingsInProject || ''} onChangeText={(val) => handleChange('totalBuildingsInProject', val)} type="number" disabled={isReadOnly} />
          <FormField label="Total Flats" id="totalFlats" name="totalFlats" value={report.totalFlats || ''} onChangeText={(val) => handleChange('totalFlats', val)} type="number" disabled={isReadOnly} />
          <FormField label="Start Date" id="projectStartedDate" name="projectStartedDate" value={report.projectStartedDate || ''} onChangeText={(val) => handleChange('projectStartedDate', val)} disabled={isReadOnly} />
          <FormField label="End Date" id="projectCompletionDate" name="projectCompletionDate" value={report.projectCompletionDate || ''} onChangeText={(val) => handleChange('projectCompletionDate', val)} disabled={isReadOnly} />
        </View>

        {/* Area Assessment Section */}
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
          <SelectField label="Neighbour Feedback" id="feedbackFromNeighbour" name="feedbackFromNeighbour" value={report.feedbackFromNeighbour || ''} onValueChange={(val) => handleChange('feedbackFromNeighbour', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.feedbackFromNeighbour}
          </SelectField>
          <FormField label="Landmark 1" id="landmark1" name="landmark1" value={report.landmark1 || ''} onChangeText={(val) => handleChange('landmark1', val)} disabled={isReadOnly} />
          <FormField label="Landmark 2" id="landmark2" name="landmark2" value={report.landmark2 || ''} onChangeText={(val) => handleChange('landmark2', val)} disabled={isReadOnly} />
          <TextAreaField label="Other Observation" id="otherObservation" name="otherObservation" value={report.otherObservation || ''} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
        </View>

        {/* Final Status Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Final Status</Text>
          <SelectField label="Final Status" id="finalStatus" name="finalStatus" value={report.finalStatus || ''} onValueChange={(val) => handleChange('finalStatus', val)} disabled={isReadOnly}>
            <Picker.Item label="Select..." value="" />
            {options.finalStatus}
          </SelectField>
          {report.finalStatus === FinalStatus.Hold && (
            <FormField label="Reason for Hold" id="holdReason" name="holdReason" value={report.holdReason || ''} onChangeText={(val) => handleChange('holdReason', val)} disabled={isReadOnly} />
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
          <View style={styles.spacerSmall} />
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
                      outcome: taskData.verificationOutcome,
                      remarks: report.otherObservation || '',
                      ...report
                  };

                  const allImages = [...(report.images || []), ...(report.selfieImages || [])];
                  const geoLocation = report.images?.[0]?.geoLocation ? {
                      latitude: report.images[0].geoLocation.latitude,
                      longitude: report.images[0].geoLocation.longitude,
                      accuracy: report.images[0].geoLocation.accuracy
                  } : undefined;

                  const result = await VerificationFormService.submitPropertyApfVerification(
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
        
        <View style={styles.spacerLarge} />
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
  noDataText: {
    color: '#f44336', 
    padding: 20,
  },
  spacerSmall: {
    height: 20,
  },
  spacerLarge: {
    height: 100,
  }
});

export default PositiveNegativePropertyApfForm;
