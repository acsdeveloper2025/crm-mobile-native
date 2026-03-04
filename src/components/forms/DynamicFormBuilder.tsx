import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { useTheme } from '../../context/ThemeContext';
import type { FormTemplate, FormSectionTemplate } from '../../types/api';

export interface DynamicFormBuilderProps {
  template: FormTemplate | null;
  formValues: Record<string, any>;
  onValuesChange: (values: Record<string, any>) => void;
  validationErrors?: Record<string, string>;
}

export const DynamicFormBuilder: React.FC<DynamicFormBuilderProps> = ({ 
  template, 
  formValues, 
  onValuesChange,
  validationErrors = {}
}) => {
  const { theme } = useTheme();

  const handleFieldChange = (fieldId: string, value: any) => {
    onValuesChange({
      ...formValues,
      [fieldId]: value
    });
  };

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

      {template.sections.map((section: FormSectionTemplate, index: number) => (
        <View key={section.id} style={[styles.sectionContainer, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <View style={[styles.sectionHeader, { backgroundColor: theme.colors.surfaceAlt, borderBottomColor: theme.colors.border }]}>
            <View style={[styles.sectionBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.sectionBadgeText, { color: theme.colors.surface }]}>{index + 1}</Text>
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
              {section.description ? (
                <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>{section.description}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldsContainer}>
            {section.fields.map(field => (
              <DynamicFieldRenderer
                key={field.id}
                field={field as any}
                value={formValues[field.id]}
                onChange={handleFieldChange}
                error={validationErrors[field.id]}
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
    paddingVertical: 8,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 16,
  },
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  fieldsContainer: {
    padding: 16,
  }
});
