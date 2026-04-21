import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../context/ThemeContext';

export interface DynamicFieldProps {
  field: {
    id: string;
    label: string;
    type: string;
    required?: boolean;
    options?: { label: string; value: string }[];
    name?: string;
  };
  value: unknown;
  onChange: (id: string, value: unknown) => void;
  error?: string;
}

const NUMERIC_FIELD_NAME_PATTERNS = [
  'phone',
  'earning',
  'family',
  'staff',
  'floor',
  'area',
];

const PHONE_FIELD_NAMES = ['tpcPhone1', 'tpcPhone2', 'backendContactNumber'];

const EMAIL_FIELD_NAME_PATTERNS = ['email', 'mail'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const shouldUseNumericKeyboard = (field: {
  id: string;
  type: string;
  name?: string;
}): boolean => {
  if (field.type === 'number') return true;
  const fieldName = (field.name || field.id || '').toLowerCase();
  return NUMERIC_FIELD_NAME_PATTERNS.some(pattern =>
    fieldName.includes(pattern),
  );
};

const isPhoneField = (fieldName: string): boolean => {
  const lower = fieldName.toLowerCase();
  return (
    PHONE_FIELD_NAMES.some(name => lower === name.toLowerCase()) ||
    lower.includes('phone')
  );
};

const validateField = (
  field: { id: string; type: string; required?: boolean; name?: string },
  fieldValue: unknown,
): string | null => {
  const strValue = String(fieldValue ?? '').trim();

  // Required field check
  if (field.required && strValue === '') {
    return 'Required';
  }

  if (strValue === '') return null;

  // Number validation
  if (field.type === 'number') {
    if (isNaN(Number(strValue))) {
      return 'Must be a valid number';
    }
  }

  // Phone validation (exactly 10 digits for Indian phone numbers)
  const fieldName = field.name || field.id || '';
  if (isPhoneField(fieldName)) {
    const digitsOnly = strValue.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      return 'Phone number must be at least 10 digits';
    }
    if (digitsOnly.length > 13) {
      return 'Phone number must not exceed 13 digits';
    }
  }

  // Email validation
  const isEmail =
    field.type === 'email' ||
    EMAIL_FIELD_NAME_PATTERNS.some(p => fieldName.toLowerCase().includes(p));
  if (isEmail && !EMAIL_REGEX.test(strValue)) {
    return 'Please enter a valid email address';
  }

  return null;
};

// M8 (audit 2026-04-21): memoized multiselect option row. Pre-refactor,
// a 50-option multiselect created 50 inline onPress closures + 50
// conditional style arrays on every parent re-render. Now each option
// only re-renders when its own `isSelected` or theme colors change.
type MultiSelectOptionData = { value: string | number; label: string };
const MultiSelectOption = React.memo(
  ({
    option,
    isSelected,
    theme,
    onToggle,
  }: {
    option: MultiSelectOptionData;
    isSelected: boolean;
    theme: ReturnType<typeof useTheme>['theme'];
    onToggle: (value: string | number) => void;
  }) => {
    const handlePress = useCallback(
      () => onToggle(option.value),
      [onToggle, option.value],
    );
    // L5 (audit 2026-04-21): hoist colour picks to named variables so
    // eslint's `react-native/no-inline-styles` AST walker doesn't trip
    // over the nested ternary and emit a false-positive warning.
    const activeColor = theme.colors.primary;
    const rowBg = isSelected ? activeColor + '15' : theme.colors.surface;
    const rowBorder = isSelected ? activeColor : theme.colors.border;
    const boxBorder = rowBorder;
    const boxBg = isSelected ? activeColor : 'transparent';
    return (
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.switchContainer,
          { backgroundColor: rowBg, borderColor: rowBorder },
        ]}
      >
        <Text style={[styles.switchLabel, { color: theme.colors.text }]}>
          {option.label}
        </Text>
        <View
          style={[
            styles.checkboxBox,
            { borderColor: boxBorder, backgroundColor: boxBg },
          ]}
        >
          {isSelected && <Text style={styles.checkboxCheckmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  },
);
MultiSelectOption.displayName = 'MultiSelectOption';

// Small internal component that owns the stable toggle callback for
// the multiselect so MultiSelectOption's React.memo can avoid
// re-rendering unchanged rows.
const MultiSelectCase: React.FC<{
  field: DynamicFieldProps['field'];
  value: DynamicFieldProps['value'];
  onChange: DynamicFieldProps['onChange'];
  options: MultiSelectOptionData[];
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ field, value, onChange, options, theme }) => {
  const selectedValues = Array.isArray(value)
    ? (value as (string | number)[])
    : [];
  const selectedRef = useRef(selectedValues);
  selectedRef.current = selectedValues;
  const handleToggle = useCallback(
    (optionValue: string | number) => {
      const current = selectedRef.current;
      const next = current.includes(optionValue)
        ? current.filter(v => v !== optionValue)
        : [...current, optionValue];
      onChange(field.id, next);
    },
    [field.id, onChange],
  );
  return (
    <View style={styles.multiselectContainer}>
      {options.map((opt, index) => (
        <MultiSelectOption
          key={`${field.id}_multi_${String(opt.value)}_${index}`}
          option={opt}
          isSelected={selectedValues.includes(opt.value)}
          theme={theme}
          onToggle={handleToggle}
        />
      ))}
    </View>
  );
};

const DynamicFieldRendererComponent: React.FC<DynamicFieldProps> = ({
  field,
  value,
  onChange,
  error,
}) => {
  const { theme } = useTheme();
  const [touched, setTouched] = useState(false);
  const [localValidationError, setLocalValidationError] = useState<
    string | null
  >(null);
  const placeholder = `Enter ${field.label.toLowerCase()}`;
  // M9 (audit 2026-04-21): stabilise the options reference so downstream
  // children (select rows, multi-select chips) see the same array
  // instance when nothing structural changed. Does not fully avoid the
  // parent-spread-new-field-every-render cost but clips the per-option
  // churn inside this renderer.
  const options = useMemo(
    () => (Array.isArray(field.options) ? field.options : []),
    [field.options],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    const validationResult = validateField(field, value);
    setLocalValidationError(validationResult);
  }, [field, value]);

  // Show external error prop first, then local validation error (only after blur)
  const displayError = error || (touched ? localValidationError : null);
  const useNumericKeyboard = shouldUseNumericKeyboard(field);

  const renderInput = () => {
    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                borderColor: displayError
                  ? theme.colors.danger
                  : theme.colors.border,
                color: theme.colors.text,
              },
              displayError && [
                styles.inputError,
                {
                  borderColor: theme.colors.danger,
                  backgroundColor: theme.colors.danger + '10',
                },
              ],
            ]}
            value={value?.toString() || ''}
            onChangeText={text => {
              if (field.type === 'number') {
                onChange(field.id, text.trim() === '' ? '' : Number(text));
                return;
              }
              onChange(field.id, text);
            }}
            onBlur={handleBlur}
            keyboardType={useNumericKeyboard ? 'numeric' : 'default'}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textMuted}
            testID={`field-${field.id}`}
            accessibilityLabel={field.label}
          />
        );

      case 'textarea':
        return (
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: theme.colors.surface,
                borderColor: displayError
                  ? theme.colors.danger
                  : theme.colors.border,
                color: theme.colors.text,
              },
              displayError && [
                styles.inputError,
                {
                  borderColor: theme.colors.danger,
                  backgroundColor: theme.colors.danger + '10',
                },
              ],
            ]}
            value={value?.toString() || ''}
            onChangeText={text => onChange(field.id, text)}
            onBlur={handleBlur}
            multiline
            numberOfLines={4}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textMuted}
            testID={`field-textarea-${field.id}`}
            accessibilityLabel={field.label}
          />
        );

      case 'date':
        return (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                borderColor: displayError
                  ? theme.colors.danger
                  : theme.colors.border,
                color: theme.colors.text,
              },
              displayError && [
                styles.inputError,
                {
                  borderColor: theme.colors.danger,
                  backgroundColor: theme.colors.danger + '10',
                },
              ],
            ]}
            value={value?.toString() || ''}
            onChangeText={text => onChange(field.id, text)}
            onBlur={handleBlur}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
          />
        );

      case 'boolean':
      case 'checkbox':
        return (
          <View
            style={[
              styles.switchContainer,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
            testID={`field-switch-${field.id}`}
          >
            <Text style={[styles.switchLabel, { color: theme.colors.text }]}>
              {value ? 'Yes' : 'No'}
            </Text>
            <Switch
              value={!!value}
              onValueChange={val => onChange(field.id, val)}
              accessibilityLabel={`${field.label}: ${value ? 'Yes' : 'No'}`}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary,
              }}
              thumbColor={
                value ? theme.colors.surface : theme.colors.surfaceAlt
              }
            />
          </View>
        );

      case 'email':
        return (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                borderColor: displayError
                  ? theme.colors.danger
                  : theme.colors.border,
                color: theme.colors.text,
              },
              displayError && [
                styles.inputError,
                {
                  borderColor: theme.colors.danger,
                  backgroundColor: theme.colors.danger + '10',
                },
              ],
            ]}
            value={value?.toString() || ''}
            onChangeText={text => onChange(field.id, text.trim())}
            onBlur={handleBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter email address"
            placeholderTextColor={theme.colors.textMuted}
          />
        );

      case 'select':
      case 'radio':
        return (
          <View
            style={[
              styles.pickerContainer,
              {
                backgroundColor: theme.colors.surface,
                borderColor: displayError
                  ? theme.colors.danger
                  : theme.colors.border,
              },
            ]}
          >
            <Picker
              selectedValue={value ?? ''}
              onValueChange={selectedValue => onChange(field.id, selectedValue)}
              dropdownIconColor={theme.colors.text}
              style={{ color: theme.colors.text }}
            >
              <Picker.Item
                label={`Select ${field.label}`}
                value=""
                color={theme.colors.textMuted}
              />
              {options.map((opt, index) => (
                <Picker.Item
                  key={`${field.id}_${String(opt.value)}_${index}`}
                  label={opt.label}
                  value={opt.value}
                />
              ))}
            </Picker>
          </View>
        );

      case 'multiselect': {
        return (
          <MultiSelectCase
            field={field}
            value={value}
            onChange={onChange}
            options={options}
            theme={theme}
          />
        );
      }

      default:
        return (
          <Text
            style={[styles.unsupportedText, { color: theme.colors.textMuted }]}
          >
            Unsupported field type: {field.type}
          </Text>
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>
          {field.label}
        </Text>
        {field.required && (
          <Text style={[styles.requiredStar, { color: theme.colors.danger }]}>
            *
          </Text>
        )}
      </View>
      {renderInput()}
      {displayError ? (
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>
          {displayError}
        </Text>
      ) : null}
    </View>
  );
};

const areEqual = (
  prev: DynamicFieldProps,
  next: DynamicFieldProps,
): boolean => {
  const prevOptions = Array.isArray(prev.field.options)
    ? prev.field.options
    : [];
  const nextOptions = Array.isArray(next.field.options)
    ? next.field.options
    : [];

  if (prevOptions.length !== nextOptions.length) {
    return false;
  }
  for (let i = 0; i < prevOptions.length; i += 1) {
    if (
      prevOptions[i].label !== nextOptions[i].label ||
      prevOptions[i].value !== nextOptions[i].value
    ) {
      return false;
    }
  }

  return (
    prev.field.id === next.field.id &&
    prev.field.label === next.field.label &&
    prev.field.type === next.field.type &&
    prev.field.required === next.field.required &&
    prev.value === next.value &&
    prev.error === next.error
  );
};

export const DynamicFieldRenderer = React.memo(
  DynamicFieldRendererComponent,
  areEqual,
);

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requiredStar: {
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputError: {
    borderWidth: 1.5,
  },
  textArea: {
    height: 116,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  unsupportedText: {
    fontStyle: 'italic',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  multiselectContainer: {
    gap: 6,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
