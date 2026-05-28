import type { FormFieldCondition, FormTemplate } from '../../types/api';

const toArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value];

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
    case 'equals':
      return actual === expected;
    case 'notEquals':
      return actual !== expected;
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected);
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'notContains':
      if (Array.isArray(actual)) return !actual.includes(expected);
      return !String(actual ?? '').includes(String(expected ?? ''));
    case 'greaterThan': {
      // M3 (audit 2026-04-21): short-circuit when either side isn't a
      // real number. `Number(undefined)` / `Number('')` → NaN, and
      // NaN > N is always false — so a conditional predicate using
      // greaterThan against a missing field would look "false" even
      // when the author meant "no value; doesn't apply". Returning
      // false stays consistent but we now explicitly document it.
      const a = Number(actual);
      const e = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(e)) return false;
      return a > e;
    }
    case 'lessThan': {
      const a = Number(actual);
      const e = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(e)) return false;
      return a < e;
    }
    case 'in':
      return toArray(expected).includes(actual);
    case 'notIn':
      return !toArray(expected).includes(actual);
    case 'isTruthy':
      return !isEmptyFieldValue(actual) && !!actual;
    case 'isFalsy':
      return isEmptyFieldValue(actual) || !actual;
    default:
      return true;
  }
};

export const validateTemplateRequiredFields = (
  currentTemplate: FormTemplate,
  values: Record<string, unknown>,
): { isValid: boolean; missingFields: string[]; missingKeys: string[] } => {
  const missingFields: string[] = [];
  const missingKeys: string[] = [];
  const isEnumField = (fieldType: string): boolean =>
    fieldType === 'select' ||
    fieldType === 'radio' ||
    fieldType === 'multiselect';

  // Bug 82 (2026-05-07): conditional may be a single FormFieldCondition OR
  // an array (AND-combined, mirrors requiredWhen contract). Empty array means
  // "no extra gating".
  const conditionVisible = (
    cond: FormFieldCondition | FormFieldCondition[] | undefined,
  ): boolean => {
    if (!cond) return true;
    const list = Array.isArray(cond) ? cond : [cond];
    if (list.length === 0) return true;
    return list.every(c => evaluateFieldCondition(c, values));
  };

  for (const section of currentTemplate.sections) {
    if (!conditionVisible(section.conditional)) {
      continue;
    }

    for (const field of section.fields) {
      if (!conditionVisible(field.conditional)) {
        continue;
      }

      const requiredByDefault = Boolean(field.required);
      const requiredWhen = Array.isArray(field.requiredWhen)
        ? field.requiredWhen.every(condition =>
            evaluateFieldCondition(condition, values),
          )
        : field.requiredWhen
        ? evaluateFieldCondition(field.requiredWhen, values)
        : false;

      const valueKey = field.name || field.id;
      const value = values[valueKey];
      if ((requiredByDefault || requiredWhen) && isEmptyFieldValue(value)) {
        missingFields.push(field.label);
        missingKeys.push(valueKey);
        continue;
      }

      if (
        isEnumField(field.type) &&
        Array.isArray(field.options) &&
        field.options.length > 0
      ) {
        const allowed = new Set(
          field.options.map(option => String(option.value)),
        );
        if (field.type === 'multiselect') {
          const arr = Array.isArray(value) ? value : [];
          const hasInvalidValue = arr.some(item => !allowed.has(String(item)));
          if (hasInvalidValue) {
            missingFields.push(field.label);
            missingKeys.push(valueKey);
          }
          continue;
        }

        if (!isEmptyFieldValue(value) && !allowed.has(String(value))) {
          missingFields.push(field.label);
          missingKeys.push(valueKey);
        }
      }
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    missingKeys,
  };
};
