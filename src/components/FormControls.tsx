import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../context/ThemeContext';

export interface FormFieldProps {
  label: string;
  id: string;
  name: string;
  value: string | number | null | undefined;
  onChangeText?: (text: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({ label, value, onChangeText, type, placeholder, disabled }) => {
  const { theme } = useTheme();
  
  const isNumber = type === 'number';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label} {disabled && <Text style={styles.readOnly}>(Read Only)</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          { 
            backgroundColor: disabled ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: theme.colors.border,
            color: disabled ? theme.colors.textSecondary : theme.colors.text
          }
        ]}
        value={value !== null && value !== undefined ? value.toString() : ''}
        onChangeText={onChangeText}
        keyboardType={isNumber ? 'numeric' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        editable={!disabled}
      />
    </View>
  );
};

export interface SelectFieldProps {
  label: string;
  id: string;
  name: string;
  value: any;
  onValueChange?: (itemValue: any) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({ label, value, onValueChange, children, disabled }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label} {disabled && <Text style={styles.readOnly}>(Read Only)</Text>}
      </Text>
      <View style={[styles.pickerContainer, { 
        backgroundColor: disabled ? theme.colors.surfaceAlt : theme.colors.surface,
        borderColor: theme.colors.border 
      }]}>
        <Picker
          selectedValue={value || ''}
          onValueChange={onValueChange}
          enabled={!disabled}
          dropdownIconColor={theme.colors.text}
          style={{ color: disabled ? theme.colors.textSecondary : theme.colors.text }}>
          {children}
        </Picker>
      </View>
    </View>
  );
};

export interface TextAreaProps {
  label: string;
  id: string;
  name: string;
  value: string | null | undefined;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export const TextAreaField: React.FC<TextAreaProps> = ({ label, value, onChangeText, placeholder, rows = 3, disabled }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label} {disabled && <Text style={styles.readOnly}>(Read Only)</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          styles.textArea,
          { 
            backgroundColor: disabled ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: theme.colors.border,
            color: disabled ? theme.colors.textSecondary : theme.colors.text
          }
        ]}
        value={value || ''}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        editable={!disabled}
        multiline={true}
        numberOfLines={rows}
        textAlignVertical="top"
      />
    </View>
  );
};

export interface NumberDropdownFieldProps {
  label: string;
  id: string;
  name: string;
  value: string | number | null | undefined;
  onChange?: (itemValue: any) => void;
  min: number;
  max: number;
  disabled?: boolean;
  placeholder?: string;
}

export const NumberDropdownField: React.FC<NumberDropdownFieldProps> = ({
  label, value, onChange, min, max, placeholder = "Select...", disabled
}) => {
  const { theme } = useTheme();

  const numberOptions = [];
  numberOptions.push(
    <Picker.Item key="empty" label={placeholder} value="" />
  );
  
  for (let i = min; i <= max; i++) {
    numberOptions.push(
      <Picker.Item key={i} label={i.toString()} value={i.toString()} />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label} {disabled && <Text style={styles.readOnly}>(Read Only)</Text>}
      </Text>
      <View style={[styles.pickerContainer, { 
        backgroundColor: disabled ? theme.colors.surfaceAlt : theme.colors.surface,
        borderColor: theme.colors.border 
      }]}>
        <Picker
          selectedValue={value?.toString() || ''}
          onValueChange={onChange}
          enabled={!disabled}
          dropdownIconColor={theme.colors.text}
          style={{ color: disabled ? theme.colors.textSecondary : theme.colors.text }}>
          {numberOptions}
        </Picker>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  readOnly: {
    fontSize: 12,
    fontWeight: 'normal',
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  }
});