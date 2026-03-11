import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { FormRepository } from '../../repositories/FormRepository';
import type { FormTemplate } from '../../types/api';
import { toBackendFormType, type FormTypeKey } from '../../utils/formTypeKey';

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
  async loadTemplate({
    verificationType,
    outcome,
    getLegacyTemplate,
  }: LoadFormTemplateParams): Promise<FormTemplate | null> {
    const legacyTemplate = getLegacyTemplate(verificationType, outcome);
    if (legacyTemplate) {
      return legacyTemplate;
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

      return {
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

    return {
      ...backendTemplate,
      outcome,
    };
  }
}

export const FormTemplateService = new FormTemplateServiceClass();
export default FormTemplateService;
