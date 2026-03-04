import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useTask } from '../../hooks/useTask';
import { PhotoGallery } from '../../components/media/PhotoGallery';
import { DatabaseService } from '../../database/DatabaseService';
import { DynamicFormBuilder } from './DynamicFormBuilder';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import type { FormTemplate, FormFieldCondition, FormFieldTemplate } from '../../types/api';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { useTaskManager } from '../../context/TaskContext';
import {
  resolveFormTypeKey,
  toBackendFormType as toBackendFormTypeKey,
  type FormTypeKey,
} from '../../utils/formTypeKey';

type ResidenceOutcome = 'POSITIVE' | 'SHIFTED' | 'NSP' | 'ENTRY_RESTRICTED' | 'UNTRACEABLE';
type NormalizedOutcome = ResidenceOutcome | 'NEGATIVE';

const normalizeOutcome = (rawOutcome?: string | null): NormalizedOutcome => {
  const value = String(rawOutcome || '').trim().toUpperCase();
  if (!value) {
    return 'POSITIVE';
  }
  if (value.includes('SHIFTED')) {
    return 'SHIFTED';
  }
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) {
    return 'NSP';
  }
  if (value === 'ERT' || value.includes('ENTRY') || value.includes('RESTRICT')) {
    return 'ENTRY_RESTRICTED';
  }
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) {
    return 'UNTRACEABLE';
  }
  if (value.includes('NEGATIVE') || value.includes('NOT VERIFIED')) {
    return 'NEGATIVE';
  }
  return 'POSITIVE';
};

type ResidenceFieldInput = Omit<FormFieldTemplate, 'id' | 'order'> & { id?: string };

const COMMON_LEGACY_OUTCOMES: readonly ResidenceOutcome[] = [
  'POSITIVE',
  'SHIFTED',
  'NSP',
  'ENTRY_RESTRICTED',
  'UNTRACEABLE',
];

const LEGACY_OUTCOMES_BY_FORM_TYPE: Record<FormTypeKey, readonly ResidenceOutcome[]> = {
  residence: COMMON_LEGACY_OUTCOMES,
  'residence-cum-office': COMMON_LEGACY_OUTCOMES,
  office: COMMON_LEGACY_OUTCOMES,
  business: COMMON_LEGACY_OUTCOMES,
  builder: COMMON_LEGACY_OUTCOMES,
  noc: COMMON_LEGACY_OUTCOMES,
  'dsa-connector': COMMON_LEGACY_OUTCOMES,
  'property-individual': ['POSITIVE', 'NSP', 'ENTRY_RESTRICTED', 'UNTRACEABLE'],
  'property-apf': ['POSITIVE', 'ENTRY_RESTRICTED', 'UNTRACEABLE'],
};

const getAllowedOutcomes = (formTypeKey: FormTypeKey | null): readonly ResidenceOutcome[] => {
  if (!formTypeKey) {
    return COMMON_LEGACY_OUTCOMES;
  }
  return LEGACY_OUTCOMES_BY_FORM_TYPE[formTypeKey];
};

const coerceOutcomeForFormType = (
  formTypeKey: FormTypeKey | null,
  rawOutcome?: string | null,
): ResidenceOutcome => {
  const normalizedOutcome = normalizeOutcome(rawOutcome);
  const allowedOutcomes = getAllowedOutcomes(formTypeKey);

  if (normalizedOutcome === 'NEGATIVE') {
    return allowedOutcomes.includes('NSP') ? 'NSP' : 'POSITIVE';
  }

  if (allowedOutcomes.includes(normalizedOutcome)) {
    return normalizedOutcome;
  }

  return allowedOutcomes[0] || 'POSITIVE';
};

const legacyResidenceSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  houseStatus: ['Opened', 'Closed'],
  roomStatus: ['Opened', 'Closed'],
  metPersonRelation: ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Self', 'Other'],
  workingStatus: ['Salaried', 'Self Employed', 'House Wife'],
  stayingStatus: [
    'On a Owned Basis',
    'On a Rental Basis',
    'On a Parental Owned Basis',
    'On a Relative Basis',
    'On a Pagadi System',
    'In the Staff Quarters',
    'As a Paying Guest',
    'On a Company Accomodation',
    'In the Bachelor Accommodation',
    'In the Hostel',
  ],
  documentShownStatus: ['Showed', 'Did Not Showed Any Document'],
  documentType: ['Electricity Bill', 'Adhar Card', 'Pan Card', 'Passport', 'Rent Deed'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  locality: [
    'Tower / Building',
    'Row House',
    'Bunglow',
    'Independent House',
    'Chawl / Slum',
    'Patra Shed',
    'Single House',
  ],
  doorNamePlateStatus: ['Sighted', 'As / Not Sighted'],
  societyNamePlateStatus: ['Sighted', 'As / Not Sighted'],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  metPersonStatus: ['Owner', 'Tenant'],
  premisesStatus: ['Vacant', 'Rented'],
  metPerson: ['Security', 'Receptionist'],
  metPersonConfirmation: ['Confirmed', 'Not Confirmed'],
  applicantStayingStatus: [
    'Applicant is Staying At',
    'Applicant is Shifted From',
    'No Such Person Staying At',
  ],
  callRemark: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyResidenceOptionAliases: Record<string, string> = {
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
};

const legacyCondition = (
  field: string,
  operator: FormFieldCondition['operator'],
  value?: unknown,
): FormFieldCondition => ({
  field,
  operator,
  value,
});

const withLegacyResidenceOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyResidenceOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? (legacyResidenceSelectOptions[optionKey] || []).map(value => ({ label: value, value }))
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveResidenceFields = withLegacyResidenceOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'houseStatus', label: 'House Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person Name', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'metPersonRelation', label: 'Relation', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'totalFamilyMembers', label: 'Total Family Members', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'totalEarning', label: 'Total Earning', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'workingStatus', label: 'Working Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'companyName', label: 'Company Name', type: 'text', conditional: legacyCondition('workingStatus', 'notIn', ['', null, 'House Wife']), requiredWhen: legacyCondition('workingStatus', 'notIn', ['', null, 'House Wife']) },
  { name: 'stayingPeriod', label: 'Staying Period', type: 'text', required: true },
  { name: 'stayingStatus', label: 'Staying Status', type: 'select', required: true },
  { name: 'approxArea', label: 'Approx Area (Sq. Feet)', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'documentShownStatus', label: 'Document Shown Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'documentType', label: 'Document Type', type: 'select', conditional: legacyCondition('documentShownStatus', 'equals', 'Showed'), requiredWhen: legacyCondition('documentShownStatus', 'equals', 'Showed') },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  { name: 'nameOnSocietyBoard', label: 'Name on Society Board', type: 'text', conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted') },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyShiftedResidenceFields = withLegacyResidenceOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'roomStatus', label: 'Room Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person', type: 'text', conditional: legacyCondition('roomStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('roomStatus', 'equals', 'Opened') },
  { name: 'metPersonStatus', label: 'Met Person Status', type: 'select', conditional: legacyCondition('roomStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('roomStatus', 'equals', 'Opened') },
  { name: 'shiftedPeriod', label: 'Shifted Period', type: 'text', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'premisesStatus', label: 'Premises Status', type: 'select', conditional: legacyCondition('roomStatus', 'equals', 'Closed'), requiredWhen: legacyCondition('roomStatus', 'equals', 'Closed') },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressFloor', label: 'Address Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  { name: 'nameOnSocietyBoard', label: 'Name on Society Board', type: 'text', conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted') },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyNspResidenceFields = withLegacyResidenceOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'houseStatus', label: 'House Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'metPersonStatus', label: 'Met Person Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'stayingPeriod', label: 'Staying Period', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'stayingPersonName', label: 'Staying Person Name', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Closed'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Closed') },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  { name: 'nameOnSocietyBoard', label: 'Name on Society Board', type: 'text', conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted') },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyEntryRestrictedResidenceFields = withLegacyResidenceOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'metPersonConfirmation', label: 'Met Person Confirmation', type: 'select', required: true },
  { name: 'applicantStayingStatus', label: 'Applicant Staying Status', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  { name: 'nameOnSocietyBoard', label: 'Name on Society Board', type: 'text', conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted') },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyUntraceableResidenceFields = withLegacyResidenceOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const normalizedResidenceOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyResidenceFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveResidenceFields,
  SHIFTED: legacyShiftedResidenceFields,
  NSP: legacyNspResidenceFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedResidenceFields,
  UNTRACEABLE: legacyUntraceableResidenceFields,
};

const buildLegacyResidenceTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedResidenceOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-residence-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Residence Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Residence form definition',
    sections: [
      {
        id: `residence-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyResidenceFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const toSelectOptions = (values: string[]) =>
  values.map(value => ({ label: value, value }));

const legacyResiCumOfficeSelectOptions: Record<string, string[]> = {
  addressTraceable: ['Traceable', 'Untraceable'],
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  resiCumOfficeStatus: ['Opened', 'Closed'],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  relationResiCumOffice: [
    'Self',
    'Mother',
    'Father',
    'Wife',
    'Son',
    'Daughter',
    'Sister',
    'Brother',
    'Aunty',
    'Uncle',
    'Mother in Law',
    'Father in Law',
    'Daughter in Law',
    'Sister in Law',
    'Brother in Law',
    'Other',
  ],
  stayingStatus: [
    'On a Owned Basis',
    'On a Rental Basis',
    'On a Parental Owned Basis',
    'On a Relative Basis',
    'On a Pagadi System',
    'In the Staff Quarters',
    'As a Paying Guest',
    'On a Company Accomodation',
    'In the Bachelor Accommodation',
    'In the Hostel',
  ],
  businessStatusResiCumOffice: ['Self Employee', 'Proprietorship', 'Partnership Firm', 'NA'],
  businessLocation: ['At Same Address', 'From Different Address'],
  documentShownStatus: ['Showed', 'Did Not Showed Any Document'],
  documentType: ['Electricity Bill', 'Adhar Card', 'Pan Card', 'Passport', 'Rent Deed'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  metPersonStatusShifted: ['Owner', 'Tenant'],
  metPersonErt: ['Security', 'Receptionist'],
  applicantStayingStatusErt: [
    'Applicant is Staying At',
    'Applicant is Shifted From',
    'No Such Person Staying At',
  ],
  businessStatusErtResiCumOffice: [
    'Office Exist At',
    'Office Does Not Exist At',
    'Office Shifted From',
  ],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyResiCumOfficeOptionAliases: Record<string, string> = {
  residenceSetup: 'sightStatus',
  businessSetup: 'sightStatus',
  doorNamePlateStatus: 'sightStatus',
  societyNamePlateStatus: 'sightStatus',
  companyNamePlateStatus: 'sightStatus',
  relation: 'relationResiCumOffice',
  businessStatus: 'businessStatusResiCumOffice',
  locality: 'localityResiCumOffice',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  metPersonStatus: 'metPersonStatusShifted',
  metPerson: 'metPersonErt',
  applicantStayingStatus: 'applicantStayingStatusErt',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyResiCumOfficeOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyResiCumOfficeOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyResiCumOfficeSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'resiCumOfficeStatus', label: 'Resi-cum-Office Status', type: 'select', required: true },
  { name: 'residenceSetup', label: 'Residence Setup', type: 'select', required: true },
  { name: 'businessSetup', label: 'Business Setup', type: 'select', required: true },
  { name: 'stayingPeriod', label: 'Staying Period', type: 'text', required: true },
  { name: 'stayingStatus', label: 'Staying Status', type: 'select', required: true },
  { name: 'companyNatureOfBusiness', label: 'Company Nature of Business', type: 'text', required: true },
  { name: 'businessPeriod', label: 'Business Period', type: 'text', required: true },
  { name: 'businessStatus', label: 'Business Status', type: 'select', required: true },
  { name: 'businessLocation', label: 'Business Location', type: 'select', required: true },
  {
    name: 'businessOperatingAddress',
    label: 'Business Operating Address',
    type: 'text',
    conditional: legacyCondition('businessLocation', 'equals', 'From Different Address'),
    requiredWhen: legacyCondition('businessLocation', 'equals', 'From Different Address'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'tpcName1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'tpcName2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'relation',
    label: 'Relation',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'documentShownStatus',
    label: 'Document Shown Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'documentType',
    label: 'Document Type',
    type: 'select',
    conditional: legacyCondition('documentShownStatus', 'equals', 'Showed'),
    requiredWhen: legacyCondition('documentShownStatus', 'equals', 'Showed'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyShiftedResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'resiCumOfficeStatus', label: 'Resi-cum-Office Status', type: 'select', required: true },
  { name: 'shiftedPeriod', label: 'Shifted Period', type: 'text', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'tpcName1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'tpcName2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressFloor', label: 'Address Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  { name: 'addressTraceable', label: 'Address Traceable', type: 'select', required: true },
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'resiCumOfficeStatus', label: 'Resi-cum-Office Status', type: 'select', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'tpcName1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'tpcName2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'stayingPeriod',
    label: 'Staying Period',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'stayingPersonName',
    label: 'Staying Person Name',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Closed'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Closed'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  { name: 'metPersonConfirmation', label: 'Met Person Confirmation', type: 'select', required: true },
  { name: 'applicantStayingStatus', label: 'Applicant Staying Status', type: 'select', required: true },
  {
    name: 'businessStatus',
    label: 'Business Status',
    type: 'select',
    required: true,
    options: toSelectOptions(legacyResiCumOfficeSelectOptions.businessStatusErtResiCumOffice),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate Status', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceableResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyResiCumOfficeFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveResiCumOfficeFields,
  SHIFTED: legacyShiftedResiCumOfficeFields,
  NSP: legacyNspResiCumOfficeFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedResiCumOfficeFields,
  UNTRACEABLE: legacyUntraceableResiCumOfficeFields,
};

const buildLegacyResidenceCumOfficeTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedResidenceOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-residence-cum-office-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Residence Cum Office Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Residence-cum-Office form definition',
    sections: [
      {
        id: `residence-cum-office-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyResiCumOfficeFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyOfficeSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  officeStatus: ['Opened', 'Closed', 'Shifted'],
  designationOffice: ['Manager', 'Executive', 'Clerk', 'Developer', 'Analyst', 'Assistant', 'Other'],
  designationShiftedOffice: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager / H.R.',
    'SR. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
  workingStatusOffice: ['Company Payroll', 'Third Party Payroll', 'Contract Payroll'],
  applicantWorkingPremisesOffice: ['Same Location', 'Different Location'],
  officeType: [
    'PVT. LTD. Company',
    'LTD. Company',
    'LLP Company',
    'Govt. Office',
    'Proprietorship Firm',
    'Partnership Firm',
    'Public Ltd. Company',
  ],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  officeExistence: ['Exist', 'Does Not Exist'],
  metPersonErt: ['Security', 'Receptionist'],
  officeStatusErtOffice: ['Office Exist At', 'Office Does Not Exist At', 'Office Shifted From'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyOfficeOptionAliases: Record<string, string> = {
  designation: 'designationOffice',
  workingStatus: 'workingStatusOffice',
  applicantWorkingPremises: 'applicantWorkingPremisesOffice',
  companyNamePlateStatus: 'sightStatus',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  locality: 'localityResiCumOffice',
  officeExistence: 'officeExistence',
  metPerson: 'metPersonErt',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyOfficeOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyOfficeOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyOfficeSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveOfficeFields = withLegacyOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'establishmentPeriod', label: 'Establishment Period', type: 'text', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'workingPeriod',
    label: 'Working Period',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'applicantDesignation',
    label: 'Applicant Designation',
    type: 'select',
    options: toSelectOptions(legacyOfficeSelectOptions.designationOffice),
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'workingStatus',
    label: 'Working Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'applicantWorkingPremises',
    label: 'Applicant Working Premises',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'sittingLocation',
    label: 'Sitting Location',
    type: 'text',
    conditional: legacyCondition('applicantWorkingPremises', 'equals', 'Different Location'),
    requiredWhen: legacyCondition('applicantWorkingPremises', 'equals', 'Different Location'),
  },
  {
    name: 'officeType',
    label: 'Office Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'documentShown',
    label: 'Document Shown',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyShiftedOfficeFields = withLegacyOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'currentCompanyName', label: 'Current Company Name', type: 'text', required: true },
  { name: 'currentCompanyPeriod', label: 'Current Company Period', type: 'text', required: true },
  { name: 'oldOfficeShiftedPeriod', label: 'Old Office Shifted Period', type: 'text', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    options: toSelectOptions(legacyOfficeSelectOptions.designationShiftedOffice),
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspOfficeFields = withLegacyOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'officeExistence', label: 'Office Existence', type: 'select', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    options: toSelectOptions(legacyOfficeSelectOptions.designationShiftedOffice),
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedOfficeFields = withLegacyOfficeOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyOfficeSelectOptions.tpcConfirmation),
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    options: toSelectOptions(legacyOfficeSelectOptions.officeStatusErtOffice),
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'officeExistFloor', label: 'Office Exist Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceableOfficeFields = withLegacyOfficeOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedOfficeOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyOfficeFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveOfficeFields,
  SHIFTED: legacyShiftedOfficeFields,
  NSP: legacyNspOfficeFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedOfficeFields,
  UNTRACEABLE: legacyUntraceableOfficeFields,
};

const buildLegacyOfficeTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedOfficeOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-office-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Office Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Office form definition',
    sections: [
      {
        id: `office-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyOfficeFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyBusinessSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  officeStatus: ['Opened', 'Closed', 'Shifted'],
  designationShiftedOffice: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager / H.R.',
    'SR. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
  businessType: [
    'PVT. LTD. Company',
    'LTD. Company',
    'LLP Company',
    'Proprietorship Firm',
    'Partnership Firm',
  ],
  ownershipType: ['Are Partners', 'Are Directors', 'Is Proprietor'],
  addressStatus: ['On a Self Owned Basis', 'On a Rental Basis', 'On a Pagadi System', 'In Share Work Place'],
  premisesStatusBusiness: ['Vacant', 'Rented To', 'Owned By'],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  metPersonErt: ['Security', 'Receptionist'],
  officeStatusErtBusiness: ['Business Exist At', 'Business Does Not Exist At', 'Business Shifted From'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyBusinessOptionAliases: Record<string, string> = {
  designation: 'designationShiftedOffice',
  companyNamePlateStatus: 'sightStatus',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  locality: 'localityResiCumOffice',
  premisesStatus: 'premisesStatusBusiness',
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  metPerson: 'metPersonErt',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyBusinessOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyBusinessOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyBusinessSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveBusinessFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'companyNatureOfBusiness', label: 'Company Nature of Business', type: 'text', required: true },
  { name: 'businessPeriod', label: 'Business Period', type: 'text', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'documentShown', label: 'Document Shown', type: 'text', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfCompanyOwners',
    label: 'Name of Company Owners',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'ownershipType',
    label: 'Ownership Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'addressStatus',
    label: 'Address Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyShiftedBusinessFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'oldOfficeShiftedPeriod', label: 'Old Office Shifted Period', type: 'text', required: true },
  { name: 'tpcMetPerson', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  {
    name: 'currentCompanyPeriod',
    label: 'Current Company Period',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspBusinessFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'businessExistance', label: 'Business Existance', type: 'select', required: true },
  { name: 'applicantExistance', label: 'Applicant Existance', type: 'select', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedBusinessFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyBusinessSelectOptions.tpcConfirmation),
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    options: toSelectOptions(legacyBusinessSelectOptions.officeStatusErtBusiness),
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceableBusinessFields = withLegacyBusinessOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Extra Remark', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedBusinessOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value === 'ERT' || value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyBusinessFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveBusinessFields,
  SHIFTED: legacyShiftedBusinessFields,
  NSP: legacyNspBusinessFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedBusinessFields,
  UNTRACEABLE: legacyUntraceableBusinessFields,
};

const buildLegacyBusinessTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedBusinessOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-business-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Business Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Business form definition',
    sections: [
      {
        id: `business-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyBusinessFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyUntraceableBuilderFields = withLegacyBusinessOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherExtraRemark', label: 'Other Extra Remark', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedBuilderOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyBuilderFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveBusinessFields,
  SHIFTED: legacyShiftedBusinessFields,
  NSP: legacyNspBusinessFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedBusinessFields,
  UNTRACEABLE: legacyUntraceableBuilderFields,
};

const buildLegacyBuilderTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedBuilderOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-builder-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Builder Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Builder form definition',
    sections: [
      {
        id: `builder-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyBuilderFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyNocSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  officeStatus: ['Opened', 'Closed', 'Shifted'],
  designationNoc: ['Chairman', 'Secretary', 'Treasurer', 'Society Manager', 'Proprietor', 'Partner', 'Director', 'Tenant', 'Other'],
  designationShiftedOffice: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager / H.R.',
    'SR. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  premisesStatusBusiness: ['Vacant', 'Rented To', 'Owned By'],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  metPersonErt: ['Security', 'Receptionist'],
  officeStatusErtNoc: ['Office Exist At', 'Office Does Not Exist At', 'Office Shifted From'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyNocOptionAliases: Record<string, string> = {
  designation: 'designationNoc',
  locality: 'localityResiCumOffice',
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  premisesStatus: 'premisesStatusBusiness',
  companyNamePlateStatus: 'sightStatus',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyNocOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyNocOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyNocSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveNocFields = withLegacyNocOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'authorisedSignature',
    label: 'Authorised Signature',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOnNoc',
    label: 'Name on NOC',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'flatNo',
    label: 'Flat / Shop / Office No.',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherExtraRemark', label: 'Other Extra Remark', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyShiftedNocFields = withLegacyNocOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'currentCompanyName', label: 'Current Company Name', type: 'text', required: true },
  { name: 'currentCompanyPeriod', label: 'Current Company Period', type: 'text', required: true },
  { name: 'oldOfficeShiftedPeriod', label: 'Old Office Shifted Period', type: 'text', required: true },
  { name: 'companyNamePlateStatus', label: 'Company Name Plate', type: 'select', required: true },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select', required: true },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', required: true },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspNocFields = withLegacyNocOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  {
    name: 'businessExistance',
    label: 'Business Existance',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existance',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: [
      legacyCondition('officeStatus', 'equals', 'Opened'),
      legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    ],
  },
  {
    name: 'tpcMetPerson1',
    label: 'TPC Met Person 1',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcMetPerson2',
    label: 'TPC Met Person 2',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.designationShiftedOffice),
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedNocFields = withLegacyNocOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.metPersonErt),
    required: true,
  },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.tpcConfirmation),
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.officeStatusErtNoc),
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceableNocFields = withLegacyNocOrder([
  { name: 'contactPerson', label: 'Contact Person', type: 'text', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherExtraRemark', label: 'Other Extra Remark', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedNocOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyNocFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveNocFields,
  SHIFTED: legacyShiftedNocFields,
  NSP: legacyNspNocFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedNocFields,
  UNTRACEABLE: legacyUntraceableNocFields,
};

const buildLegacyNocTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedNocOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-noc-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `NOC Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy NOC form definition',
    sections: [
      {
        id: `noc-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyNocFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyDsaSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  officeStatus: ['Opened', 'Closed', 'Shifted'],
  designationShiftedOffice: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager / H.R.',
    'SR. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
  businessType: [
    'PVT. LTD. Company',
    'LTD. Company',
    'LLP Company',
    'Proprietorship Firm',
    'Partnership Firm',
  ],
  ownershipType: ['Are Partners', 'Are Directors', 'Is Proprietor'],
  addressStatus: ['On a Self Owned Basis', 'On a Rental Basis', 'On a Pagadi System', 'In Share Work Place'],
  premisesStatusBusiness: ['Vacant', 'Rented To', 'Owned By'],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  metPersonErt: ['Security', 'Receptionist'],
  officeStatusErtDsa: ['Business Exist At', 'Business Does Not Exist At', 'Business Shifted From'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyDsaOptionAliases: Record<string, string> = {
  designation: 'designationShiftedOffice',
  companyNamePlateStatus: 'sightStatus',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  locality: 'localityResiCumOffice',
  premisesStatus: 'premisesStatusBusiness',
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  metPerson: 'metPersonErt',
  metPersonConfirmation: 'tpcConfirmation',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyDsaOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyDsaOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyDsaSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveDsaFields = withLegacyDsaOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'businessPeriod',
    label: 'Business Period',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  {
    name: 'tpcMetPerson1',
    label: 'TPC Met Person 1',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcMetPerson2',
    label: 'TPC Met Person 2',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfCompanyOwners',
    label: 'Name of Company Owners',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'ownershipType',
    label: 'Ownership Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'addressStatus',
    label: 'Address Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'activeClient',
    label: 'Active Client',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyShiftedDsaFields = withLegacyDsaOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'oldOfficeShiftedPeriod', label: 'Old Office Shifted Period', type: 'text', required: true },
  { name: 'tpcMetPerson', label: 'TPC Met Person 1', type: 'select', required: true },
  {
    name: 'nameOfTpc',
    label: 'Name of TPC 1',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  {
    name: 'currentCompanyPeriod',
    label: 'Current Company Period',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
    requiredWhen: legacyCondition('officeStatus', 'in', ['Opened', 'Closed']),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspDsaFields = withLegacyDsaOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  {
    name: 'businessExistance',
    label: 'Business Existance',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existance',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: [
      legacyCondition('officeStatus', 'equals', 'Opened'),
      legacyCondition('companyNamePlateStatus', 'equals', 'Sighted'),
    ],
  },
  {
    name: 'tpcMetPerson1',
    label: 'TPC Met Person 1',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC 1',
    type: 'text',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcMetPerson2',
    label: 'TPC Met Person 2',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC 2',
    type: 'text',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('premisesStatus', 'in', ['Rented To', 'Owned By']),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedDsaFields = withLegacyDsaOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'select',
    options: toSelectOptions(legacyDsaSelectOptions.metPersonErt),
    required: true,
  },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyDsaSelectOptions.tpcConfirmation),
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    options: toSelectOptions(legacyDsaSelectOptions.officeStatusErtDsa),
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceableDsaFields = withLegacyDsaOrder([
  { name: 'metPerson', label: 'Contact Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherExtraRemark', label: 'Other Extra Remark', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedDsaOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyDsaFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositiveDsaFields,
  SHIFTED: legacyShiftedDsaFields,
  NSP: legacyNspDsaFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedDsaFields,
  UNTRACEABLE: legacyUntraceableDsaFields,
};

const buildLegacyDsaTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedDsaOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-dsa-connector-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `DSA DST & Connector Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy DSA/DST/Connector form definition',
    sections: [
      {
        id: `dsa-connector-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyDsaFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyPropertyApfSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  buildingStatusApf: [
    'New Construction',
    'Redeveloped Construction',
    'Under Construction',
    'Vacant Place',
  ],
  relationshipApf: [
    'Self',
    'Mother',
    'Father',
    'Wife',
    'Son',
    'Daughter',
    'Sister',
    'Brother',
    'Aunty',
    'Uncle',
    'Mother in Law',
    'Father in Law',
    'Daughter in Law',
    'Sister in Law',
    'Brother in Law',
    'Other',
  ],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  metPersonErt: ['Security', 'Receptionist'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
  constructionActivity: ['SEEN', 'CONSTRUCTION IS STOP', 'PLOT IS VACANT'],
  companyNameBoard: ['SIGHTED AS', 'NOT SIGHTED'],
};

const legacyPropertyApfOptionAliases: Record<string, string> = {
  buildingStatus: 'buildingStatusApf',
  relationship: 'relationshipApf',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  locality: 'localityResiCumOffice',
  doorNamePlateStatus: 'sightStatus',
  societyNamePlateStatus: 'sightStatus',
  callRemark: 'callRemarkUntraceable',
  metPerson: 'metPersonErt',
};

const withLegacyPropertyApfOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyPropertyApfOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyPropertyApfSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositivePropertyApfFields = withLegacyPropertyApfOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'constructionActivity', label: 'Construction Activity', type: 'select', required: true },
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'activityStopReason',
    label: 'Activity Stop Reason',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectName',
    label: 'Project Name',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectStartedDate',
    label: 'Project Started Date',
    type: 'date',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectCompletionDate',
    label: 'Project Completion Date',
    type: 'date',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'totalWing',
    label: 'Total Wing',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'totalFlats',
    label: 'Total Flats',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectCompletionPercent',
    label: 'Project Completion %',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    id: 'constructionStopNameOnBoard',
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'relationship',
    label: 'Relationship',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'propertyOwnerName',
    label: 'Property Owner Name',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'approxArea',
    label: 'Approx Area',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select', required: true },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', required: true },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'companyNameBoard', label: 'Company Name Board', type: 'select' },
  {
    id: 'companyBoardNameOnBoard',
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
  },
  { name: 'totalBuildingsInProject', label: 'Total Buildings in Project', type: 'number' },
  { id: 'projectInfoTotalFlats', name: 'totalFlats', label: 'Total Flats in Building', type: 'number' },
  { id: 'projectInfoStartDate', name: 'projectStartedDate', label: 'Project Start Date', type: 'date' },
  { id: 'projectInfoEndDate', name: 'projectCompletionDate', label: 'Project End Date', type: 'date' },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspPropertyApfFields = withLegacyPropertyApfOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'constructionActivity', label: 'Construction Activity', type: 'select', required: true },
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'activityStopReason',
    label: 'Activity Stop Reason',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectName',
    label: 'Project Name',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectStartedDate',
    label: 'Project Started Date',
    type: 'date',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectCompletionDate',
    label: 'Project Completion Date',
    type: 'date',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'totalWing',
    label: 'Total Wing',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'totalFlats',
    label: 'Total Flats',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'projectCompletionPercent',
    label: 'Project Completion %',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    id: 'constructionStopNameOnBoard',
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'CONSTRUCTION IS STOP'),
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'relationship',
    label: 'Relationship',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'propertyOwnerName',
    label: 'Property Owner Name',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select', required: true },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', required: true },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'companyNameBoard', label: 'Company Name Board', type: 'select' },
  {
    id: 'companyBoardNameOnBoard',
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
  },
  { name: 'totalBuildingsInProject', label: 'Total Buildings in Project', type: 'number' },
  { id: 'projectInfoTotalFlats', name: 'totalFlats', label: 'Total Flats in Building', type: 'number' },
  { id: 'projectInfoStartDate', name: 'projectStartedDate', label: 'Project Start Date', type: 'date' },
  { id: 'projectInfoEndDate', name: 'projectCompletionDate', label: 'Project End Date', type: 'date' },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedPropertyApfFields = withLegacyPropertyApfOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'select',
    options: toSelectOptions(legacyPropertyApfSelectOptions.metPersonErt),
    required: true,
  },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyPropertyApfSelectOptions.tpcConfirmation),
    required: true,
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'nameOfTpc1', label: 'TPC Name 1', type: 'text' },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'nameOfTpc2', label: 'TPC Name 2', type: 'text' },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'societyNamePlateStatus', label: 'Company Name Board', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceablePropertyApfFields = withLegacyPropertyApfOrder([
  { name: 'metPerson', label: 'Contact Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedPropertyApfOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  if (value.includes('NSP') || value.includes('NEGATIVE') || value.includes('SHIFTED')) return 'NSP';
  return 'POSITIVE';
};

const legacyPropertyApfFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositivePropertyApfFields,
  SHIFTED: legacyNspPropertyApfFields,
  NSP: legacyNspPropertyApfFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedPropertyApfFields,
  UNTRACEABLE: legacyUntraceablePropertyApfFields,
};

const buildLegacyPropertyApfTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedPropertyApfOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-property-apf-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Property APF Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Property APF form definition',
    sections: [
      {
        id: `property-apf-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyPropertyApfFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const legacyPropertyIndividualSelectOptions: Record<string, string[]> = {
  addressLocatable: ['Easy to Locate', 'Difficult to Locate', 'Poor to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  buildingStatusApf: [
    'New Construction',
    'Redeveloped Construction',
    'Under Construction',
    'Vacant Place',
  ],
  flatStatusApf: ['Open', 'Closed'],
  relationshipApf: [
    'Self',
    'Mother',
    'Father',
    'Wife',
    'Son',
    'Daughter',
    'Sister',
    'Brother',
    'Aunty',
    'Uncle',
    'Mother in Law',
    'Father in Law',
    'Daughter in Law',
    'Sister in Law',
    'Brother in Law',
    'Other',
  ],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
    'Bunglow',
    'Shop Line',
    'Row House',
    'Single House',
    'Chawl / Slum',
    'Patra Shed',
    'Gala / Godown',
    'Tea Stall',
    'Sharing Office',
    'Road Side',
    'Govt. Office',
    'Bank',
    'Cabin',
    'Table Space',
  ],
  sightStatus: ['Sighted', 'As / Not Sighted'],
  politicalConnection: ['Having Political Connection', 'Not Having Political Connection'],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud', 'Hold'],
  metPersonErt: ['Security', 'Receptionist'],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
};

const legacyPropertyIndividualOptionAliases: Record<string, string> = {
  buildingStatus: 'buildingStatusApf',
  flatStatus: 'flatStatusApf',
  relationship: 'relationshipApf',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  locality: 'localityResiCumOffice',
  doorNamePlateStatus: 'sightStatus',
  societyNamePlateStatus: 'sightStatus',
  metPerson: 'metPersonErt',
  metPersonConfirmation: 'tpcConfirmation',
  callRemark: 'callRemarkUntraceable',
};

const withLegacyPropertyIndividualOrder = (fields: ResidenceFieldInput[]): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyPropertyIndividualOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
        ? toSelectOptions(legacyPropertyIndividualSelectOptions[optionKey] || [])
        : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositivePropertyIndividualFields = withLegacyPropertyIndividualOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'buildingStatus', label: 'Building Status', type: 'select', required: true },
  { name: 'flatStatus', label: 'Flat Status', type: 'select', required: true },
  { name: 'propertyOwnerName', label: 'Property Owner Name', type: 'text', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  {
    name: 'relationship',
    label: 'Relationship',
    type: 'select',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select', required: true },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', required: true },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressExistAt', label: 'Address Exist At (Floor)', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyNspPropertyIndividualFields = withLegacyPropertyIndividualOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'buildingStatus', label: 'Building Status', type: 'select', required: true },
  { name: 'flatStatus', label: 'Flat Status', type: 'select', required: true },
  { name: 'propertyOwnerName', label: 'Property Owner Name', type: 'text', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  {
    name: 'relationship',
    label: 'Relationship',
    type: 'text',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select', required: true },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', required: true },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select', required: true },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'text', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyEntryRestrictedPropertyIndividualFields = withLegacyPropertyIndividualOrder([
  { name: 'addressLocatable', label: 'Address Locatable', type: 'select', required: true },
  { name: 'addressRating', label: 'Address Rating', type: 'select', required: true },
  { name: 'flatStatus', label: 'Flat Status', type: 'select', required: true },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'select',
    options: toSelectOptions(legacyPropertyIndividualSelectOptions.metPersonErt),
    required: true,
  },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    options: toSelectOptions(legacyPropertyIndividualSelectOptions.tpcConfirmation),
    required: true,
  },
  { name: 'propertyOwnerName', label: 'Property Owner Name', type: 'text', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'text', required: true },
  { name: 'societyNamePlateStatus', label: 'Society Name Plate', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'buildingStatus', label: 'Building Status', type: 'select', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const legacyUntraceablePropertyIndividualFields = withLegacyPropertyIndividualOrder([
  { name: 'metPerson', label: 'Met Person', type: 'text', required: true },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  {
    name: 'holdReason',
    label: 'Reason for Hold',
    type: 'text',
    conditional: legacyCondition('finalStatus', 'equals', 'Hold'),
    requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold'),
  },
]);

const normalizedPropertyIndividualOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  if (value.includes('NSP') || value.includes('PERSON NOT MET') || value.includes('NEGATIVE') || value.includes('SHIFTED')) return 'NSP';
  return 'POSITIVE';
};

const legacyPropertyIndividualFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositivePropertyIndividualFields,
  SHIFTED: legacyNspPropertyIndividualFields,
  NSP: legacyNspPropertyIndividualFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedPropertyIndividualFields,
  UNTRACEABLE: legacyUntraceablePropertyIndividualFields,
};

const buildLegacyPropertyIndividualTemplate = (
  verificationType: string,
  outcome: string,
): FormTemplate => {
  const normalizedOutcome = normalizedPropertyIndividualOutcome(outcome);
  const now = new Date().toISOString();

  return {
    id: `legacy-property-individual-${normalizedOutcome.toLowerCase()}`,
    formType: verificationType,
    verificationType,
    outcome: normalizedOutcome,
    name: `Property Individual Verification - ${normalizedOutcome.split('_').join(' ')}`,
    description: 'Loaded from native legacy Property Individual form definition',
    sections: [
      {
        id: `property-individual-${normalizedOutcome.toLowerCase()}-main`,
        title: 'Verification Details',
        description: '',
        order: 1,
        fields: legacyPropertyIndividualFieldsByOutcome[normalizedOutcome],
      },
    ],
    version: 'legacy-1.0',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const evaluateCondition = (
  condition: FormFieldCondition,
  values: Record<string, unknown>,
): boolean => {
  const actual = values[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case 'equals': return actual === expected;
    case 'notEquals': return actual !== expected;
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected);
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'notContains':
      if (Array.isArray(actual)) return !actual.includes(expected);
      return !String(actual ?? '').includes(String(expected ?? ''));
    case 'greaterThan': return Number(actual) > Number(expected);
    case 'lessThan': return Number(actual) < Number(expected);
    case 'in': return toArray(expected).includes(actual);
    case 'notIn': return !toArray(expected).includes(actual);
    case 'isTruthy': return !isEmptyValue(actual) && !!actual;
    case 'isFalsy': return isEmptyValue(actual) || !actual;
    default: return true;
  }
};

const validateTemplateRequiredFields = (
  currentTemplate: FormTemplate,
  values: Record<string, unknown>,
): { isValid: boolean; missingFields: string[] } => {
  const missingFields: string[] = [];

  for (const section of currentTemplate.sections) {
    if (section.conditional && !evaluateCondition(section.conditional, values)) {
      continue;
    }

    for (const field of section.fields) {
      if (field.conditional && !evaluateCondition(field.conditional, values)) {
        continue;
      }

      const requiredByDefault = Boolean(field.required);
      const requiredWhen = Array.isArray(field.requiredWhen)
        ? field.requiredWhen.every(condition => evaluateCondition(condition, values))
        : field.requiredWhen
          ? evaluateCondition(field.requiredWhen, values)
          : false;

      if ((requiredByDefault || requiredWhen) && isEmptyValue(values[field.id])) {
        missingFields.push(field.label);
      }
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
};

const buildTemplateFromBackend = (
  verificationType: string,
  outcome: string,
  data: any,
): FormTemplate => {
  const now = new Date().toISOString();
  const fields = Array.isArray(data?.fields) ? data.fields : [];

  return {
    id: `backend-${verificationType}-${outcome}`,
    formType: verificationType,
    verificationType,
    outcome,
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
            ...field,
            id: field.name,
            label: field.label || field.name,
            type:
              field.type === 'boolean'
                ? 'checkbox'
                : field.type === 'number'
                  ? 'number'
                  : field.type === 'textarea'
                    ? 'textarea'
                    : field.type === 'select' && Array.isArray(field.options) && field.options.length > 0
                      ? 'select'
                      : 'text',
            name: field.name,
            order: index + 1,
            required: !!field.required,
            options: Array.isArray(field.options)
              ? field.options.map((option: any) => ({
                  label: typeof option === 'string' ? option : String(option?.label ?? option?.value ?? ''),
                  value: typeof option === 'string' ? option : String(option?.value ?? option?.label ?? ''),
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
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<ResidenceOutcome | null>(null);
  const outcomeOptions = React.useMemo(() => {
    const colorByOutcome: Record<ResidenceOutcome, string> = {
      POSITIVE: theme.colors.success,
      SHIFTED: theme.colors.warning,
      NSP: theme.colors.info,
      ENTRY_RESTRICTED: theme.colors.primary,
      UNTRACEABLE: theme.colors.textMuted,
    };
    const labelByOutcome: Record<ResidenceOutcome, string> = {
      POSITIVE: 'Positive',
      SHIFTED: 'Shifted',
      NSP: 'NSP',
      ENTRY_RESTRICTED: 'Entry Restricted',
      UNTRACEABLE: 'Untraceable',
    };
    const iconByOutcome: Record<ResidenceOutcome, string> = {
      POSITIVE: 'checkmark-circle-outline',
      SHIFTED: 'swap-horizontal-outline',
      NSP: 'person-remove-outline',
      ENTRY_RESTRICTED: 'hand-left-outline',
      UNTRACEABLE: 'locate-outline',
    };

    return getAllowedOutcomes(taskFormTypeKey).map(outcome => ({
      value: outcome,
      label: labelByOutcome[outcome],
      icon: iconByOutcome[outcome],
      color: colorByOutcome[outcome],
    }));
  }, [taskFormTypeKey, theme.colors.info, theme.colors.primary, theme.colors.success, theme.colors.textMuted, theme.colors.warning]);

  // Sync state once task is loaded
  useEffect(() => {
    if (task && taskFormTypeKey && !selectedOutcome && task.verificationOutcome) {
      setSelectedOutcome(coerceOutcomeForFormType(taskFormTypeKey, task.verificationOutcome));
    }
  }, [task, taskFormTypeKey, selectedOutcome]);

  // Keep selected outcome valid for the current verification type.
  useEffect(() => {
    if (!selectedOutcome || !taskFormTypeKey) {
      return;
    }

    const allowedOutcomes = getAllowedOutcomes(taskFormTypeKey);
    if (!allowedOutcomes.includes(selectedOutcome)) {
      setSelectedOutcome(coerceOutcomeForFormType(taskFormTypeKey, selectedOutcome));
    }
  }, [selectedOutcome, taskFormTypeKey]);

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
        } else if (isMounted && taskFormTypeKey) {
          const savedDraft = await getAutoSavedForm(task.id, taskFormTypeKey);
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
  }, [getAutoSavedForm, isInitialized, task, taskFormTypeKey, updateTaskFormData]);

  // Auto-Save Draft
  useEffect(() => {
    if (!task?.id || !isInitialized || Object.keys(formValues).length === 0) return;

    const draftAutoSave = async () => {
      try {
        await updateTaskFormData(task.id, formValues);
        await persistAutoSave(task.id, {
          formType: taskFormTypeKey || 'DEFAULT',
          formData: formValues,
        });
      } catch (e) {
        console.error('AutoSave Error', e);
      }
    };

    const timeoutId = setTimeout(draftAutoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [formValues, isInitialized, persistAutoSave, task?.id, taskFormTypeKey, updateTaskFormData]);

  // 1. Fetch exactly the right template for this task when loaded and outcome is set
  useEffect(() => {
    if (!task || !taskFormTypeKey || !selectedOutcome) return;
    
    const loadTemplate = async () => {
      setTemplateLoading(true);
      try {
        const verificationType = taskFormTypeKey;
        const normalizedOutcome = coerceOutcomeForFormType(verificationType, selectedOutcome);

        switch (verificationType) {
          case 'residence':
            setTemplate(buildLegacyResidenceTemplate(verificationType, normalizedOutcome));
            return;
          case 'residence-cum-office':
            setTemplate(buildLegacyResidenceCumOfficeTemplate(verificationType, normalizedOutcome));
            return;
          case 'office':
            setTemplate(buildLegacyOfficeTemplate(verificationType, normalizedOutcome));
            return;
          case 'business':
            setTemplate(buildLegacyBusinessTemplate(verificationType, normalizedOutcome));
            return;
          case 'builder':
            setTemplate(buildLegacyBuilderTemplate(verificationType, normalizedOutcome));
            return;
          case 'noc':
            setTemplate(buildLegacyNocTemplate(verificationType, normalizedOutcome));
            return;
          case 'dsa-connector':
            setTemplate(buildLegacyDsaTemplate(verificationType, normalizedOutcome));
            return;
          case 'property-individual':
            setTemplate(buildLegacyPropertyIndividualTemplate(verificationType, normalizedOutcome));
            return;
          case 'property-apf':
            setTemplate(buildLegacyPropertyApfTemplate(verificationType, normalizedOutcome));
            return;
          default:
            break;
        }

        const rows = await DatabaseService.query<any>(
          `SELECT sections_json, name, description FROM form_templates 
           WHERE verification_type = ? AND outcome = ? AND is_active = 1 LIMIT 1`,
          [verificationType, normalizedOutcome]
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
            outcome: normalizedOutcome,
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

        const backendFormType = toBackendFormTypeKey(verificationType);
        const response = await ApiClient.get<{ success: boolean; data?: any }>(
          ENDPOINTS.FORMS.TEMPLATE(backendFormType),
          { params: { outcome: normalizedOutcome } },
        );

        if (!response.success || !response.data) {
          return;
        }

        const backendTemplate = buildTemplateFromBackend(verificationType, normalizedOutcome, response.data);
        const now = new Date().toISOString();

        await DatabaseService.execute(
          `INSERT OR REPLACE INTO form_templates 
            (id, form_type, verification_type, outcome, name, description, sections_json, version, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            backendTemplate.id,
            backendTemplate.formType,
            backendTemplate.verificationType,
            normalizedOutcome,
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
          outcome: normalizedOutcome,
        });
      } catch (e) {
        console.error('Error loading template', e);
      } finally {
        setTemplateLoading(false);
      }
    };

    loadTemplate();
  }, [task, selectedOutcome, taskFormTypeKey]);

  const handleAddPhoto = () => {
    navigation.navigate('CameraCapture', { taskId, componentType: 'photo' });
  };

  const handleAddSelfie = () => {
    navigation.navigate('CameraCapture', { taskId, componentType: 'selfie' });
  };

  const handleOutcomeSelect = async (outcome: ResidenceOutcome) => {
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

    if (!template) {
      Alert.alert('Validation Error', 'Form template is not loaded yet.');
      return;
    }

    const templateValidation = validateTemplateRequiredFields(template, formValues);
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
      const remarks =
        String(formValues.remarks || '').trim() ||
        String(formValues.otherObservation || '').trim();

      const formData = {
        ...formValues,
        remarks,
        submittedAt: new Date().toISOString(),
      };

      await submitTaskForm({
        taskId: task.id,
        formType: taskFormTypeKey || 'DEFAULT',
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
