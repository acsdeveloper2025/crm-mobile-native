import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useMemo, useState } from 'react';
import {
  VerificationTask, PositiveDsaReportData, AddressLocatable, AddressRating, OfficeStatusOffice, DesignationShiftedOffice,
  BusinessType, OwnershipTypeBusiness, AddressStatusBusiness, SightStatus, TPCMetPerson, TPCConfirmation,
  LocalityTypeResiCumOffice, PoliticalConnection, DominatedArea, FeedbackFromNeighbour, FinalStatus, TaskStatus
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
import {
  createImageChangeHandler,
  createSelfieImageChangeHandler,
  createAutoSaveImagesChangeHandler,
  combineImagesForAutoSave,
  createFormDataChangeHandler,
  createDataRestoredHandler
} from '../../../utils/imageAutoSaveHelpers';

interface PositiveDsaFormProps {
  taskData: VerificationTask;
}

const getEnumOptions = (enumObject: object) => Object.values(enumObject).map(value => (
  <option key={value} value={value}>{value}</option>
));

const PositiveDsaForm: React.FC<PositiveDsaFormProps> = ({ taskData }) => {
  const navigation = useNavigation<any>();
    const { updatePositiveDsaReport, toggleSaveTask , fetchTasks , updateTaskStatus} = useTasks();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const report = taskData.positiveDsaReport;
  const isReadOnly = taskData.status === TaskStatus.Completed || taskData.isSaved;
  const MIN_IMAGES = 5;

  // Auto-save handlers using helper functions for complete auto-save functionality
  const handleFormDataChange = createFormDataChangeHandler(
    updatePositiveDsaReport,
    taskData.id,
    isReadOnly
  );

  const handleAutoSaveImagesChange = createAutoSaveImagesChangeHandler(
    updatePositiveDsaReport,
    taskData.id,
    report,
    isReadOnly
  );

  const handleDataRestored = createDataRestoredHandler(
    updatePositiveDsaReport,
    taskData.id,
    isReadOnly
  );

  const isFormValid = useMemo(() => {
    if (!report) return false;

    if (report.images.length < MIN_IMAGES) return false;

    // Require at least one selfie image
    if (!report.selfieImages || report.selfieImages.length === 0) return false;

    const checkFields = (fields: (keyof PositiveDsaReportData)[]) => fields.every(field => {
        const value = report[field];
        return value !== null && value !== undefined && value !== '';
    });

    const baseFields: (keyof PositiveDsaReportData)[] = [
        'addressLocatable', 'addressRating', 'officeStatus', 'locality', 'addressStructure', 'addressStructureColor',
        'doorColor', 'landmark1', 'landmark2', 'politicalConnection', 'dominatedArea', 'feedbackFromNeighbour',
        'otherObservation', 'finalStatus'
    ];
    if (!checkFields(baseFields)) return false;

    if (report.officeStatus === OfficeStatusOffice.Opened) {
        const openedFields: (keyof PositiveDsaReportData)[] = [
            'metPerson', 'designation', 'businessType', 'nameOfCompanyOwners', 'ownershipType', 'addressStatus',
            'companyNatureOfBusiness', 'businessPeriod', 'officeApproxArea', 'staffStrength', 'staffSeen',
            'activeClient', 'companyNamePlateStatus', 'tpcMetPerson1', 'nameOfTpc1', 'tpcConfirmation1',
            'tpcMetPerson2', 'nameOfTpc2', 'tpcConfirmation2'
        ];
        if (!checkFields(openedFields)) return false;
        if (report.companyNamePlateStatus === SightStatus.Sighted) {
            if (!report.nameOnBoard || report.nameOnBoard.trim() === '') return false;
        }
    }

    if (report.officeStatus === OfficeStatusOffice.Closed) {
        const closedFields: (keyof PositiveDsaReportData)[] = [
            'addressStatus', 'companyNatureOfBusiness', 'businessPeriod', 'activeClient', 'companyNamePlateStatus',
            'tpcMetPerson1', 'nameOfTpc1', 'tpcConfirmation1', 'tpcMetPerson2', 'nameOfTpc2', 'tpcConfirmation2'
        ];
        if (!checkFields(closedFields)) return false;
        if (report.companyNamePlateStatus === SightStatus.Sighted) {
            if (!report.nameOnBoard || report.nameOnBoard.trim() === '') return false;
        }
    }
    
    if (report.finalStatus === FinalStatus.Hold) {
        if (!report.holdReason || report.holdReason.trim() === '') return false;
    }

    return true;
  }, [report]);

  const handleChange = (name: string, value: any) => {
    let processedValue: string | number | null = value;

    if (name === 'officeApproxArea' || name === 'staffStrength' || name === 'staffSeen') {
      processedValue = value === '' ? null : Number(value);
    }
    
    if (value === '') {
        processedValue = null;
    }

    const updates: Partial<PositiveDsaReportData> = { [name]: processedValue };
    updatePositiveDsaReport(taskData.id, updates);
  };
  
  const handleImagesChange = createImageChangeHandler(
    updatePositiveDsaReport,
    taskData.id,
    report,
    handleAutoSaveImagesChange
  );

  const handleSelfieImagesChange = createSelfieImageChangeHandler(
    updatePositiveDsaReport,
    taskData.id,
    report,
    handleAutoSaveImagesChange
  );

  const options = useMemo(() => ({
    addressLocatable: getEnumOptions(AddressLocatable),
    addressRating: getEnumOptions(AddressRating),
    officeStatus: getEnumOptions(OfficeStatusOffice),
    designation: getEnumOptions(DesignationShiftedOffice),
    businessType: getEnumOptions(BusinessType),
    ownershipType: getEnumOptions(OwnershipTypeBusiness),
    addressStatus: getEnumOptions(AddressStatusBusiness),
    sightStatus: getEnumOptions(SightStatus),
    tpcMetPerson: getEnumOptions(TPCMetPerson),
    tpcConfirmation: getEnumOptions(TPCConfirmation),
    localityType: getEnumOptions(LocalityTypeResiCumOffice),
    politicalConnection: getEnumOptions(PoliticalConnection),
    dominatedArea: getEnumOptions(DominatedArea),
    feedbackFromNeighbour: getEnumOptions(FeedbackFromNeighbour),
    finalStatus: getEnumOptions(FinalStatus),
  }), []);

  if (!report) {
    return <Text>No Positive DSA/DST report data available.</Text>;
  }

  return (
    <AutoSaveFormWrapper
      taskId={taskData.id}
      formType={FORM_TYPES.DSA_POSITIVE}
      formData={report}
      images={combineImagesForAutoSave(report)}
      onFormDataChange={handleFormDataChange}
      onImagesChange={handleAutoSaveImagesChange}
      onDataRestored={handleDataRestored}
      autoSaveOptions={{
        enableAutoSave: !isReadOnly,
        showIndicator: !isReadOnly,
        debounceMs: 500, // Faster auto-save for images (500ms instead of 2000ms)
      }}>
      <View>
      <Text>Positive DSA Report</Text>

      {/* Customer Information Section */}
      <View>
        <Text>Customer Information</Text>
        <View>
          <View>
            <Text>Customer Name</Text>
            <Text>{taskData.customer.name}</Text>
          </View>
          <View>
            <Text>Bank Name</Text>
            <Text>{typeof taskData.client === 'object' ? taskData.client?.name : taskData.client || taskData.clientName || 'N/A'}</Text>
          </View>
          <View>
            <Text>Product</Text>
            <Text>{typeof taskData.product === 'object' ? taskData.product?.name : taskData.product || taskData.productName || 'N/A'}</Text>
          </View>
          <View>
            <Text>Trigger</Text>
            <Text>{taskData.notes || taskData.trigger || 'N/A'}</Text>
          </View>
          <View>
            <Text>Visit Address</Text>
            <Text>{taskData.addressStreet || taskData.visitAddress || taskData.address || 'N/A'}</Text>
          </View>
          <View>
            <Text>System Contact Number</Text>
            <Text>{taskData.systemContactNumber || 'N/A'}</Text>
          </View>
          <View>
            <Text>Customer Calling Code</Text>
            <Text>{taskData.customerCallingCode || 'N/A'}</Text>
          </View>
          <View>
            <Text>Applicant Status</Text>
            <Text>{taskData.applicantStatus || 'N/A'}</Text>
          </View>
        </View>
      </View>

      {/* Address Verification Section */}
      <View>
        <Text>Address Verification</Text>
        <View>
          <SelectField label="Address Locatable" id="addressLocatable" name="addressLocatable" value={report.addressLocatable || ''} onValueChange={(val) => handleChange('addressLocatable', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.addressLocatable}
          </SelectField>
          <SelectField label="Address Rating" id="addressRating" name="addressRating" value={report.addressRating || ''} onValueChange={(val) => handleChange('addressRating', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.addressRating}
          </SelectField>
          <SelectField label="Office Status" id="officeStatus" name="officeStatus" value={report.officeStatus || ''} onValueChange={(val) => handleChange('officeStatus', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.officeStatus}
          </SelectField>
        </View>
      </View>

      {/* DSA Verification Details Section - Conditional */}
      {report.officeStatus === OfficeStatusOffice.Opened && (
        <View>
          <Text>DSA Verification Details (Office Open)</Text>

          {/* Personal Details */}
          <View>
            <FormField label="Met Person" id="metPerson" name="metPerson" value={report.metPerson} onChangeText={(val) => handleChange('metPerson', val)} disabled={isReadOnly} />
            <SelectField label="Designation" id="designation" name="designation" value={report.designation || ''} onValueChange={(val) => handleChange('designation', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.designation}
            </SelectField>
          </View>

          {/* Business Details */}
          <View>
            <SelectField label="Business Type" id="businessType" name="businessType" value={report.businessType || ''} onValueChange={(val) => handleChange('businessType', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.businessType}
            </SelectField>
            <FormField label="Name of Company Owners" id="nameOfCompanyOwners" name="nameOfCompanyOwners" value={report.nameOfCompanyOwners} onChangeText={(val) => handleChange('nameOfCompanyOwners', val)} disabled={isReadOnly} />
            <SelectField label="Ownership Type" id="ownershipType" name="ownershipType" value={report.ownershipType || ''} onValueChange={(val) => handleChange('ownershipType', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.ownershipType}
            </SelectField>
            <SelectField label="Address Status" id="addressStatus" name="addressStatus" value={report.addressStatus || ''} onValueChange={(val) => handleChange('addressStatus', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.addressStatus}
            </SelectField>
            <FormField label="Company Nature of Business" id="companyNatureOfBusiness" name="companyNatureOfBusiness" value={report.companyNatureOfBusiness} onChangeText={(val) => handleChange('companyNatureOfBusiness', val)} disabled={isReadOnly} />
            <FormField label="Business Period" id="businessPeriod" name="businessPeriod" value={report.businessPeriod} onChangeText={(val) => handleChange('businessPeriod', val)} placeholder="e.g., 5 years" disabled={isReadOnly} />
            <FormField label="Office Approx Area (Sq. Feet)" id="officeApproxArea" name="officeApproxArea" value={report.officeApproxArea?.toString() || ''} onChangeText={(val) => handleChange('officeApproxArea', val)} type="number" disabled={isReadOnly} />
            <FormField label="Staff Strength" id="staffStrength" name="staffStrength" value={report.staffStrength?.toString() || ''} onChangeText={(val) => handleChange('staffStrength', val)} type="number" disabled={isReadOnly} />
            <FormField label="Staff Seen" id="staffSeen" name="staffSeen" value={report.staffSeen?.toString() || ''} onChangeText={(val) => handleChange('staffSeen', val)} type="number" disabled={isReadOnly} />
            <FormField label="Active Client" id="activeClient" name="activeClient" value={report.activeClient} onChangeText={(val) => handleChange('activeClient', val)} disabled={isReadOnly} />
          </View>

          {/* Company Name Plate */}
          <View>
            <SelectField label="Company Name Plate" id="companyNamePlateStatus" name="companyNamePlateStatus" value={report.companyNamePlateStatus || ''} onValueChange={(val) => handleChange('companyNamePlateStatus', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.sightStatus}
            </SelectField>
            {report.companyNamePlateStatus === SightStatus.Sighted && (
              <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly} />
            )}
          </View>

          {/* Third Party Confirmation */}
          <View>
            <Text>Third Party Confirmation</Text>
            <View>
              <SelectField label="TPC Met Person 1" id="tpcMetPerson1" name="tpcMetPerson1" value={report.tpcMetPerson1 || ''} onValueChange={(val) => handleChange('tpcMetPerson1', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcMetPerson}
              </SelectField>
              <FormField label="Name of TPC 1" id="nameOfTpc1" name="nameOfTpc1" value={report.nameOfTpc1} onChangeText={(val) => handleChange('nameOfTpc1', val)} disabled={isReadOnly} />
              <SelectField label="TPC Confirmation 1" id="tpcConfirmation1" name="tpcConfirmation1" value={report.tpcConfirmation1 || ''} onValueChange={(val) => handleChange('tpcConfirmation1', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcConfirmation}
              </SelectField>
            </View>
            <View>
              <SelectField label="TPC Met Person 2" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcMetPerson}
              </SelectField>
              <FormField label="Name of TPC 2" id="nameOfTpc2" name="nameOfTpc2" value={report.nameOfTpc2} onChangeText={(val) => handleChange('nameOfTpc2', val)} disabled={isReadOnly} />
              <SelectField label="TPC Confirmation 2" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcConfirmation}
              </SelectField>
            </View>
          </View>
        </View>
      )}

      {/* DSA Verification Details Section - Office Closed */}
      {report.officeStatus === OfficeStatusOffice.Closed && (
        <View>
          <Text>DSA Verification Details (Office Closed)</Text>

          {/* Business Details for Closed Office */}
          <View>
            <SelectField label="Address Status" id="addressStatus" name="addressStatus" value={report.addressStatus || ''} onValueChange={(val) => handleChange('addressStatus', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.addressStatus}
            </SelectField>
            <FormField label="Company Nature of Business" id="companyNatureOfBusiness" name="companyNatureOfBusiness" value={report.companyNatureOfBusiness} onChangeText={(val) => handleChange('companyNatureOfBusiness', val)} disabled={isReadOnly} />
            <FormField label="Business Period" id="businessPeriod" name="businessPeriod" value={report.businessPeriod} onChangeText={(val) => handleChange('businessPeriod', val)} placeholder="e.g., 5 years" disabled={isReadOnly} />
            <FormField label="Active Client" id="activeClient" name="activeClient" value={report.activeClient} onChangeText={(val) => handleChange('activeClient', val)} disabled={isReadOnly} />
          </View>

          {/* Company Name Plate */}
          <View>
            <SelectField label="Company Name Plate" id="companyNamePlateStatus" name="companyNamePlateStatus" value={report.companyNamePlateStatus || ''} onValueChange={(val) => handleChange('companyNamePlateStatus', val)} disabled={isReadOnly}>
              <option value="">Select...</option>
              {options.sightStatus}
            </SelectField>
            {report.companyNamePlateStatus === SightStatus.Sighted && (
              <FormField label="Name on Board" id="nameOnBoard" name="nameOnBoard" value={report.nameOnBoard} onChangeText={(val) => handleChange('nameOnBoard', val)} disabled={isReadOnly} />
            )}
          </View>

          {/* Third Party Confirmation */}
          <View>
            <Text>Third Party Confirmation</Text>
            <View>
              <SelectField label="TPC Met Person 1" id="tpcMetPerson1" name="tpcMetPerson1" value={report.tpcMetPerson1 || ''} onValueChange={(val) => handleChange('tpcMetPerson1', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcMetPerson}
              </SelectField>
              <FormField label="Name of TPC 1" id="nameOfTpc1" name="nameOfTpc1" value={report.nameOfTpc1} onChangeText={(val) => handleChange('nameOfTpc1', val)} disabled={isReadOnly} />
              <SelectField label="TPC Confirmation 1" id="tpcConfirmation1" name="tpcConfirmation1" value={report.tpcConfirmation1 || ''} onValueChange={(val) => handleChange('tpcConfirmation1', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcConfirmation}
              </SelectField>
            </View>
            <View>
              <SelectField label="TPC Met Person 2" id="tpcMetPerson2" name="tpcMetPerson2" value={report.tpcMetPerson2 || ''} onValueChange={(val) => handleChange('tpcMetPerson2', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcMetPerson}
              </SelectField>
              <FormField label="Name of TPC 2" id="nameOfTpc2" name="nameOfTpc2" value={report.nameOfTpc2} onChangeText={(val) => handleChange('nameOfTpc2', val)} disabled={isReadOnly} />
              <SelectField label="TPC Confirmation 2" id="tpcConfirmation2" name="tpcConfirmation2" value={report.tpcConfirmation2 || ''} onValueChange={(val) => handleChange('tpcConfirmation2', val)} disabled={isReadOnly}>
                <option value="">Select...</option>
                {options.tpcConfirmation}
              </SelectField>
            </View>
          </View>
        </View>
      )}

      {/* Property Details Section */}
      <View>
        <Text>Property Details</Text>
        <View>
          <SelectField label="Locality" id="locality" name="locality" value={report.locality || ''} onValueChange={(val) => handleChange('locality', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.localityType}
          </SelectField>
          <NumberDropdownField label="Address Structure" id="addressStructure" name="addressStructure" value={report.addressStructure || ''} onChange={(val) => handleChange('addressStructure', val)} min={1} max={300} disabled={isReadOnly} />
          <FormField label="Address Structure Color" id="addressStructureColor" name="addressStructureColor" value={report.addressStructureColor} onChangeText={(val) => handleChange('addressStructureColor', val)} disabled={isReadOnly} />
          <FormField label="Door Color" id="doorColor" name="doorColor" value={report.doorColor} onChangeText={(val) => handleChange('doorColor', val)} disabled={isReadOnly} />
        </View>
        <View>
          <FormField label="Landmark 1" id="landmark1" name="landmark1" value={report.landmark1} onChangeText={(val) => handleChange('landmark1', val)} disabled={isReadOnly} />
          <FormField label="Landmark 2" id="landmark2" name="landmark2" value={report.landmark2} onChangeText={(val) => handleChange('landmark2', val)} disabled={isReadOnly} />
        </View>
      </View>

      {/* Area Assessment Section */}
      <View>
        <Text>Area Assessment</Text>
        <View>
          <SelectField label="Political Connection" id="politicalConnection" name="politicalConnection" value={report.politicalConnection || ''} onValueChange={(val) => handleChange('politicalConnection', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.politicalConnection}
          </SelectField>
          <SelectField label="Dominated Area" id="dominatedArea" name="dominatedArea" value={report.dominatedArea || ''} onValueChange={(val) => handleChange('dominatedArea', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.dominatedArea}
          </SelectField>
          <SelectField label="Feedback from Neighbour" id="feedbackFromNeighbour" name="feedbackFromNeighbour" value={report.feedbackFromNeighbour || ''} onValueChange={(val) => handleChange('feedbackFromNeighbour', val)} disabled={isReadOnly}>
            <option value="">Select...</option>
            {options.feedbackFromNeighbour}
          </SelectField>
        </View>
        <TextAreaField label="Other Observation" id="otherObservation" name="otherObservation" value={report.otherObservation} onChangeText={(val) => handleChange('otherObservation', val)} disabled={isReadOnly} />
      </View>

      {/* Final Status Section */}
      <View>
        <Text>Final Status</Text>
        <SelectField label="Final Status" id="finalStatus" name="finalStatus" value={report.finalStatus || ''} onValueChange={(val) => handleChange('finalStatus', val)} disabled={isReadOnly}>
          <option value="">Select...</option>
          {options.finalStatus}
        </SelectField>
        {report.finalStatus === FinalStatus.Hold && (
          <FormField label="Reason for Hold" id="holdReason" name="holdReason" value={report.holdReason} onChangeText={(val) => handleChange('holdReason', val)} disabled={isReadOnly} />
        )}
      </View>

      {/* Permission Status Section */}
      <PermissionStatus showOnlyDenied={true} />

      {/* Image Capture Section */}
      <ImageCapture
        taskId={taskData.verificationTaskId || taskData.id}
        images={report.images}
        onImagesChange={handleImagesChange}
        isReadOnly={isReadOnly}
        minImages={MIN_IMAGES}
        compact={true}
      />

      {/* Selfie Capture Section */}
      <SelfieCapture
        taskId={taskData.verificationTaskId || taskData.id}
        images={report.selfieImages || []}
        onImagesChange={handleSelfieImagesChange}
        isReadOnly={isReadOnly}
        required={true}
        title="🤳 Verification Selfie (Required)"
        compact={true}
      />

      {!isReadOnly && taskData.status === TaskStatus.InProgress && (
          <>
            <View>
                <TouchableOpacity 
                    onPress={() => setIsConfirmModalOpen(true)}
                    disabled={!isFormValid || isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit'}</TouchableOpacity>
                {!isFormValid && <Text>Please fill all required fields and capture at least {MIN_IMAGES} photos to submit.</Text>}
                {submissionSuccess && (
                    <View>
                        <Text>✅ Case submitted successfully! Redirecting to completed cases...</Text>
                    </View>
                )}
                {submissionError && (
                    <View>
                        <Text>{submissionError}</Text>
                    </View>
                )}
            </View>
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
                        // Prepare form data for submission
                        const formData = {
                            outcome: taskData.verificationOutcome, // Use ONLY case verification outcome, no fallback
                            remarks: report.otherObservation || '',
                            ...report // Include all report data
                        };

                        // Combine all images (regular + selfie)
                        const allImages = [
                            ...(report.images || []),
                            ...(report.selfieImages || [])
                        ];

                        // Get current location if available
                        const geoLocation = report.images?.[0]?.geoLocation ? {
                            latitude: report.images[0].geoLocation.latitude,
                            longitude: report.images[0].geoLocation.longitude,
                            accuracy: report.images[0].geoLocation.accuracy
                        } : undefined;

                        // Submit verification form to backend
                        const result = await VerificationFormService.submitDsaConnectorVerification(
                            taskData.id,
                            taskData.verificationTaskId!,
                            formData,
                            allImages,
                            geoLocation
                        );

                        if (result.success) {
                            
                            // Mark auto-save as completed
                            if ((globalThis as any).markAutoSaveFormCompleted) {
                                (globalThis as any).markAutoSaveFormCompleted();
                            }
                            
                            setIsConfirmModalOpen(false);
                            console.log('✅ Verification submitted successfully');
                            
                            // Handle post-submission: update status, refresh list, navigate
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
                        console.error('❌ Verification submission error:', error);
                        setSubmissionError(error instanceof Error ? error.message : 'Unknown error occurred');
                    } finally {
                        setIsSubmitting(false);
                    }
                }}
                title="Submit or Save Task"
                confirmText={isSubmitting ? "Submitting..." : "Submit Task"}
                saveText="Save for Offline">
                <View>
                    <Text>You can submit the task to mark it as complete, or save it for offline access if you have a poor internet connection.</Text>
                    {submissionError && (
                        <View>
                            <Text>Submission Error:</Text>
                            <Text>{submissionError}</Text>
                        </View>
                    )}
                </View>
            </ConfirmationModal>
          </>
      )}
      </View>
    </AutoSaveFormWrapper>
  );
};

export default PositiveDsaForm;