export type FormTypeKey =
  | 'residence'
  | 'residence-cum-office'
  | 'office'
  | 'business'
  | 'builder'
  | 'noc'
  | 'dsa-connector'
  | 'property-individual'
  | 'property-apf';

export const FORM_TYPE_KEYS_IN_ORDER: readonly FormTypeKey[] = [
  'residence',
  'residence-cum-office',
  'office',
  'business',
  'builder',
  'noc',
  'dsa-connector',
  'property-individual',
  'property-apf',
] as const;

const FORM_TYPE_KEY_TO_BACKEND: Record<FormTypeKey, string> = {
  residence: 'RESIDENCE',
  'residence-cum-office': 'RESIDENCE_CUM_OFFICE',
  office: 'OFFICE',
  business: 'BUSINESS',
  builder: 'BUILDER',
  noc: 'NOC',
  'dsa-connector': 'DSA_CONNECTOR',
  'property-individual': 'PROPERTY_INDIVIDUAL',
  'property-apf': 'PROPERTY_APF',
};

const BACKEND_FORM_TYPE_TO_KEY: Record<string, FormTypeKey> = {
  RESIDENCE: 'residence',
  RESIDENCE_VERIFICATION: 'residence',
  RESIDENCE_CUM_OFFICE: 'residence-cum-office',
  RESIDENCE_CUM_OFFICE_VERIFICATION: 'residence-cum-office',
  OFFICE: 'office',
  OFFICE_VERIFICATION: 'office',
  BUSINESS: 'business',
  BUSINESS_VERIFICATION: 'business',
  BUILDER: 'builder',
  BUILDER_VERIFICATION: 'builder',
  NOC: 'noc',
  NOC_VERIFICATION: 'noc',
  DSA_CONNECTOR: 'dsa-connector',
  CONNECTOR: 'dsa-connector',
  DSA: 'dsa-connector',
  PROPERTY_INDIVIDUAL: 'property-individual',
  PROPERTY_INDIVIDUAL_VERIFICATION: 'property-individual',
  PROPERTY_APF: 'property-apf',
  PROPERTY_APF_VERIFICATION: 'property-apf',
};

const VERIFICATION_TYPE_NAME_TO_KEY: Record<string, FormTypeKey> = {
  residence: 'residence',
  'residence verification': 'residence',
  'residence cum office': 'residence-cum-office',
  'residence cum office verification': 'residence-cum-office',
  office: 'office',
  'office verification': 'office',
  business: 'business',
  'business verification': 'business',
  builder: 'builder',
  'builder verification': 'builder',
  noc: 'noc',
  'noc verification': 'noc',
  'dsa dst connector': 'dsa-connector',
  'dsa dst connector verification': 'dsa-connector',
  'dsa connector': 'dsa-connector',
  'dsa connector verification': 'dsa-connector',
  connector: 'dsa-connector',
  'property individual': 'property-individual',
  'property individual verification': 'property-individual',
  'property apf': 'property-apf',
  'property apf verification': 'property-apf',
};

const normalizeCodeToken = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');

const normalizeNameToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[/_]+/g, ' ')
    .replace(/&/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');

const resolveFormTypeKeyFromString = (rawValue: string | null | undefined): FormTypeKey | null => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  const kebabValue = value.toLowerCase().replace(/[_\s]+/g, '-') as FormTypeKey;
  if (kebabValue in FORM_TYPE_KEY_TO_BACKEND) {
    return kebabValue;
  }

  const normalizedCode = normalizeCodeToken(value);
  if (normalizedCode in BACKEND_FORM_TYPE_TO_KEY) {
    return BACKEND_FORM_TYPE_TO_KEY[normalizedCode];
  }

  const normalizedName = normalizeNameToken(value);
  if (normalizedName in VERIFICATION_TYPE_NAME_TO_KEY) {
    return VERIFICATION_TYPE_NAME_TO_KEY[normalizedName];
  }

  return null;
};

export interface FormTypeKeyResolverInput {
  formType?: string | null;
  verificationTypeCode?: string | null;
  verificationTypeName?: string | null;
  verificationType?: string | null;
}

export const resolveFormTypeKey = (
  input: string | FormTypeKeyResolverInput,
): FormTypeKey | null => {
  if (typeof input === 'string') {
    return resolveFormTypeKeyFromString(input);
  }

  return (
    resolveFormTypeKeyFromString(input.formType) ||
    resolveFormTypeKeyFromString(input.verificationTypeCode) ||
    resolveFormTypeKeyFromString(input.verificationTypeName) ||
    resolveFormTypeKeyFromString(input.verificationType)
  );
};

export const toBackendFormType = (formTypeKey: FormTypeKey): string =>
  FORM_TYPE_KEY_TO_BACKEND[formTypeKey];
