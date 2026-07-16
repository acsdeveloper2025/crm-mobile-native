import type { FormFieldCondition, FormTemplate } from '../../types/api';

// 2026-07-16: single source of truth for the evidence minimums. Previously
// hard-coded independently in VerificationFormScreen (UI badges),
// FormSubmissionService and SubmitVerificationUseCase — copies drift.
export const MIN_VERIFICATION_PHOTOS = 5;
export const MIN_SELFIE_PHOTOS = 1;

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
): {
  isValid: boolean;
  missingFields: string[];
  missingKeys: string[];
  requiredKeys: string[];
} => {
  const missingFields: string[] = [];
  const missingKeys: string[] = [];
  // Every VISIBLE field that is currently required (field.required or a met
  // requiredWhen) — filled or not. Powers the progress bar so it shares this
  // walk instead of re-implementing the conditional/required rules.
  const requiredKeys: string[] = [];
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
      if (requiredByDefault || requiredWhen) {
        requiredKeys.push(valueKey);
      }
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
    requiredKeys,
  };
};

// 2026-07-16: keys that are NOT template fields but must still reach the
// server. `remarks` is DERIVED at submit (FormSubmissionService: remarks ||
// otherObservation) and appears in no template — pruning without this would
// silently strip it from every report.
const SUBMISSION_PASSTHROUGH_KEYS = new Set(['remarks']);

/** Every field key the template defines, conditional or not. */
export const templateFieldKeys = (template: FormTemplate): Set<string> => {
  const keys = new Set<string>();
  for (const section of template.sections) {
    for (const field of section.fields) {
      keys.add(field.name || field.id);
    }
  }
  return keys;
};

// 2026-07-16: restrict a submission payload to the fields the CHOSEN outcome's
// form actually defines.
//
// Switching outcome mid-form does not clear formValues (by design — the shared
// fields carry over and switching back preserves work), so the local blob
// accumulates fields from every outcome the agent passed through. Those keys
// are real values, so the report renders them: crm2's `mappedSections` filters
// by verification TYPE, not outcome, and its "never-lose-a-field" catch-all
// dumps unmapped keys into "Additional Details". An UNTRACEABLE report would
// print the applicant's house status and family size from an abandoned
// POSITIVE draft — the same self-contradicting-document class as the ERT bug.
//
// Prune the WIRE payload only. `tasks.form_data_json` deliberately keeps
// everything so an agent who switches back still has their work.
//
// Deliberately NOT filtered by conditional visibility: only cross-outcome
// orphans are removed. Dropping values because a condition currently evaluates
// false would risk silently discarding real answers on an eval bug.
export const pruneFormDataToTemplate = (
  template: FormTemplate,
  formData: Record<string, unknown>,
): Record<string, unknown> => {
  const allowed = templateFieldKeys(template);
  const pruned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (allowed.has(key) || SUBMISSION_PASSTHROUGH_KEYS.has(key)) {
      pruned[key] = value;
    }
  }
  return pruned;
};

export interface FormCompleteness {
  /** Every visible required field filled AND evidence minimums met. */
  isComplete: boolean;
  missingFields: string[];
  missingKeys: string[];
  /** Visible required fields (filled or not) — progress denominator. */
  requiredCount: number;
  filledRequiredCount: number;
  missingPhotos: number;
  missingSelfies: number;
}

// 2026-07-16: THE "is this form complete?" predicate. Save, Submit, the
// button states, the progress bar, the Saved-tab submit path and the
// auto-submit path must all agree by importing this — never a re-typed copy
// (Save shipped without validation because it had its own non-copy).
// A null template (outcome not chosen / unknown form type) is incomplete.
export const evaluateFormCompleteness = (
  template: FormTemplate | null,
  values: Record<string, unknown>,
  photoCount: number,
  selfieCount: number,
): FormCompleteness => {
  const missingPhotos = Math.max(0, MIN_VERIFICATION_PHOTOS - photoCount);
  const missingSelfies = Math.max(0, MIN_SELFIE_PHOTOS - selfieCount);
  if (!template) {
    return {
      isComplete: false,
      missingFields: [],
      missingKeys: [],
      requiredCount: 0,
      filledRequiredCount: 0,
      missingPhotos,
      missingSelfies,
    };
  }
  const { isValid, missingFields, missingKeys, requiredKeys } =
    validateTemplateRequiredFields(template, values);
  // missingKeys can also carry NON-required enum fields holding an invalid
  // value — intersect so the progress numbers stay within requiredKeys.
  const missingRequired = new Set(missingKeys);
  const filledRequiredCount = requiredKeys.filter(
    key => !missingRequired.has(key),
  ).length;
  return {
    isComplete: isValid && missingPhotos === 0 && missingSelfies === 0,
    missingFields,
    missingKeys,
    requiredCount: requiredKeys.length,
    filledRequiredCount,
    missingPhotos,
    missingSelfies,
  };
};
