import type {
  FormTemplate,
  FormFieldCondition,
  FormFieldTemplate,
} from '../../types/api';
import type { FormTypeKey } from '../../utils/formTypeKey';

type ResidenceOutcome =
  | 'POSITIVE'
  | 'SHIFTED'
  | 'NSP'
  | 'ENTRY_RESTRICTED'
  | 'UNTRACEABLE';
type PropertyApfOutcome = 'POSITIVE' | 'ENTRY_RESTRICTED' | 'UNTRACEABLE';
type PropertyIndividualOutcome =
  | 'POSITIVE'
  | 'NSP'
  | 'ENTRY_RESTRICTED'
  | 'UNTRACEABLE';
type AllOutcome = ResidenceOutcome;
type NormalizedOutcome = AllOutcome;
type OutcomeCoercionResult = {
  outcome: AllOutcome;
  warning: string | null;
};

const normalizeOutcome = (rawOutcome?: string | null): NormalizedOutcome => {
  const value = String(rawOutcome || '')
    .trim()
    .toUpperCase();
  if (!value) {
    return 'POSITIVE';
  }
  if (value.includes('DOOR LOCKED SHIFTED') || value.includes('SHIFTED')) {
    return 'SHIFTED';
  }
  if (value.includes('NO SUCH PERSON')) {
    return 'NSP';
  }
  if (
    value.includes('NSP') ||
    value.includes('PERSON NOT MET') ||
    value.includes('NSP DOOR LOCKED')
  ) {
    return 'NSP';
  }
  if (value.includes('POSITIVE')) {
    return 'POSITIVE';
  }
  if (value.includes('DOOR LOCK')) {
    return 'POSITIVE';
  }
  if (
    value === 'ERT' ||
    value.includes('ENTRY') ||
    value.includes('RESTRICT')
  ) {
    return 'ENTRY_RESTRICTED';
  }
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND')) {
    return 'UNTRACEABLE';
  }
  return 'POSITIVE';
};

type ResidenceFieldInput = Omit<FormFieldTemplate, 'id' | 'order'> & {
  id?: string;
};

const COMMON_LEGACY_OUTCOMES: readonly AllOutcome[] = [
  'POSITIVE',
  'SHIFTED',
  'NSP',
  'ENTRY_RESTRICTED',
  'UNTRACEABLE',
];

const getOutcomeLabel = (
  formTypeKey: FormTypeKey | null,
  outcome: AllOutcome,
): string => {
  if (formTypeKey === 'property-apf') {
    const apfLabelByOutcome: Record<PropertyApfOutcome, string> = {
      POSITIVE: 'Positive & Negative',
      ENTRY_RESTRICTED: 'ERT',
      UNTRACEABLE: 'Untraceable',
    };
    const normalizedApfOutcome: PropertyApfOutcome =
      outcome === 'ENTRY_RESTRICTED' || outcome === 'UNTRACEABLE'
        ? outcome
        : 'POSITIVE';
    return apfLabelByOutcome[normalizedApfOutcome];
  }

  if (formTypeKey === 'property-individual') {
    const individualLabelByOutcome: Record<PropertyIndividualOutcome, string> =
      {
        POSITIVE: 'Positive & Door Locked',
        NSP: 'NSP & NSP Door Locked',
        ENTRY_RESTRICTED: 'ERT',
        UNTRACEABLE: 'Untraceable',
      };
    const normalizedIndividualOutcome: PropertyIndividualOutcome =
      outcome === 'NSP' ||
      outcome === 'ENTRY_RESTRICTED' ||
      outcome === 'UNTRACEABLE'
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

const LEGACY_OUTCOMES_BY_FORM_TYPE: Record<FormTypeKey, readonly AllOutcome[]> =
  {
    residence: COMMON_LEGACY_OUTCOMES,
    'residence-cum-office': COMMON_LEGACY_OUTCOMES,
    office: COMMON_LEGACY_OUTCOMES,
    business: COMMON_LEGACY_OUTCOMES,
    builder: COMMON_LEGACY_OUTCOMES,
    noc: COMMON_LEGACY_OUTCOMES,
    'dsa-connector': COMMON_LEGACY_OUTCOMES,
    'property-individual': [
      'NSP',
      'ENTRY_RESTRICTED',
      'POSITIVE',
      'UNTRACEABLE',
    ],
    'property-apf': ['UNTRACEABLE', 'ENTRY_RESTRICTED', 'POSITIVE'],
  };

const PREFERRED_DEFAULT_OUTCOME_BY_FORM_TYPE: Partial<
  Record<FormTypeKey, AllOutcome>
> = {
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

const getAllowedOutcomes = (
  formTypeKey: FormTypeKey | null,
): readonly AllOutcome[] => {
  if (!formTypeKey) {
    return COMMON_LEGACY_OUTCOMES;
  }
  return LEGACY_OUTCOMES_BY_FORM_TYPE[formTypeKey];
};

const getFallbackOutcomeForFormType = (
  formTypeKey: FormTypeKey | null,
): AllOutcome => {
  const allowedOutcomes = getAllowedOutcomes(formTypeKey);
  const preferredDefault = formTypeKey
    ? PREFERRED_DEFAULT_OUTCOME_BY_FORM_TYPE[formTypeKey]
    : 'POSITIVE';

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
const STAYING_PERIOD_UNITS = ['Day', 'Month', 'Year'];
const STANDARD_COLORS = [
  'White',
  'Off White',
  'Cream',
  'Ivory',
  'Beige',
  'Light Grey',
  'Grey',
  'Dark Grey',
  'Black',
  'Silver',
  'Brown',
  'Dark Brown',
  'Light Brown',
  'Tan',
  'Maroon',
  'Red',
  'Dark Red',
  'Pink',
  'Light Pink',
  'Orange',
  'Yellow',
  'Light Yellow',
  'Gold',
  'Green',
  'Dark Green',
  'Light Green',
  'Olive',
  'Blue',
  'Dark Blue',
  'Light Blue',
  'Sky Blue',
  'Navy Blue',
  'Purple',
  'Violet',
  'Teal',
];

/** Common select options shared across all form types */
const COMMON_SELECT_OPTIONS: Record<string, string[]> = {
  totalFamilyMembers: NUMBERS_1_TO_20,
  totalEarning: NUMBERS_1_TO_20,
  stayingPeriodValue: NUMBERS_1_TO_50,
  stayingPeriodUnit: STAYING_PERIOD_UNITS,
  addressStructure: NUMBERS_1_TO_100,
  applicantStayingFloor: NUMBERS_1_TO_100,
  addressFloor: NUMBERS_1_TO_100,
  officeExistFloor: NUMBERS_1_TO_100,
  addressExistAt: NUMBERS_1_TO_100,
  designation: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager',
    'H.R.',
    'Sr. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
  addressStructureColor: STANDARD_COLORS,
  doorColor: STANDARD_COLORS,
  relation: [
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
  relationship: [
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
  companyNameBoard: ['SIGHTED AS', 'NOT SIGHTED'],
  companyNamePlateStatus: ['SIGHTED AS', 'NOT SIGHTED'],
  societyNamePlateStatus: ['SIGHTED AS', 'NOT SIGHTED'],
  doorNamePlateStatus: ['SIGHTED AS', 'NOT SIGHTED'],
  sightStatus: ['SIGHTED AS', 'NOT SIGHTED'],
  addressLocatable: ['Easy to Locate', 'Difficult to Locate'],
  addressRating: ['Good', 'Shabby', 'Poor'],
  tpcMetPerson: ['Neighbour', 'Security'],
  tpcConfirmation: ['Confirmed', 'Not Confirmed'],
  locality: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
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
    'Bunglow',
  ],
  localityResiCumOffice: [
    'Commercial Tower',
    'Residential Building',
    'Office Building',
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
    'Bunglow',
  ],
  callRemark: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
  callRemarkUntraceable: [
    'Did Not Pick Up Call',
    'Number is Switch Off',
    'Number is Unreachable',
    'Refused to Guide Address',
  ],
  stayingStatus: [
    'On a Self Owned Basis',
    'On a Parental Owned Basis',
    'On a Relative Owned Basis',
    'On a Rental Basis',
    'On a Pagadi System',
    'In the Staff Quarters',
    'As a Paying Guest',
    'On a Company Accommodation',
    'In the Bachelor Accommodation',
    'In the Hostel',
  ],
  feedbackFromNeighbour: ['Adverse', 'No Adverse'],
  premisesStatus: ['Vacant', 'Rented'],
  premisesStatusBusiness: ['Vacant', 'Rented'],
  politicalConnection: [
    'Having Political Connection',
    'Not Having Political Connection',
  ],
  dominatedArea: ['A Community Dominated', 'Not a Community Dominated'],
  finalStatus: ['Positive', 'Negative', 'Refer', 'Fraud'],
  finalStatusPositive: ['Positive', 'Refer'],
  finalStatusNsp: ['Negative', 'Refer', 'Fraud'],
  finalStatusShifted: ['Negative', 'Refer', 'Fraud'],
  finalStatusErt: ['Positive', 'Negative', 'Refer', 'Fraud'],
  finalStatusUntraceable: ['Negative', 'Refer', 'Fraud'],
  businessPeriodValue: NUMBERS_1_TO_50,
  businessPeriodUnit: STAYING_PERIOD_UNITS,
  workingPeriodValue: NUMBERS_1_TO_50,
  workingPeriodUnit: STAYING_PERIOD_UNITS,
  establishmentPeriodValue: NUMBERS_1_TO_50,
  establishmentPeriodUnit: STAYING_PERIOD_UNITS,
  currentCompanyPeriodValue: NUMBERS_1_TO_50,
  currentCompanyPeriodUnit: STAYING_PERIOD_UNITS,
  oldOfficeShiftedPeriodValue: NUMBERS_1_TO_50,
  oldOfficeShiftedPeriodUnit: STAYING_PERIOD_UNITS,
  houseStatus: ['Open', 'Closed'],
  metPersonErt: ['Security', 'Receptionist'],
  metPersonConfirmation: ['Confirmed', 'Not Confirmed'],
  applicantStayingStatus: [
    'Applicant is Staying At',
    'Applicant is Shifted From',
    'No Such Person Staying At',
  ],
  officeType: [
    'PVT. LTD. Company',
    'LTD. Company',
    'LLP Company',
    'Govt. Office',
    'Proprietorship Firm',
    'Partnership Firm',
    'Public Ltd. Company',
  ],
  businessType: [
    'PVT. LTD. Company',
    'LTD. Company',
    'LLP Company',
    'Proprietorship Firm',
    'Partnership Firm',
  ],
  ownershipType: ['Are Partners', 'Are Directors', 'Is Proprietor'],
  addressStatus: [
    'On a Self Owned Basis',
    'On a Rental Basis',
    'On a Pagadi System',
    'In Share Work Place',
  ],
  businessExistStatus: [
    'Business Exist At',
    'Business Does Not Exist At',
    'Business Shifted From',
  ],
  workingStatusOffice: [
    'Company Payroll',
    'Third Party Payroll',
    'Contract Payroll',
  ],
  applicantWorkingPremises: ['Same Location', 'Different Location'],
  applicantDesignation: [
    'Applicant Self',
    'Reception',
    'Reception Security',
    'Company Security',
    'Manager',
    'H.R.',
    'Sr. Officer',
    'Accountant',
    'Admin',
    'Office Staff',
    'Clark',
    'Principal',
    'Other',
  ],
};

const legacyResidenceSelectOptions: Record<string, string[]> = {
  ...COMMON_SELECT_OPTIONS,
  metPersonRelation: [
    'Father',
    'Mother',
    'Spouse',
    'Son',
    'Daughter',
    'Brother',
    'Sister',
    'Self',
    'Other',
  ],
  workingStatus: ['Salaried', 'Self Employed', 'House Wife'],
  documentShownStatus: ['Showed', 'Did Not Showed Any Document'],
  documentType: [
    'Electricity Bill',
    'Aadhar Card',
    'Pan Card',
    'Passport',
    'Rent Deed',
  ],
  metPersonStatus: ['Owner', 'Tenant'],
};

const legacyResidenceOptionAliases: Record<string, string> = {
  metPerson: 'metPersonErt',
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

const withLegacyResidenceOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey = legacyResidenceOptionAliases[field.name] || field.name;
    const options = field.options
      ? field.options
      : field.type === 'select'
      ? (legacyResidenceSelectOptions[optionKey] || []).map(value => ({
          label: value,
          value,
        }))
      : undefined;
    return {
      ...field,
      id: field.id || field.name,
      order: index + 1,
      options,
    };
  });

const legacyPositiveResidenceFields = withLegacyResidenceOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'houseStatus',
    label: 'House Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonName',
    label: 'Met Person Name',
    type: 'text',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'metPersonRelation',
    label: 'Relation',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'totalFamilyMembers',
    label: 'Total Family Members',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'totalEarning',
    label: 'Total Earning',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'workingStatus',
    label: 'Working Status',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'companyName',
    label: 'Company Name',
    type: 'text',
    conditional: legacyCondition('workingStatus', 'notIn', [
      '',
      null,
      'House Wife',
    ]),
    requiredWhen: legacyCondition('workingStatus', 'notIn', [
      '',
      null,
      'House Wife',
    ]),
  },
  {
    name: 'stayingPeriodValue',
    label: 'Staying Period',
    type: 'select',
    required: true,
  },
  {
    name: 'stayingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'stayingStatus',
    label: 'Ownership Type',
    type: 'select',
    required: true,
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'documentShownStatus',
    label: 'Document Shown Status',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'documentType',
    label: 'Document Type',
    type: 'select',
    conditional: legacyCondition('documentShownStatus', 'equals', 'Showed'),
    requiredWhen: legacyCondition('documentShownStatus', 'equals', 'Showed'),
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
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyShiftedResidenceFields = withLegacyResidenceOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'houseStatus',
    label: 'House Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonName',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'shiftedPeriodValue',
    label: 'Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'shiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'tpcMetPerson1',
    label: 'Third Party Confirmation 1',
    type: 'select',
  },
  {
    name: 'tpcName1',
    label: 'TPC Met Person',
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
    label: 'Third Party Confirmation 2',
    type: 'select',
  },
  {
    name: 'tpcName2',
    label: 'TPC Met Person',
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
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Closed'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Closed'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressFloor',
    label: 'Address Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspResidenceFields = withLegacyResidenceOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'houseStatus',
    label: 'House Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonName',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'stayingPeriodValue',
    label: 'Staying Period',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
  {
    name: 'stayingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    conditional: legacyCondition('houseStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Open'),
  },
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
    name: 'stayingPersonName',
    label: 'Staying Person Name',
    type: 'text',
    conditional: legacyCondition('houseStatus', 'equals', 'Closed'),
    requiredWhen: legacyCondition('houseStatus', 'equals', 'Closed'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedResidenceFields = withLegacyResidenceOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  { name: 'metPerson', label: 'Met Person', type: 'select', required: true },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingStatus',
    label: 'Applicant Staying Status',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableResidenceFields = withLegacyResidenceOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedResidenceOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value.includes('ENTRY') || value.includes('RESTRICT'))
    return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND'))
    return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyResidenceFieldsByOutcome: Record<
  ResidenceOutcome,
  FormFieldTemplate[]
> = {
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
  resiCumOfficeStatus: ['Open', 'Closed'],
  businessStatusResiCumOffice: [
    'Self Employee - Proprietorship',
    'Partnership Firm',
    'Private Limited',
  ],
  businessLocation: ['At Same Address', 'From Different Address'],
  documentShownStatus: ['Showed', 'Did Not Showed Any Document'],
  documentType: [
    'Electricity Bill',
    'Aadhar Card',
    'Pan Card',
    'Passport',
    'Rent Deed',
  ],
  metPersonStatusShifted: ['Owner', 'Tenant'],
  businessStatusErtResiCumOffice: [
    'Office Exist At',
    'Office Does Not Exist At',
    'Office Shifted From',
  ],
  applicantWorkingStatus: [
    'Applicant is Working At',
    'Applicant is Shifted From',
    'No Such Person Working At',
  ],
};

const legacyResiCumOfficeOptionAliases: Record<string, string> = {
  residenceSetup: 'sightStatus',
  businessSetup: 'sightStatus',
  businessStatus: 'businessStatusResiCumOffice',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  metPersonStatus: 'metPersonStatusShifted',
  metPerson: 'metPersonErt',
  metPersonType: 'metPersonErt',
};

const withLegacyResiCumOfficeOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey =
      legacyResiCumOfficeOptionAliases[field.name] || field.name;
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'resiCumOfficeStatus',
    label: 'Resi-cum-Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'residenceSetup',
    label: 'Residence Setup',
    type: 'select',
    required: true,
  },
  {
    name: 'businessSetup',
    label: 'Business Setup',
    type: 'select',
    required: true,
  },
  {
    name: 'stayingPeriodValue',
    label: 'Staying Period',
    type: 'select',
    required: true,
  },
  {
    name: 'stayingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'stayingStatus',
    label: 'Ownership Type',
    type: 'select',
    required: true,
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    required: true,
  },
  {
    name: 'businessPeriodValue',
    label: 'Business Period',
    type: 'select',
    required: true,
  },
  {
    name: 'businessPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'businessStatus',
    label: 'Business Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessLocation',
    label: 'Business Location',
    type: 'select',
    required: true,
  },
  {
    name: 'businessOperatingAddress',
    label: 'Business Operating Address',
    type: 'text',
    conditional: legacyCondition(
      'businessLocation',
      'equals',
      'From Different Address',
    ),
    requiredWhen: legacyCondition(
      'businessLocation',
      'equals',
      'From Different Address',
    ),
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
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'relation',
    label: 'Relation',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'documentShownStatus',
    label: 'Document Shown Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'documentType',
    label: 'Document Type',
    type: 'select',
    conditional: legacyCondition('documentShownStatus', 'equals', 'Showed'),
    requiredWhen: legacyCondition('documentShownStatus', 'equals', 'Showed'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate Status',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const legacyShiftedResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'resiCumOfficeStatus',
    label: 'Resi-cum-Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'shiftedPeriodValue',
    label: 'Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'shiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'tpcMetPerson1',
    label: 'Third Party Confirmation 1',
    type: 'select',
  },
  {
    name: 'tpcName1',
    label: 'TPC Met Person',
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
    label: 'Third Party Confirmation 2',
    type: 'select',
  },
  {
    name: 'tpcName2',
    label: 'TPC Met Person',
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
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressFloor',
    label: 'Address Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  {
    name: 'addressTraceable',
    label: 'Address Traceable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'resiCumOfficeStatus',
    label: 'Resi-cum-Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'metPersonStatus',
    label: 'Met Person Status',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'stayingPeriodValue',
    label: 'Staying Period',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'stayingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Open'),
  },
  {
    name: 'tpcMetPerson1',
    label: 'Third Party Confirmation 1',
    type: 'select',
  },
  {
    name: 'tpcName1',
    label: 'TPC Met Person',
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
    label: 'Third Party Confirmation 2',
    type: 'select',
  },
  {
    name: 'tpcName2',
    label: 'TPC Met Person',
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
    name: 'stayingPersonName',
    label: 'Staying Person Name',
    type: 'text',
    conditional: legacyCondition('resiCumOfficeStatus', 'equals', 'Closed'),
    requiredWhen: legacyCondition('resiCumOfficeStatus', 'equals', 'Closed'),
  },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantWorkingStatus',
    label: 'Applicant Working Status',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingStatus',
    label: 'Applicant Staying Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessStatus',
    label: 'Business Status',
    type: 'select',
    required: true,
    options: toSelectOptions(
      legacyResiCumOfficeSelectOptions.businessStatusErtResiCumOffice,
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society/Building Name Plate Visible?',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableResiCumOfficeFields = withLegacyResiCumOfficeOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyResiCumOfficeFieldsByOutcome: Record<
  ResidenceOutcome,
  FormFieldTemplate[]
> = {
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
    name: `Residence Cum Office Verification - ${normalizedOutcome
      .split('_')
      .join(' ')}`,
    description:
      'Loaded from native legacy Residence-cum-Office form definition',
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
  workingStatus: ['Company Payroll', 'Third Party Payroll', 'Contract Payroll'],
  officeStatus: ['Open', 'Closed', 'Shifted'],
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
  officeExistence: ['Exist', 'Does Not Exist'],
  officeStatusErtOffice: [
    'Office Exist At',
    'Office Does Not Exist At',
    'Office Shifted From',
  ],
  applicantWorkingStatus: [
    'Applicant is Working At',
    'Applicant is Shifted From',
    'No Such Person Working At',
  ],
};

const legacyOfficeOptionAliases: Record<string, string> = {
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  officeExistence: 'officeExistence',
  metPerson: 'metPersonErt',
  metPersonType: 'metPersonErt',
};

const withLegacyOfficeOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'workingPeriodValue',
    label: 'Working Period',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'workingPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'applicantDesignation',
    label: 'Applicant Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'workingStatus',
    label: 'Working Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'applicantWorkingPremises',
    label: 'Applicant Working Premises',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'sittingLocation',
    label: 'Sitting Location',
    type: 'text',
    conditional: legacyCondition(
      'applicantWorkingPremises',
      'equals',
      'Different Location',
    ),
    requiredWhen: legacyCondition(
      'applicantWorkingPremises',
      'equals',
      'Different Location',
    ),
  },
  {
    name: 'officeType',
    label: 'Office Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Company plate + document ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'documentShown',
    label: 'Document Shown',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Establishment + common ---
  {
    name: 'establishmentPeriodValue',
    label: 'Establishment Period',
    type: 'select',
    required: true,
  },
  {
    name: 'establishmentPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const legacyShiftedOfficeFields = withLegacyOfficeOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    required: true,
  },
  {
    name: 'currentCompanyPeriodValue',
    label: 'Current Company Period',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodValue',
    label: 'Old Office Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Company plate ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspOfficeFields = withLegacyOfficeOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'officeExistence',
    label: 'Office Existence',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Company plate ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedOfficeFields = withLegacyOfficeOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantWorkingStatus',
    label: 'Applicant Working Status',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Office Exist At', value: 'Office Exist At' },
      { label: 'Office Does Not Exist At', value: 'Office Does Not Exist At' },
      { label: 'Office Shifted From', value: 'Office Shifted From' },
    ],
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'officeExistFloor',
    label: 'Office Exist Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableOfficeFields = withLegacyOfficeOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedOfficeOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value.includes('ENTRY') || value.includes('RESTRICT'))
    return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND'))
    return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyOfficeFieldsByOutcome: Record<
  ResidenceOutcome,
  FormFieldTemplate[]
> = {
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
  officeStatus: ['Open', 'Closed', 'Shifted'],
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
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  officeStatusErtBusiness: [
    'Business Exist At',
    'Business Does Not Exist At',
    'Business Shifted From',
  ],
  applicantWorkingStatus: [
    'Applicant is Working At',
    'Applicant is Shifted From',
    'No Such Person Working At',
  ],
};

const legacyBusinessOptionAliases: Record<string, string> = {
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  metPerson: 'metPersonErt',
  metPersonType: 'metPersonErt',
};

const withLegacyBusinessOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'nameOfCompanyOwners',
    label: 'Name of Company Owners',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'ownershipType',
    label: 'Ownership Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'addressStatus',
    label: 'Address Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    required: true,
  },
  {
    name: 'businessPeriodValue',
    label: 'Business Period',
    type: 'select',
    required: true,
  },
  {
    name: 'businessPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Company plate + document ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'documentShown',
    label: 'Document Shown',
    type: 'text',
    required: true,
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyShiftedBusinessFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  {
    name: 'currentCompanyPeriodValue',
    label: 'Current Company Period',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodValue',
    label: 'Old Office Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    required: true,
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspBusinessFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistance',
    label: 'Business Existence',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existence',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedBusinessFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantWorkingStatus',
    label: 'Applicant Working Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistStatus',
    label: 'Business Exist Status',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableBusinessFields = withLegacyBusinessOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedBusinessOutcome = (rawOutcome: string): ResidenceOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('SHIFTED')) return 'SHIFTED';
  if (value.includes('NSP') || value.includes('PERSON NOT MET')) return 'NSP';
  if (value === 'ERT' || value.includes('ENTRY') || value.includes('RESTRICT'))
    return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND'))
    return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyBusinessFieldsByOutcome: Record<
  ResidenceOutcome,
  FormFieldTemplate[]
> = {
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'nameOfCompanyOwners',
    label: 'Name of Company Owners',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'ownershipType',
    label: 'Ownership Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'addressStatus',
    label: 'Address Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    required: true,
  },
  {
    name: 'businessPeriodValue',
    label: 'Business Period',
    type: 'select',
    required: true,
  },
  {
    name: 'businessPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Company plate + document ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'documentShown',
    label: 'Document Shown',
    type: 'text',
    required: true,
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyShiftedBuilderFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  {
    name: 'currentCompanyPeriodValue',
    label: 'Current Company Period',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodValue',
    label: 'Old Office Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    required: true,
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspBuilderFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistance',
    label: 'Business Existence',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existence',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedBuilderFields = withLegacyBusinessOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantWorkingStatus',
    label: 'Applicant Working Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistStatus',
    label: 'Business Exist Status',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableBuilderFields = withLegacyBusinessOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedBuilderOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyBuilderFieldsByOutcome: Record<
  ResidenceOutcome,
  FormFieldTemplate[]
> = {
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
  officeStatus: ['Open', 'Closed', 'Shifted'],
  designationNoc: [
    'Chairman',
    'Secretary',
    'Treasurer',
    'Society Manager',
    'Proprietor',
    'Partner',
    'Director',
    'Tenant',
    'Other',
  ],
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
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  officeStatusErtNoc: [
    'Office Exist At',
    'Office Does Not Exist At',
    'Office Shifted From',
  ],
};

const legacyNocOptionAliases: Record<string, string> = {
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  metPerson: 'metPersonErt',
  metPersonType: 'metPersonErt',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
};

const withLegacyNocOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.designationNoc),
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'authorisedSignature',
    label: 'Authorised Signature',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'nameOnNoc',
    label: 'Name on NOC',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'flatNo',
    label: 'Flat / Shop / Office No.',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const legacyShiftedNocFields = withLegacyNocOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    options: toSelectOptions(legacyNocSelectOptions.designationNoc),
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    required: true,
  },
  {
    name: 'currentCompanyPeriodValue',
    label: 'Current Company Period',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodValue',
    label: 'Old Office Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    required: true,
  },
  // --- Company plate ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspNocFields = withLegacyNocOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistance',
    label: 'Business Existence',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existence',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedNocFields = withLegacyNocOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Office Exist At', value: 'Office Exist At' },
      { label: 'Office Does Not Exist At', value: 'Office Does Not Exist At' },
      { label: 'Office Shifted From', value: 'Office Shifted From' },
    ],
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableNocFields = withLegacyNocOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedNocOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyNocFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> =
  {
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
  officeStatus: ['Open', 'Closed', 'Shifted'],
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
  businessExistence: ['Exist', 'Does Not Exist'],
  applicantExistence: ['Exist', 'Does Not Exist'],
  officeStatusErtDsa: [
    'Business Exist At',
    'Business Does Not Exist At',
    'Business Shifted From',
  ],
};

const legacyDsaOptionAliases: Record<string, string> = {
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  businessExistance: 'businessExistence',
  applicantExistance: 'applicantExistence',
  metPerson: 'metPersonErt',
  metPersonType: 'metPersonErt',
  businessExistStatus: 'officeStatusErtDsa',
};

const withLegacyDsaOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'ownershipType',
    label: 'Ownership Type',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'nameOfCompanyOwners',
    label: 'Name of Company Owners',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'addressStatus',
    label: 'Address Status',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'companyNatureOfBusiness',
    label: 'Company Nature of Business',
    type: 'text',
    required: true,
  },
  {
    name: 'businessPeriodValue',
    label: 'Business Period',
    type: 'select',
    required: true,
  },
  {
    name: 'businessPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'officeApproxArea',
    label: 'Office Approx Area (Sq. Feet)',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'activeClient',
    label: 'Active Client',
    type: 'text',
    required: true,
  },
  // --- Company plate ---
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyShiftedDsaFields = withLegacyDsaOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  {
    name: 'currentCompanyPeriodValue',
    label: 'Current Company Period',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodValue',
    label: 'Old Office Shifted Period',
    type: 'select',
    required: true,
  },
  {
    name: 'oldOfficeShiftedPeriodUnit',
    label: 'Period Unit (Month/Year)',
    type: 'select',
    required: true,
  },
  {
    name: 'approxArea',
    label: 'Approx Area (Sq. Feet)',
    type: 'number',
    required: true,
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyNspDsaFields = withLegacyDsaOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'officeStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistance',
    label: 'Business Existence',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantExistance',
    label: 'Applicant Existence',
    type: 'select',
    required: true,
  },
  // --- Yellow fields (hidden when Closed) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('officeStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('officeStatus', 'equals', 'Open'),
  },
  // --- Orange field (hidden when Vacant) ---
  {
    name: 'premisesStatus',
    label: 'Premises Status',
    type: 'select',
    required: true,
  },
  {
    name: 'currentCompanyName',
    label: 'Current Company Name',
    type: 'text',
    conditional: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
    requiredWhen: legacyCondition('premisesStatus', 'notEquals', 'Vacant'),
  },
  // --- Common ---
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'companyNamePlateStatus',
    label: 'Company Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'companyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  // --- TPC ---
  { name: 'tpcMetPerson1', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc1',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson1', 'notIn', ['', null]),
  },
  { name: 'tpcMetPerson2', label: 'TPC Met Person', type: 'select' },
  {
    name: 'nameOfTpc2',
    label: 'Name of TPC',
    type: 'text',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  {
    name: 'tpcConfirmation2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
    requiredWhen: legacyCondition('tpcMetPerson2', 'notIn', ['', null]),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedDsaFields = withLegacyDsaOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
  {
    name: 'metPersonConfirmation',
    label: 'Met Person Confirmation',
    type: 'select',
    required: true,
  },
  {
    name: 'businessExistStatus',
    label: 'Office Status',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'applicantStayingFloor',
    label: 'Applicant Staying Floor',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyUntraceableDsaFields = withLegacyDsaOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const normalizedDsaOutcome = (rawOutcome: string): ResidenceOutcome =>
  normalizedBusinessOutcome(rawOutcome);

const legacyDsaFieldsByOutcome: Record<ResidenceOutcome, FormFieldTemplate[]> =
  {
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
    name: `DSA DST & Connector Verification - ${normalizedOutcome
      .split('_')
      .join(' ')}`,
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
  buildingStatusApf: [
    'New Construction',
    'Redeveloped Construction',
    'Under Construction',
    'Vacant Place',
  ],
  constructionActivity: ['SEEN', 'CONSTRUCTION IS STOP', 'PLOT IS VACANT'],
};

const legacyPropertyApfOptionAliases: Record<string, string> = {
  buildingStatus: 'buildingStatusApf',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  metPerson: 'metPersonErt',
};

const withLegacyPropertyApfOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
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
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'constructionActivity',
    label: 'Construction Activity',
    type: 'select',
    required: true,
  },
  // --- SEEN-only fields (yellow) ---
  {
    name: 'metPerson',
    label: 'Met Person',
    type: 'text',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
  },
  // --- STOP-only fields (red) ---
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
    requiredWhen: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'activityStopReason',
    label: 'Activity Stop Reason',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
    requiredWhen: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'projectName',
    label: 'Project Name',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'projectStartedDate',
    label: 'Project Started Date',
    type: 'date',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'projectCompletionDate',
    label: 'Project Completion Date',
    type: 'date',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'totalWing',
    label: 'Total Wing',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'totalFlats',
    label: 'Total Flats',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'projectCompletionPercent',
    label: 'Project Completion %',
    type: 'number',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'staffStrength',
    label: 'Staff Strength',
    type: 'number',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  {
    name: 'staffSeen',
    label: 'Staff Seen',
    type: 'number',
    conditional: legacyCondition(
      'constructionActivity',
      'equals',
      'CONSTRUCTION IS STOP',
    ),
  },
  // --- Common fields (shown for SEEN and STOP, hidden for VACANT) ---
  {
    name: 'tpcMetPerson1',
    label: 'Third Party Confirmation 1',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'nameOfTpc1',
    label: 'TPC Met Person 1',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'tpcMetPerson2',
    label: 'Third Party Confirmation 2',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'nameOfTpc2',
    label: 'TPC Met Person 2',
    type: 'text',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'companyNameBoard',
    label: 'Company Name Board',
    type: 'select',
    conditional: legacyCondition(
      'constructionActivity',
      'notEquals',
      'PLOT IS VACANT',
    ),
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text' },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Neighbour',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  // Property APF uses constructionActivity-driven Final Status:
  //   SEEN                                         → [Positive, Refer]
  //   CONSTRUCTION IS STOP  |  PLOT IS VACANT      → [Negative, Refer]
  // Two mutually-exclusive conditional fields below both map to
  // DB column `final_status` (see propertyApfFormFieldMapping.ts).
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'equals', 'SEEN'),
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
  {
    name: 'finalStatusNegative',
    label: 'Final Status',
    type: 'select',
    conditional: legacyCondition('constructionActivity', 'notEquals', 'SEEN'),
    requiredWhen: legacyCondition('constructionActivity', 'notEquals', 'SEEN'),
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const legacyEntryRestrictedPropertyApfFields = withLegacyPropertyApfOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    required: true,
  },
  {
    name: 'metPersonType',
    label: 'Met Person',
    type: 'select',
    options: toSelectOptions(legacyPropertyApfSelectOptions.metPersonErt),
    required: true,
  },
  {
    name: 'nameOfMetPerson',
    label: 'Name of Met Person',
    type: 'text',
    required: true,
  },
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
  {
    name: 'companyNameBoard',
    label: 'Company Name Board',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnBoard',
    label: 'Name on Board',
    type: 'text',
    conditional: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition('companyNameBoard', 'equals', 'SIGHTED AS'),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text' },
  {
    name: 'politicalConnection',
    label: 'Political Connection',
    type: 'select',
    required: true,
  },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'feedbackFromNeighbour',
    label: 'Feedback from Met Person',
    type: 'select',
    required: true,
  },
  { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    // Fraud removed from APF per 2026-04-19 decision.
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const legacyUntraceablePropertyApfFields = withLegacyPropertyApfOrder([
  {
    name: 'contactPerson',
    label: 'Contact Person',
    type: 'text',
    required: true,
  },
  { name: 'callRemark', label: 'Call Remark', type: 'select', required: true },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
  { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    // Fraud removed from APF per 2026-04-19 decision.
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
    ],
  },
]);

const normalizedPropertyApfOutcome = (
  rawOutcome: string,
): PropertyApfOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT'))
    return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND'))
    return 'UNTRACEABLE';
  return 'POSITIVE';
};

const legacyPropertyApfFieldsByOutcome: Record<
  PropertyApfOutcome,
  FormFieldTemplate[]
> = {
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
    name: `Property APF Verification - ${normalizedOutcome
      .split('_')
      .join(' ')}`,
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
  buildingStatusApf: [
    'New Construction',
    'Redeveloped Construction',
    'Under Construction',
    'Vacant Place',
  ],
  flatStatusApf: ['Open', 'Closed'],
};

const legacyPropertyIndividualOptionAliases: Record<string, string> = {
  buildingStatus: 'buildingStatusApf',
  flatStatus: 'flatStatusApf',
  tpcMetPerson1: 'tpcMetPerson',
  tpcMetPerson2: 'tpcMetPerson',
  tpcConfirmation1: 'tpcConfirmation',
  tpcConfirmation2: 'tpcConfirmation',
  metPerson: 'metPersonErt',
};

const withLegacyPropertyIndividualOrder = (
  fields: ResidenceFieldInput[],
): FormFieldTemplate[] =>
  fields.map((field, index) => {
    const optionKey =
      legacyPropertyIndividualOptionAliases[field.name] || field.name;
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

const legacyPositivePropertyIndividualFields =
  withLegacyPropertyIndividualOrder([
    {
      name: 'addressLocatable',
      label: 'Address Locatable',
      type: 'select',
      required: true,
    },
    {
      name: 'addressRating',
      label: 'Address Rating',
      type: 'select',
      required: true,
    },
    {
      name: 'buildingStatus',
      label: 'Building Status',
      type: 'select',
      required: true,
    },
    {
      name: 'flatStatus',
      label: 'Flat Status',
      type: 'select',
      required: true,
    },
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
      name: 'propertyOwnerName',
      label: 'Property Owner Name',
      type: 'text',
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
    {
      name: 'tpcMetPerson1',
      label: 'TPC Met Person 1',
      type: 'select',
      required: true,
    },
    {
      name: 'nameOfTpc1',
      label: 'Name of TPC 1',
      type: 'text',
      required: true,
    },
    {
      name: 'tpcConfirmation1',
      label: 'TPC Confirmation 1',
      type: 'select',
      required: true,
    },
    {
      name: 'tpcMetPerson2',
      label: 'TPC Met Person 2',
      type: 'select',
      required: true,
    },
    {
      name: 'nameOfTpc2',
      label: 'Name of TPC 2',
      type: 'text',
      required: true,
    },
    {
      name: 'tpcConfirmation2',
      label: 'TPC Confirmation 2',
      type: 'select',
      required: true,
    },
    { name: 'locality', label: 'Locality', type: 'select', required: true },
    {
      name: 'addressStructure',
      label: 'Address Structure',
      type: 'select',
      required: true,
    },
    {
      name: 'addressExistAt',
      label: 'Address Exist At',
      type: 'select',
      required: true,
    },
    {
      name: 'addressStructureColor',
      label: 'Address Structure Color',
      type: 'select',
      required: true,
    },
    { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
    {
      name: 'doorNamePlateStatus',
      label: 'Door Name Plate',
      type: 'select',
      required: true,
    },
    {
      name: 'nameOnDoorPlate',
      label: 'Name on Door Plate',
      type: 'text',
      conditional: legacyCondition(
        'doorNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
      requiredWhen: legacyCondition(
        'doorNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
    },
    {
      name: 'societyNamePlateStatus',
      label: 'Society Name Plate',
      type: 'select',
      required: true,
    },
    {
      name: 'nameOnSocietyBoard',
      label: 'Name on Society Board',
      type: 'text',
      conditional: legacyCondition(
        'societyNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
      requiredWhen: legacyCondition(
        'societyNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
    },
    { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
    { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
    {
      name: 'politicalConnection',
      label: 'Political Connection',
      type: 'select',
      required: true,
    },
    {
      name: 'dominatedArea',
      label: 'Dominated Area',
      type: 'select',
      required: true,
    },
    {
      name: 'feedbackFromNeighbour',
      label: 'Feedback from Neighbour',
      type: 'select',
      required: true,
    },
    {
      name: 'otherObservation',
      label: 'Other Observation',
      type: 'textarea',
      required: true,
    },
    {
      name: 'finalStatus',
      label: 'Final Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Positive', value: 'Positive' },
        { label: 'Refer', value: 'Refer' },
      ],
    },
  ]);

const legacyNspPropertyIndividualFields = withLegacyPropertyIndividualOrder([
  {
    name: 'addressLocatable',
    label: 'Address Locatable',
    type: 'select',
    required: true,
  },
  {
    name: 'addressRating',
    label: 'Address Rating',
    type: 'select',
    required: true,
  },
  {
    name: 'buildingStatus',
    label: 'Building Status',
    type: 'select',
    required: true,
  },
  { name: 'flatStatus', label: 'Flat Status', type: 'select', required: true },
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
    name: 'propertyOwnerName',
    label: 'Property Owner Name',
    type: 'text',
    conditional: legacyCondition('flatStatus', 'equals', 'Open'),
    requiredWhen: legacyCondition('flatStatus', 'equals', 'Open'),
  },
  {
    name: 'tpcMetPerson1',
    label: 'TPC Met Person 1',
    type: 'select',
    required: true,
  },
  { name: 'nameOfTpc1', label: 'Name of TPC 1', type: 'text', required: true },
  {
    name: 'tpcConfirmation1',
    label: 'TPC Confirmation 1',
    type: 'select',
    required: true,
  },
  {
    name: 'tpcMetPerson2',
    label: 'TPC Met Person 2',
    type: 'select',
    required: true,
  },
  { name: 'nameOfTpc2', label: 'Name of TPC 2', type: 'text', required: true },
  {
    name: 'tpcConfirmation2',
    label: 'TPC Confirmation 2',
    type: 'select',
    required: true,
  },
  { name: 'locality', label: 'Locality', type: 'select', required: true },
  {
    name: 'addressStructure',
    label: 'Address Structure',
    type: 'select',
    required: true,
  },
  {
    name: 'addressStructureColor',
    label: 'Address Structure Color',
    type: 'select',
    required: true,
  },
  { name: 'doorColor', label: 'Door Color', type: 'select', required: true },
  {
    name: 'doorNamePlateStatus',
    label: 'Door Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnDoorPlate',
    label: 'Name on Door Plate',
    type: 'text',
    conditional: legacyCondition('doorNamePlateStatus', 'equals', 'SIGHTED AS'),
    requiredWhen: legacyCondition(
      'doorNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  {
    name: 'societyNamePlateStatus',
    label: 'Society Name Plate',
    type: 'select',
    required: true,
  },
  {
    name: 'nameOnSocietyBoard',
    label: 'Name on Society Board',
    type: 'text',
    conditional: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
    requiredWhen: legacyCondition(
      'societyNamePlateStatus',
      'equals',
      'SIGHTED AS',
    ),
  },
  { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
  { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
  {
    name: 'dominatedArea',
    label: 'Dominated Area',
    type: 'select',
    required: true,
  },
  {
    name: 'otherObservation',
    label: 'Other Observation',
    type: 'textarea',
    required: true,
  },
  {
    name: 'finalStatus',
    label: 'Final Status',
    type: 'select',
    required: true,
    options: [
      { label: 'Negative', value: 'Negative' },
      { label: 'Refer', value: 'Refer' },
      { label: 'Fraud', value: 'Fraud' },
    ],
  },
]);

const legacyEntryRestrictedPropertyIndividualFields =
  withLegacyPropertyIndividualOrder([
    {
      name: 'addressLocatable',
      label: 'Address Locatable',
      type: 'select',
      required: true,
    },
    {
      name: 'addressRating',
      label: 'Address Rating',
      type: 'select',
      required: true,
    },
    {
      name: 'flatStatus',
      label: 'Flat Status',
      type: 'select',
      required: true,
    },
    {
      name: 'metPersonType',
      label: 'Met Person',
      type: 'select',
      options: toSelectOptions(
        legacyPropertyIndividualSelectOptions.metPersonErt,
      ),
      required: true,
    },
    {
      name: 'nameOfMetPerson',
      label: 'Name of Met Person',
      type: 'text',
      required: true,
    },
    {
      name: 'metPersonConfirmation',
      label: 'Met Person Confirmation',
      type: 'select',
      options: toSelectOptions(
        legacyPropertyIndividualSelectOptions.tpcConfirmation,
      ),
      required: true,
    },
    {
      name: 'propertyOwnerName',
      label: 'Property Owner Name',
      type: 'text',
      required: true,
    },
    { name: 'locality', label: 'Locality', type: 'select', required: true },
    {
      name: 'addressStructure',
      label: 'Address Structure',
      type: 'select',
      required: true,
    },
    {
      name: 'addressStructureColor',
      label: 'Address Structure Color',
      type: 'select',
      required: true,
    },
    {
      name: 'societyNamePlateStatus',
      label: 'Society Name Plate',
      type: 'select',
      required: true,
    },
    {
      name: 'nameOnSocietyBoard',
      label: 'Name on Society Board',
      type: 'text',
      conditional: legacyCondition(
        'societyNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
      requiredWhen: legacyCondition(
        'societyNamePlateStatus',
        'equals',
        'SIGHTED AS',
      ),
    },
    { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
    { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
    {
      name: 'buildingStatus',
      label: 'Building Status',
      type: 'select',
      required: true,
    },
    {
      name: 'politicalConnection',
      label: 'Political Connection',
      type: 'select',
      required: true,
    },
    {
      name: 'dominatedArea',
      label: 'Dominated Area',
      type: 'select',
      required: true,
    },
    {
      name: 'feedbackFromNeighbour',
      label: 'Feedback from Met Person',
      type: 'select',
      required: true,
    },
    { name: 'otherObservation', label: 'Other Observation', type: 'textarea' },
    {
      name: 'finalStatus',
      label: 'Final Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Negative', value: 'Negative' },
        { label: 'Refer', value: 'Refer' },
        { label: 'Fraud', value: 'Fraud' },
      ],
    },
  ]);

const legacyUntraceablePropertyIndividualFields =
  withLegacyPropertyIndividualOrder([
    {
      name: 'contactPerson',
      label: 'Contact Person',
      type: 'text',
      required: true,
    },
    {
      name: 'callRemark',
      label: 'Call Remark',
      type: 'select',
      required: true,
    },
    { name: 'locality', label: 'Locality', type: 'select', required: true },
    { name: 'landmark1', label: 'Landmark 1', type: 'text', required: true },
    { name: 'landmark2', label: 'Landmark 2', type: 'text', required: true },
    { name: 'landmark3', label: 'Landmark 3', type: 'text', required: true },
    { name: 'landmark4', label: 'Landmark 4', type: 'text', required: true },
    {
      name: 'dominatedArea',
      label: 'Dominated Area',
      type: 'select',
      required: true,
    },
    {
      name: 'otherObservation',
      label: 'Other Observation',
      type: 'textarea',
      required: true,
    },
    {
      name: 'finalStatus',
      label: 'Final Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Negative', value: 'Negative' },
        { label: 'Refer', value: 'Refer' },
        { label: 'Fraud', value: 'Fraud' },
      ],
    },
  ]);

const normalizedPropertyIndividualOutcome = (
  rawOutcome: string,
): PropertyIndividualOutcome => {
  const value = rawOutcome.trim().toUpperCase();
  if (value.includes('ENTRY') || value.includes('RESTRICT'))
    return 'ENTRY_RESTRICTED';
  if (value.includes('UNTRACEABLE') || value.includes('NOT FOUND'))
    return 'UNTRACEABLE';
  if (
    value.includes('NSP') ||
    value.includes('PERSON NOT MET') ||
    value.includes('SHIFTED')
  )
    return 'NSP';
  return 'POSITIVE';
};

const legacyPropertyIndividualFieldsByOutcome: Record<
  PropertyIndividualOutcome,
  FormFieldTemplate[]
> = {
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
    name: `Property Individual Verification - ${normalizedOutcome
      .split('_')
      .join(' ')}`,
    description:
      'Loaded from native legacy Property Individual form definition',
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
