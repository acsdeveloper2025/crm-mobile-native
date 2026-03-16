import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { useTheme } from '../../context/ThemeContext';
import type { FormTemplate, FormSectionTemplate, FormFieldTemplate } from '../../types/api';

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const isEmptyFieldValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const evaluateCondition = (condition: any, values: Record<string, unknown>): boolean => {
  const actualValue = values[condition.field];
  const expectedValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return actualValue === expectedValue;
    case 'notEquals':
      return actualValue !== expectedValue;
    case 'contains':
      if (Array.isArray(actualValue)) return actualValue.includes(expectedValue);
      return String(actualValue ?? '').includes(String(expectedValue ?? ''));
    case 'notContains':
      if (Array.isArray(actualValue)) return !actualValue.includes(expectedValue);
      return !String(actualValue ?? '').includes(String(expectedValue ?? ''));
    case 'greaterThan':
      return Number(actualValue) > Number(expectedValue);
    case 'lessThan':
      return Number(actualValue) < Number(expectedValue);
    case 'in':
      return toArray(expectedValue).includes(actualValue);
    case 'notIn':
      return !toArray(expectedValue).includes(actualValue);
    case 'isTruthy':
      return !isEmptyFieldValue(actualValue) && !!actualValue;
    case 'isFalsy':
      return isEmptyFieldValue(actualValue) || !actualValue;
    default:
      return true;
  }
};

const isSectionVisible = (
  section: FormSectionTemplate,
  values: Record<string, unknown>,
): boolean => {
  if (!section.conditional) return true;
  return evaluateCondition(section.conditional, values);
};

const isFieldVisible = (
  field: FormFieldTemplate,
  values: Record<string, unknown>,
): boolean => {
  if (!field.conditional) return true;
  return evaluateCondition(field.conditional, values);
};

const isFieldRequired = (
  field: FormFieldTemplate,
  values: Record<string, unknown>,
): boolean => {
  const alwaysRequired = Boolean(field.required);
  if (!field.requiredWhen) return alwaysRequired;

  const conditions = Array.isArray(field.requiredWhen) ? field.requiredWhen : [field.requiredWhen];
  const requiredByCondition = conditions.every(condition => evaluateCondition(condition, values));
  return alwaysRequired || requiredByCondition;
};

export interface DynamicFormBuilderProps {
  template: FormTemplate | null;
  formValues: Record<string, any>;
  onFieldChange: (fieldId: string, value: any) => void;
  validationErrors?: Record<string, string>;
}

export const DynamicFormBuilder: React.FC<DynamicFormBuilderProps> = ({
  template,
  formValues,
  onFieldChange,
  validationErrors = {}
}) => {
  const { theme } = useTheme();

  const visibleSections = useMemo(() => {
    if (!template) {
      return [];
    }

    return (Array.isArray(template.sections) ? template.sections : [])
      .filter((section: FormSectionTemplate) => isSectionVisible(section, formValues))
      .map((section: FormSectionTemplate, index: number) => {
        const sectionKey = section.id || `${section.title || 'section'}_${index}`;
        const visibleFields = (Array.isArray(section.fields) ? section.fields : [])
          .filter(field => isFieldVisible(field, formValues))
          .map(field => {
            const valueKey = field.name || field.id;
            return {
              key: valueKey,
              field: { ...field, id: valueKey, required: isFieldRequired(field, formValues) },
            };
          });

        return {
          index,
          section,
          sectionKey,
          visibleFields,
        };
      })
      .filter(section => section.visibleFields.length > 0);
  }, [formValues, template]);

  if (!template) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Loading form template...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.formTitle, { color: theme.colors.text }]}>{template.name}</Text>
      {template.description ? (
        <Text style={[styles.formDescription, { color: theme.colors.textSecondary }]}>{template.description}</Text>
      ) : null}

      {visibleSections.map(({ index, section, sectionKey, visibleFields }) => (
        <View key={sectionKey} style={[styles.sectionContainer, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <View style={[styles.sectionHeader, { backgroundColor: theme.colors.surfaceAlt, borderBottomColor: theme.colors.border }]}>
            <View style={[styles.sectionBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.sectionBadgeText, { color: theme.colors.surface }]}>{index + 1}</Text>
            </View>
            <View style={styles.sectionTextWrap}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
              {section.description ? (
                <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>{section.description}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldsContainer}>
            {visibleFields.map(({ key, field }) => (
              <DynamicFieldRenderer
                key={`${sectionKey}_${key}`}
                field={field}
                value={formValues[key]}
                onChange={onFieldChange}
                error={validationErrors[key]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 14,
  },
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  fieldsContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  }
});
