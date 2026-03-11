import React from 'react';
import { View, Text, TextInput, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export interface DynamicFieldProps {
  field: {
    id: string;
    label: string;
    type: string;
    required?: boolean;
    options?: { label: string; value: string }[];
  };
  value: any;
  onChange: (id: string, value: any) => void;
  error?: string;
}

const DynamicFieldRendererComponent: React.FC<DynamicFieldProps> = ({ field, value, onChange, error }) => {
  const { theme } = useTheme();
  const placeholder = `Enter ${field.label.toLowerCase()}`;
  const options = Array.isArray(field.options) ? field.options : [];

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
                borderColor: theme.colors.border,
                color: theme.colors.text
              },
              error && [styles.inputError, { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + '10' }]
            ]}
            value={value?.toString() || ''}
            onChangeText={(text) => {
              if (field.type === 'number') {
                onChange(field.id, text.trim() === '' ? '' : Number(text));
                return;
              }
              onChange(field.id, text);
            }}
            keyboardType={field.type === 'number' ? 'numeric' : 'default'}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textMuted}
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
                borderColor: theme.colors.border,
                color: theme.colors.text
              },
              error && [styles.inputError, { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + '10' }]
            ]}
            value={value?.toString() || ''}
            onChangeText={(text) => onChange(field.id, text)}
            multiline
            numberOfLines={4}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textMuted}
          />
        );

      case 'date':
        return (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text
              },
              error && [styles.inputError, { borderColor: theme.colors.danger, backgroundColor: theme.colors.danger + '10' }]
            ]}
            value={value?.toString() || ''}
            onChangeText={(text) => onChange(field.id, text)}
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
          <View style={[styles.switchContainer, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <Text style={[styles.switchLabel, { color: theme.colors.text }]}>{value ? 'Yes' : 'No'}</Text>
            <Switch
              value={!!value}
              onValueChange={(val) => onChange(field.id, val)}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={value ? theme.colors.surface : theme.colors.surfaceAlt}
            />
          </View>
        );

      case 'select':
      case 'radio':
        return (
          <View style={styles.radioGroup}>
            {options.map((opt, index) => (
              <TouchableOpacity
                key={`${field.id}_${String(opt.value)}_${index}`}
                style={[
                  styles.radioButton,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  value === opt.value && [styles.radioButtonSelected, { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary }]
                ]}
                onPress={() => onChange(field.id, opt.value)}>
                <Text style={[
                  styles.radioText,
                  { color: theme.colors.textSecondary },
                  value === opt.value && [styles.radioTextSelected, { color: theme.colors.primary }]
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      default:
        return <Text style={[styles.unsupportedText, { color: theme.colors.textMuted }]}>Unsupported field type: {field.type}</Text>;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{field.label}</Text>
        {field.required && <Text style={[styles.requiredStar, { color: theme.colors.danger }]}>*</Text>}
      </View>
      {renderInput()}
      {error && <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>}
    </View>
  );
};

const areEqual = (prev: DynamicFieldProps, next: DynamicFieldProps): boolean => {
  const prevOptions = Array.isArray(prev.field.options) ? prev.field.options : [];
  const nextOptions = Array.isArray(next.field.options) ? next.field.options : [];

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

export const DynamicFieldRenderer = React.memo(DynamicFieldRendererComponent, areEqual);

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
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  radioButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
  },
  radioButtonSelected: {
    borderWidth: 1.5,
  },
  radioText: {
    fontSize: 14,
    fontWeight: '600',
  },
  radioTextSelected: {
    fontWeight: '700',
  }
});
