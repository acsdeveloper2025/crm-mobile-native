/**
 * Form type identifiers for auto-save functionality
 * These identifiers are used to distinguish between different verification forms
 * when saving and restoring auto-save data
 */

export const FORM_TYPES = {
  // Residence Forms
  RESIDENCE_POSITIVE: 'residence-positive',
  RESIDENCE_SHIFTED: 'residence-shifted',
  RESIDENCE_NSP: 'residence-nsp',
  RESIDENCE_ENTRY_RESTRICTED: 'residence-entry-restricted',
  RESIDENCE_UNTRACEABLE: 'residence-untraceable',

  // Office Forms
  OFFICE_POSITIVE: 'office-positive',
  OFFICE_SHIFTED: 'office-shifted',
  OFFICE_NSP: 'office-nsp',
  OFFICE_ENTRY_RESTRICTED: 'office-entry-restricted',
  OFFICE_UNTRACEABLE: 'office-untraceable',

  // Business Forms
  BUSINESS_POSITIVE: 'business-positive',
  BUSINESS_SHIFTED: 'business-shifted',
  BUSINESS_NSP: 'business-nsp',
  BUSINESS_ENTRY_RESTRICTED: 'business-entry-restricted',
  BUSINESS_UNTRACEABLE: 'business-untraceable',

  // Builder Forms
  BUILDER_POSITIVE: 'builder-positive',
  BUILDER_SHIFTED: 'builder-shifted',
  BUILDER_NSP: 'builder-nsp',
  BUILDER_ENTRY_RESTRICTED: 'builder-entry-restricted',
  BUILDER_UNTRACEABLE: 'builder-untraceable',

  // Residence-cum-Office Forms
  RESIDENCE_CUM_OFFICE_POSITIVE: 'residence-cum-office-positive',
  RESIDENCE_CUM_OFFICE_SHIFTED: 'residence-cum-office-shifted',
  RESIDENCE_CUM_OFFICE_NSP: 'residence-cum-office-nsp',
  RESIDENCE_CUM_OFFICE_ENTRY_RESTRICTED: 'residence-cum-office-entry-restricted',
  RESIDENCE_CUM_OFFICE_UNTRACEABLE: 'residence-cum-office-untraceable',

  // NOC Forms
  NOC_POSITIVE: 'noc-positive',
  NOC_SHIFTED: 'noc-shifted',
  NOC_NSP: 'noc-nsp',
  NOC_ENTRY_RESTRICTED: 'noc-entry-restricted',
  NOC_UNTRACEABLE: 'noc-untraceable',

  // Property Individual Forms
  PROPERTY_INDIVIDUAL_POSITIVE: 'property-individual-positive',
  PROPERTY_INDIVIDUAL_NSP: 'property-individual-nsp',
  PROPERTY_INDIVIDUAL_ENTRY_RESTRICTED: 'property-individual-entry-restricted',
  PROPERTY_INDIVIDUAL_UNTRACEABLE: 'property-individual-untraceable',

  // Property APF Forms
  PROPERTY_APF_POSITIVE: 'property-apf-positive',
  PROPERTY_APF_NSP: 'property-apf-nsp',
  PROPERTY_APF_POSITIVE_NEGATIVE: 'property-apf-positive-negative',
  PROPERTY_APF_ENTRY_RESTRICTED: 'property-apf-entry-restricted',
  PROPERTY_APF_UNTRACEABLE: 'property-apf-untraceable',

  // DSA/DST Connector Forms
  DSA_POSITIVE: 'dsa-positive',
  DSA_SHIFTED: 'dsa-shifted',
  DSA_NSP: 'dsa-nsp',
  DSA_ENTRY_RESTRICTED: 'dsa-entry-restricted',
  DSA_UNTRACEABLE: 'dsa-untraceable',
} as const;

/**
 * Get all form types as an array for use in auto-save detection
 */
export const getAllFormTypes = (): string[] => {
  return Object.values(FORM_TYPES);
};

/**
 * Get form types by category for easier management
 */
export const getFormTypesByCategory = () => {
  return {
    residence: [
      FORM_TYPES.RESIDENCE_POSITIVE,
      FORM_TYPES.RESIDENCE_SHIFTED,
      FORM_TYPES.RESIDENCE_NSP,
      FORM_TYPES.RESIDENCE_ENTRY_RESTRICTED,
      FORM_TYPES.RESIDENCE_UNTRACEABLE,
    ],
    office: [
      FORM_TYPES.OFFICE_POSITIVE,
      FORM_TYPES.OFFICE_SHIFTED,
      FORM_TYPES.OFFICE_NSP,
      FORM_TYPES.OFFICE_ENTRY_RESTRICTED,
      FORM_TYPES.OFFICE_UNTRACEABLE,
    ],
    business: [
      FORM_TYPES.BUSINESS_POSITIVE,
      FORM_TYPES.BUSINESS_SHIFTED,
      FORM_TYPES.BUSINESS_NSP,
      FORM_TYPES.BUSINESS_ENTRY_RESTRICTED,
      FORM_TYPES.BUSINESS_UNTRACEABLE,
    ],
    builder: [
      FORM_TYPES.BUILDER_POSITIVE,
      FORM_TYPES.BUILDER_SHIFTED,
      FORM_TYPES.BUILDER_NSP,
      FORM_TYPES.BUILDER_ENTRY_RESTRICTED,
      FORM_TYPES.BUILDER_UNTRACEABLE,
    ],
    residenceCumOffice: [
      FORM_TYPES.RESIDENCE_CUM_OFFICE_POSITIVE,
      FORM_TYPES.RESIDENCE_CUM_OFFICE_SHIFTED,
      FORM_TYPES.RESIDENCE_CUM_OFFICE_NSP,
      FORM_TYPES.RESIDENCE_CUM_OFFICE_ENTRY_RESTRICTED,
      FORM_TYPES.RESIDENCE_CUM_OFFICE_UNTRACEABLE,
    ],
    noc: [
      FORM_TYPES.NOC_POSITIVE,
      FORM_TYPES.NOC_SHIFTED,
      FORM_TYPES.NOC_NSP,
      FORM_TYPES.NOC_ENTRY_RESTRICTED,
      FORM_TYPES.NOC_UNTRACEABLE,
    ],
    propertyIndividual: [
      FORM_TYPES.PROPERTY_INDIVIDUAL_POSITIVE,
      FORM_TYPES.PROPERTY_INDIVIDUAL_NSP,
      FORM_TYPES.PROPERTY_INDIVIDUAL_ENTRY_RESTRICTED,
      FORM_TYPES.PROPERTY_INDIVIDUAL_UNTRACEABLE,
    ],
    propertyApf: [
      FORM_TYPES.PROPERTY_APF_POSITIVE_NEGATIVE,
      FORM_TYPES.PROPERTY_APF_ENTRY_RESTRICTED,
      FORM_TYPES.PROPERTY_APF_UNTRACEABLE,
    ],
    dsa: [
      FORM_TYPES.DSA_POSITIVE,
      FORM_TYPES.DSA_SHIFTED,
      FORM_TYPES.DSA_NSP,
      FORM_TYPES.DSA_ENTRY_RESTRICTED,
      FORM_TYPES.DSA_UNTRACEABLE,
    ],
  };
};

/**
 * Helper function to get form type based on verification type and outcome
 */
export const getFormType = (verificationType: string, outcome: string): string => {
  const normalizedVerificationType = verificationType.toLowerCase().replace(/\s+/g, '-');
  const normalizedOutcome = outcome.toLowerCase().replace(/\s+/g, '-');
  
  return `${normalizedVerificationType}-${normalizedOutcome}`;
};

export type FormType = typeof FORM_TYPES[keyof typeof FORM_TYPES];
