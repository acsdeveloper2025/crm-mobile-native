import type { FormFieldCondition, FormTemplate } from '../../types/api';

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

export const isEmptyFieldValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export const evaluateFieldCondition = (
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
    case 'isTruthy': return !isEmptyFieldValue(actual) && !!actual;
    case 'isFalsy': return isEmptyFieldValue(actual) || !actual;
    default: return true;
  }
};

export const validateTemplateRequiredFields = (
  currentTemplate: FormTemplate,
  values: Record<string, unknown>,
): { isValid: boolean; missingFields: string[] } => {
  const missingFields: string[] = [];

  for (const section of currentTemplate.sections) {
    if (section.conditional && !evaluateFieldCondition(section.conditional, values)) {
      continue;
    }

    for (const field of section.fields) {
      if (field.conditional && !evaluateFieldCondition(field.conditional, values)) {
        continue;
      }

      const requiredByDefault = Boolean(field.required);
      const requiredWhen = Array.isArray(field.requiredWhen)
        ? field.requiredWhen.every(condition => evaluateFieldCondition(condition, values))
        : field.requiredWhen
          ? evaluateFieldCondition(field.requiredWhen, values)
          : false;

      const valueKey = field.name || field.id;
      if ((requiredByDefault || requiredWhen) && isEmptyFieldValue(values[valueKey])) {
        missingFields.push(field.label);
      }
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
};
