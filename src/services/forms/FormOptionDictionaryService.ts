import type { FormFieldTemplate, FormTemplate } from '../../types/api';
import type { FormTypeKey } from '../../utils/formTypeKey';

const toOptions = (values: string[]): { label: string; value: string }[] =>
  values.map(value => ({ label: value, value }));

const RESIDENCE_DICTIONARY: Record<string, string[]> = {
  metPersonName: ['Self', 'Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Neighbour', 'Security', 'Receptionist', 'Other'],
};

const OFFICE_DICTIONARY: Record<string, string[]> = {
  metPerson: ['Applicant Self', 'Reception', 'Reception Security', 'Company Security', 'Manager / H.R.', 'SR. Officer', 'Accountant', 'Admin', 'Office Staff', 'Clark', 'Principal', 'Other'],
  metPersonName: ['Applicant Self', 'Reception', 'Reception Security', 'Company Security', 'Manager / H.R.', 'SR. Officer', 'Accountant', 'Admin', 'Office Staff', 'Clark', 'Principal', 'Other'],
  designation: ['Manager', 'Executive', 'Clerk', 'Developer', 'Analyst', 'Assistant', 'Reception', 'Reception Security', 'Company Security', 'Other'],
};

const BUSINESS_DICTIONARY: Record<string, string[]> = {
  metPerson: ['Applicant Self', 'Reception', 'Reception Security', 'Company Security', 'Manager / H.R.', 'SR. Officer', 'Accountant', 'Admin', 'Office Staff', 'Clark', 'Principal', 'Other'],
  metPersonName: ['Applicant Self', 'Reception', 'Reception Security', 'Company Security', 'Manager / H.R.', 'SR. Officer', 'Accountant', 'Admin', 'Office Staff', 'Clark', 'Principal', 'Other'],
  designation: ['Applicant Self', 'Reception', 'Reception Security', 'Company Security', 'Manager / H.R.', 'SR. Officer', 'Accountant', 'Admin', 'Office Staff', 'Clark', 'Principal', 'Other'],
  businessType: ['PVT. LTD. Company', 'LTD. Company', 'LLP Company', 'Proprietorship Firm', 'Partnership Firm'],
  ownershipType: ['Are Partners', 'Are Directors', 'Is Proprietor'],
  addressStatus: ['On a Self Owned Basis', 'On a Rental Basis', 'On a Pagadi System', 'In Share Work Place'],
};

const DICTIONARY_BY_FORM_TYPE: Partial<Record<FormTypeKey, Record<string, string[]>>> = {
  residence: RESIDENCE_DICTIONARY,
  office: OFFICE_DICTIONARY,
  business: BUSINESS_DICTIONARY,
};

const shouldUpgradeFieldToDropdown = (field: FormFieldTemplate): boolean =>
  field.type === 'text' || field.type === 'textarea';

class FormOptionDictionaryServiceClass {
  private getFieldDictionary(formType: FormTypeKey | null): Record<string, string[]> | null {
    if (!formType) {
      return null;
    }
    return DICTIONARY_BY_FORM_TYPE[formType] || null;
  }

  enhanceTemplate(template: FormTemplate, formType: FormTypeKey | null): FormTemplate {
    const dictionary = this.getFieldDictionary(formType);
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
}

export const FormOptionDictionaryService = new FormOptionDictionaryServiceClass();
export default FormOptionDictionaryService;
