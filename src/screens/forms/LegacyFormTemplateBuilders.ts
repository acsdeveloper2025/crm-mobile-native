import type { FormTemplate, FormFieldCondition, FormFieldTemplate } from '../../types/api';
import type { FormTypeKey } from '../../utils/formTypeKey';

type ResidenceOutcome = 'POSITIVE' | 'SHIFTED' | 'NSP' | 'ENTRY_RESTRICTED' | 'UNTRACEABLE';
type PropertyApfOutcome = 'POSITIVE' | 'ENTRY_RESTRICTED' | 'UNTRACEABLE';
type PropertyIndividualOutcome = 'POSITIVE' | 'NSP' | 'ENTRY_RESTRICTED' | 'UNTRACEABLE';
type AllOutcome = ResidenceOutcome;
type NormalizedOutcome = AllOutcome;
type OutcomeCoercionResult = {
  outcome: AllOutcome;
  warning: string | null;
};

const normalizeOutcome = (rawOutcome?: string | null): NormalizedOutcome => {
  const value = String(rawOutcome || '').trim().toUpperCase();
  if (!value) {
    return 'POSITIVE';
  }
  if (value.includes('DOOR LOCKED SHIFTED') || value.includes('SHIFTED')) {
    return 'SHIFTED';
  }
  if (value.includes('NO SUCH PERSON')) {
    return 'NSP';
  }
  if (value.includes('NSP') || value.includes('PERSON NOT MET') || value.includes('NSP DOOR LOCKED')) {
    return 'NSP';
  }
  if (value.includes('POSITIVE')) {
    return 'POSITIVE';
  }
  if (value.includes('DOOR LOCK')) {
    return 'POSITIVE';
  }
  if (value === 'ERT' || value.includes('ENTRY') || value.includes('RESTRICT')) {
    return 'ENTRY_RESTRICTED';
  }
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) {
    return 'UNTRACEABLE';
  }
  return 'POSITIVE';
};

type ResidenceFieldInput = Omit<FormFieldTemplate, 'id' | 'order'> & { id?: string };

const COMMON_LEGACY_OUTCOMES: readonly AllOutcome[] = [
  'POSITIVE',
  'SHIFTED',
  'NSP',
  'ENTRY_RESTRICTED',
  'UNTRACEABLE',
];

const getOutcomeLabel = (formTypeKey: FormTypeKey | null, outcome: AllOutcome): string => {
  if (formTypeKey === 'property-apf') {
    const apfLabelByOutcome: Record<PropertyApfOutcome, string> = {
      POSITIVE: 'Positive & Negative',
      ENTRY_RESTRICTED: 'ERT',
      UNTRACEABLE: 'Untraceable',
    };
    const normalizedApfOutcome: PropertyApfOutcome =
      outcome === 'ENTRY_RESTRICTED' || outcome === 'UNTRACEABLE' ? outcome : 'POSITIVE';
    return apfLabelByOutcome[normalizedApfOutcome];
  }

  if (formTypeKey === 'property-individual') {
    const individualLabelByOutcome: Record<PropertyIndividualOutcome, string> = {
      POSITIVE: 'Positive & Door Locked',
      NSP: 'No Such Person & Door Locked No Such Person',
      ENTRY_RESTRICTED: 'ERT',
      UNTRACEABLE: 'Untraceable',
    };
    const normalizedIndividualOutcome: PropertyIndividualOutcome =
      outcome === 'NSP' || outcome === 'ENTRY_RESTRICTED' || outcome === 'UNTRACEABLE'
        ? outcome
        : 'POSITIVE';
    return individualLabelByOutcome[normalizedIndividualOutcome];
  }

  const labelByOutcome: Record<AllOutcome, string> = {
    POSITIVE: 'Positive & Door Locked',
    SHIFTED: 'Shifted & Door Locked Shifted',
    NSP: 'NSP & NSP Door Locked',
    ENTRY_RESTRICTED: 'ERT',
    UNTRACEABLE: 'Untraceable',
  };
  return labelByOutcome[outcome];
};

const LEGACY_OUTCOMES_BY_FORM_TYPE: Record<FormTypeKey, readonly AllOutcome[]> = {
  residence: COMMON_LEGACY_OUTCOMES,
  'residence-cum-office': COMMON_LEGACY_OUTCOMES,
  office: COMMON_LEGACY_OUTCOMES,
  business: COMMON_LEGACY_OUTCOMES,
  builder: COMMON_LEGACY_OUTCOMES,
  noc: COMMON_LEGACY_OUTCOMES,
  'dsa-connector': COMMON_LEGACY_OUTCOMES,
  'property-individual': ['NSP', 'ENTRY_RESTRICTED', 'POSITIVE', 'UNTRACEABLE'],
  'property-apf': ['UNTRACEABLE', 'ENTRY_RESTRICTED', 'POSITIVE'],
};

const PREFERRED_DEFAULT_OUTCOME_BY_FORM_TYPE: Partial<Record<FormTypeKey, AllOutcome>> = {
  residence: 'POSITIVE',
  'residence-cum-office': 'POSITIVE',
  office: 'POSITIVE',
  business: 'POSITIVE',
  builder: 'POSITIVE',
  noc: 'POSITIVE',
  'dsa-connector': 'POSITIVE',
  'property-individual': 'POSITIVE',
  'property-apf': 'POSITIVE',
};

const getAllowedOutcomes = (formTypeKey: FormTypeKey | null): readonly AllOutcome[] => {
  if (!formTypeKey) {
    return COMMON_LEGACY_OUTCOMES;
  }
  return LEGACY_OUTCOMES_BY_FORM_TYPE[formTypeKey];
};

const getFallbackOutcomeForFormType = (formTypeKey: FormTypeKey | null): AllOutcome => {
  const allowedOutcomes = getAllowedOutcomes(formTypeKey);
  const preferredDefault = formTypeKey ? PREFERRED_DEFAULT_OUTCOME_BY_FORM_TYPE[formTypeKey] : 'POSITIVE';

  if (preferredDefault && allowedOutcomes.includes(preferredDefault)) {
    return preferredDefault;
  }

  return allowedOutcomes[0] || 'POSITIVE';
};

const coerceOutcomeForFormType = (
  formTypeKey: FormTypeKey | null,
  rawOutcome?: string | null,
): OutcomeCoercionResult => {
  const normalizedOutcome = normalizeOutcome(rawOutcome);
  const allowedOutcomes = getAllowedOutcomes(formTypeKey);
  const fallbackOutcome = getFallbackOutcomeForFormType(formTypeKey);
  const rawValue = String(rawOutcome ?? '').trim();

  if (!rawValue) {
    return { outcome: fallbackOutcome, warning: null };
  }

  if (allowedOutcomes.includes(normalizedOutcome)) {
    return { outcome: normalizedOutcome, warning: null };
  }

  const formTypeLabel = formTypeKey || 'unknown';
  return {
    outcome: fallbackOutcome,
    warning: `Outcome "${rawValue}" is invalid for ${formTypeLabel}. Using "${fallbackOutcome}" form.`,
  };
};

const NUMBERS_1_TO_20 = Array.from({ length: 20 }, (_, i) => String(i + 1));
const NUMBERS_1_TO_50 = Array.from({ length: 50 }, (_, i) => String(i + 1));
const NUMBERS_1_TO_100 = Array.from({ length: 100 }, (_, i) => String(i + 1));
const STAYING_PERIOD_UNITS = ['Month', 'Year'];
const STANDARD_COLORS = [
  'White', 'Off White', 'Cream', 'Ivory', 'Beige',
  'Light Grey', 'Grey', 'Dark Grey', 'Black', 'Silver',
  'Brown', 'Dark Brown', 'Light Brown', 'Tan', 'Maroon',
  'Red', 'Dark Red', 'Pink', 'Light Pink', 'Orange',
  'Yellow', 'Light Yellow', 'Gold', 'Green', 'Dark Green',
  'Light Green', 'Olive', 'Blue', 'Dark Blue', 'Light Blue',
  'Sky Blue', 'Navy Blue', 'Purple', 'Violet', 'Teal',
];

/** Common select options shared across all form types */
const COMMON_SELECT_OPTIONS: Record<string, string[]> = {
  totalFamilyMembers: NUMBERS_1_TO_20,
  totalEarning: NUMBERS_1_TO_20,
  stayingPeriodValue: NUMBERS_1_TO_50,
  stayingPeriodUnit: STAYING_PERIOD_UNITS,
  addressStructure: NUMBERS_1_TO_100,
  applicantStayingFloor: NUMBERS_1_TO_100,
  addressStructureColor: STANDARD_COLORS,
  doorColor: STANDARD_COLORS,
};

const legacyResidenceSelectOptions: Record<string, string[]> = {
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'houseStatus', label: 'House Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person Name', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'metPersonRelation', label: 'Relation', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'totalFamilyMembers', label: 'Total Family Members', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'totalEarning', label: 'Total Earning', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'workingStatus', label: 'Working Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'companyName', label: 'Company Name', type: 'text', conditional: legacyCondition('workingStatus', 'notIn', ['', null, 'House Wife']), requiredWhen: legacyCondition('workingStatus', 'notIn', ['', null, 'House Wife']) },
  { name: 'stayingPeriodValue', label: 'Staying Period', type: 'select', required: true },
  { name: 'stayingPeriodUnit', label: 'Period Unit (Month/Year)', type: 'select', required: true },
  { name: 'stayingStatus', label: 'Ownership Type', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressFloor', label: 'Address Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'houseStatus', label: 'House Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'metPersonStatus', label: 'Met Person Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'stayingPeriodValue', label: 'Staying Period', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'stayingPeriodUnit', label: 'Period Unit (Month/Year)', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'stayingPersonName', label: 'Staying Person Name', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Closed'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Closed') },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  { name: 'nameOnDoorPlate', label: 'Name on Door Plate', type: 'text', conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'), requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted') },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'metPersonConfirmation', label: 'Met Person Confirmation', type: 'select', required: true },
  { name: 'applicantStayingStatus', label: 'Applicant Staying Status', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'resiCumOfficeStatus', label: 'Resi-cum-Office Status', type: 'select', required: true },
  { name: 'residenceSetup', label: 'Residence Setup', type: 'select', required: true },
  { name: 'businessSetup', label: 'Business Setup', type: 'select', required: true },
  { name: 'stayingPeriodValue', label: 'Staying Period', type: 'select', required: true },
  { name: 'stayingPeriodUnit', label: 'Period Unit (Month/Year)', type: 'select', required: true },
  { name: 'stayingStatus', label: 'Ownership Type', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressFloor', label: 'Address Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
    name: 'stayingPeriodValue',
    label: 'Staying Period',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Opened'),
  },
  {
    name: 'stayingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'doorNamePlateStatus', label: 'Door Name Plate Visible?', type: 'select', required: true },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('doorNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'societyNamePlateStatus', label: 'Society/Building Name Plate Visible?', type: 'select', required: true },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
    requiredWhen: legacyCondition('societyNamePlateStatus', 'equals', 'Sighted'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'officeExistFloor', label: 'Office Exist Floor', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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

const legacyPositiveBuilderFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'houseStatus', label: 'House Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person Name', type: 'text', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'relation', label: 'Relation', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'nameOnBoard', label: 'Name on Board', type: 'text', required: true },
  { name: 'businessType', label: 'Business Type', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'ownershipType', label: 'Ownership Type', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'addressStatus', label: 'Address Status', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'staffStrength', label: 'Staff Strength', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'staffSeen', label: 'Staff Seen', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'approxArea', label: 'Approx Area (Sq. Feet)', type: 'number', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'designation', label: 'Designation', type: 'select', conditional: legacyCondition('houseStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('houseStatus', 'equals', 'Opened') },
  { name: 'companyName', label: 'Company Name', type: 'text', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcConfirmation1', label: 'TPC Confirmation 1', type: 'select', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'tpcConfirmation2', label: 'TPC Confirmation 2', type: 'select', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyShiftedBuilderFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'shiftedPeriod', label: 'Shifted Period', type: 'text', required: true },
  { name: 'metPersonName', label: 'Met Person', type: 'text', conditional: legacyCondition('officeStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened') },
  { name: 'designation', label: 'Designation', type: 'select', conditional: legacyCondition('officeStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened') },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyNspBuilderFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'officeStatus', label: 'Office Status', type: 'select', required: true },
  { name: 'metPersonName', label: 'Met Person', type: 'text', conditional: legacyCondition('officeStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened') },
  { name: 'designation', label: 'Designation', type: 'select', conditional: legacyCondition('officeStatus', 'equals', 'Opened'), requiredWhen: legacyCondition('officeStatus', 'equals', 'Opened') },
  { name: 'tpcMetPerson1', label: 'TPC Met Person 1', type: 'select' },
  { name: 'tpcName1', label: 'Name of TPC 1', type: 'text', conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]) },
  { name: 'tpcMetPerson2', label: 'TPC Met Person 2', type: 'select' },
  { name: 'tpcName2', label: 'Name of TPC 2', type: 'text', conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]), requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]) },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

const legacyEntryRestrictedBuilderFields = withLegacyBusinessOrder([
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
  { name: 'nameOfMetPerson', label: 'Name of Met Person', type: 'text', required: true },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'politicalConnection', label: 'Political Connection', type: 'select', required: true },
  { name: 'dominatedArea', label: 'Dominated Area', type: 'select', required: true },
  { name: 'feedbackFromNeighbour', label: 'Feedback from Neighbour', type: 'select', required: true },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea', required: true },
  { name: 'finalStatus', label: 'Final Status', type: 'select', required: true },
  { name: 'holdReason', label: 'Reason for Hold', type: 'text', conditional: legacyCondition('finalStatus', 'equals', 'Hold'), requiredWhen: legacyCondition('finalStatus', 'equals', 'Hold') },
]);

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
  POSITIVE: legacyPositiveBuilderFields,
  SHIFTED: legacyShiftedBuilderFields,
  NSP: legacyNspBuilderFields,
  ENTRY_RESTRICTED: legacyEntryRestrictedBuilderFields,
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'applicantStayingFloor', label: 'Applicant Staying Floor', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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

const normalizedPropertyApfOutcome = (rawOutcome: string): PropertyApfOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyPropertyApfFieldsByOutcome: Record<PropertyApfOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositivePropertyApfFields,
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
  ...COMMON_SELECT_OPTIONS,
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressExistAt', label: 'Address Exist At (Floor)', type: 'number', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
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
  { name: 'addressLocatable', label: 'Is Address Easy to Locate?', type: 'select', required: true },
  { name: 'addressRating', label: 'Property Condition', type: 'select', required: true },
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
  { name: 'addressStructure', label: 'Address Structure', type: 'select', required: true },
  { name: 'addressStructureColor', label: 'Address Structure Color', type: 'select', required: true },
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

const normalizedPropertyIndividualOutcome = (rawOutcome: string): PropertyIndividualOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT')) return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) return 'UNTRACEABLE';
  if (value.includes('NSP') || value.includes('PERSON NOT MET') || value.includes('SHIFTED')) return 'NSP';
  return 'POSITIVE';
};

const legacyPropertyIndividualFieldsByOutcome: Record<PropertyIndividualOutcome, FormFieldTemplate[]> = {
  POSITIVE: legacyPositivePropertyIndividualFields,
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


export type LegacyOutcome = AllOutcome;

export const coerceLegacyOutcomeForFormType = (
  formTypeKey: FormTypeKey | null,
  rawOutcome?: string | null,
): OutcomeCoercionResult => coerceOutcomeForFormType(formTypeKey, rawOutcome);

export const getAllowedOutcomesForFormType = (
  formTypeKey: FormTypeKey | null,
): readonly AllOutcome[] => getAllowedOutcomes(formTypeKey);

export const getOutcomeLabelForFormType = (
  formTypeKey: FormTypeKey | null,
  outcome: AllOutcome,
): string => getOutcomeLabel(formTypeKey, outcome);

export const buildLegacyTemplateForFormType = (
  verificationType: FormTypeKey,
  outcome: string,
): FormTemplate | null => {
  switch (verificationType) {
    case 'residence':
      return buildLegacyResidenceTemplate(verificationType, outcome);
    case 'residence-cum-office':
      return buildLegacyResidenceCumOfficeTemplate(verificationType, outcome);
    case 'office':
      return buildLegacyOfficeTemplate(verificationType, outcome);
    case 'business':
      return buildLegacyBusinessTemplate(verificationType, outcome);
    case 'builder':
      return buildLegacyBuilderTemplate(verificationType, outcome);
    case 'noc':
      return buildLegacyNocTemplate(verificationType, outcome);
    case 'dsa-connector':
      return buildLegacyDsaTemplate(verificationType, outcome);
    case 'property-individual':
      return buildLegacyPropertyIndividualTemplate(verificationType, outcome);
    case 'property-apf':
      return buildLegacyPropertyApfTemplate(verificationType, outcome);
    default:
      return null;
  }
};
