import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { FormRepository } from '../../repositories/FormRepository';
import type { FormFieldTemplate, FormTemplate } from '../../types/api';
import { toBackendFormType, type FormTypeKey } from '../../utils/formTypeKey';

const toOptions = (values: string[]): { label: string; value: string }[] =>
  values.map(value => ({ label: value, value }));

const COMMON_MET_PERSON_OPTIONS = [
  'Applicant Self',
  'Self',
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
  'Security',
  'Neighbour',
  'Other',
];

const COMMON_DESIGNATION_OPTIONS = [
  'Manager',
  'Executive',
  'Clerk',
  'Developer',
  'Analyst',
  'Assistant',
  'Reception',
  'Reception Security',
  'Company Security',
  'Owner',
  'Tenant',
  'Other',
];

const COMMON_BUSINESS_TYPE_OPTIONS = [
  'PVT. LTD. Company',
  'LTD. Company',
  'LLP Company',
  'Proprietorship Firm',
  'Partnership Firm',
];

const COMMON_OWNERSHIP_TYPE_OPTIONS = ['Are Partners', 'Are Directors', 'Is Proprietor'];
const COMMON_ADDRESS_STATUS_OPTIONS = [
  'On a Self Owned Basis',
  'On a Rental Basis',
  'On a Pagadi System',
  'In Share Work Place',
];
const COMMON_RELATIONSHIP_OPTIONS = [
  'Father',
  'Mother',
  'Spouse',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Self',
  'Owner',
  'Tenant',
  'Other',
];

const COMMON_COLOR_OPTIONS = ['White', 'Off-White', 'Cream', 'Yellow', 'Blue', 'Green', 'Red', 'Brown', 'Gray', 'Black', 'Pink', 'Orange', 'Mixed', 'Other'];

const COMMON_PERIOD_OPTIONS = ['Less than 1 Year', '1-3 Years', '3-5 Years', '5-10 Years', '10-15 Years', '15-20 Years', '20+ Years'];

const RESIDENCE_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,
  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const OFFICE_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const BUSINESS_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  businessType: COMMON_BUSINESS_TYPE_OPTIONS,
  ownershipType: COMMON_OWNERSHIP_TYPE_OPTIONS,
  addressStatus: COMMON_ADDRESS_STATUS_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const RESIDENCE_CUM_OFFICE_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const BUILDER_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  businessType: COMMON_BUSINESS_TYPE_OPTIONS,
  ownershipType: COMMON_OWNERSHIP_TYPE_OPTIONS,
  addressStatus: COMMON_ADDRESS_STATUS_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const NOC_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  ownershipType: COMMON_OWNERSHIP_TYPE_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const DSA_CONNECTOR_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  businessType: COMMON_BUSINESS_TYPE_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const PROPERTY_INDIVIDUAL_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  ownershipType: COMMON_OWNERSHIP_TYPE_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const PROPERTY_APF_DICTIONARY: Record<string, string[]> = {
  metPerson: COMMON_MET_PERSON_OPTIONS,

  nameOfMetPerson: COMMON_MET_PERSON_OPTIONS,
  designation: COMMON_DESIGNATION_OPTIONS,
  businessType: COMMON_BUSINESS_TYPE_OPTIONS,
  ownershipType: COMMON_OWNERSHIP_TYPE_OPTIONS,
  relationship: COMMON_RELATIONSHIP_OPTIONS,
  addressStructureColor: COMMON_COLOR_OPTIONS,
  doorColor: COMMON_COLOR_OPTIONS,
  stayingPeriod: COMMON_PERIOD_OPTIONS,
  workingPeriod: COMMON_PERIOD_OPTIONS,
  shiftedPeriod: COMMON_PERIOD_OPTIONS,
};

const DICTIONARY_BY_FORM_TYPE: Partial<Record<FormTypeKey, Record<string, string[]>>> = {
  residence: RESIDENCE_DICTIONARY,
  'residence-cum-office': RESIDENCE_CUM_OFFICE_DICTIONARY,
  office: OFFICE_DICTIONARY,
  business: BUSINESS_DICTIONARY,
  builder: BUILDER_DICTIONARY,
  noc: NOC_DICTIONARY,
  'dsa-connector': DSA_CONNECTOR_DICTIONARY,
  'property-individual': PROPERTY_INDIVIDUAL_DICTIONARY,
  'property-apf': PROPERTY_APF_DICTIONARY,
};

const shouldUpgradeFieldToDropdown = (field: FormFieldTemplate): boolean =>
  field.type === 'text' || field.type === 'textarea';

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

export interface LoadFormTemplateParams {
  verificationType: FormTypeKey;
  outcome: string;
  getLegacyTemplate: (verificationType: FormTypeKey, outcome: string) => FormTemplate | null;
}

class FormTemplateServiceClass {
  private applyDropdownDictionary(template: FormTemplate, verificationType: FormTypeKey): FormTemplate {
    const dictionary = DICTIONARY_BY_FORM_TYPE[verificationType];
    if (!dictionary) {
      return template;
    }

    return {
      ...template,
      sections: template.sections.map(section => ({
        ...section,
        fields: section.fields.map(field => {
          const key = (field.name || field.id || '').trim();
          const values = key ? dictionary[key] : undefined;
          if (!values || values.length === 0) {
            return field;
          }

          if (Array.isArray(field.options) && field.options.length > 0) {
            return field;
          }

          if (!shouldUpgradeFieldToDropdown(field)) {
            return field;
          }

          return {
            ...field,
            type: 'select',
            options: toOptions(values),
          };
        }),
      })),
    };
  }

  async loadTemplate({
    verificationType,
    outcome,
    getLegacyTemplate,
  }: LoadFormTemplateParams): Promise<FormTemplate | null> {
    const legacyTemplate = getLegacyTemplate(verificationType, outcome);
    if (legacyTemplate) {
      return this.applyDropdownDictionary(legacyTemplate, verificationType);
    }

    const tplData = await FormRepository.getCachedTemplate(verificationType, outcome);
    if (tplData) {
      const parsedSections = (() => {
        try {
          const parsed = JSON.parse(tplData.sections_json);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

      const cachedTemplate: FormTemplate = {
        id: 'local',
        formType: verificationType,
        verificationType,
        outcome,
        name: tplData.name,
        description: tplData.description || '',
        sections: parsedSections.map((section: any) => ({
          ...section,
          fields: Array.isArray(section.fields)
            ? section.fields.filter((field: any) => field.name !== 'outcome')
            : [],
        })),
        version: '1.0',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return this.applyDropdownDictionary(cachedTemplate, verificationType);
    }

    const backendFormType = toBackendFormType(verificationType);
    const response = await ApiClient.get<{ success: boolean; data?: any }>(
      ENDPOINTS.FORMS.TEMPLATE(backendFormType),
      { params: { outcome } },
    );

    if (!response.success || !response.data) {
      return null;
    }

    const backendTemplate = buildTemplateFromBackend(
      verificationType,
      outcome,
      response.data,
    );
    await FormRepository.saveTemplate({
      id: backendTemplate.id,
      formType: backendTemplate.formType,
      verificationType: backendTemplate.verificationType,
      outcome,
      name: backendTemplate.name,
      description: backendTemplate.description,
      sections: backendTemplate.sections,
      version: backendTemplate.version,
    });

    const finalTemplate: FormTemplate = {
      ...backendTemplate,
      outcome,
    };
    return this.applyDropdownDictionary(finalTemplate, verificationType);
  }
}

export const FormTemplateService = new FormTemplateServiceClass();
export default FormTemplateService;
