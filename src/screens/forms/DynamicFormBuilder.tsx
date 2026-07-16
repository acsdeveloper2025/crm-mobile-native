import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet, findNodeHandle } from 'react-native';
import type { ScrollView } from 'react-native';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { useTheme } from '../../context/ThemeContext';
import { Logger } from '../../utils/logger';
// The visibility/required rules live with the validator that Save and Submit
// gate on. Re-typing them here is what let this screen and the engine drift.
import {
  conditionsMet,
  isFieldRequired,
} from '../../services/forms/FormValidationEngine';
import type { FormTemplate, FormSectionTemplate } from '../../types/api';

export interface DynamicFormBuilderProps {
  template: FormTemplate | null;
  formValues: Record<string, any>;
  onFieldChange: (fieldId: string, value: unknown) => void;
  validationErrors?: Record<string, string>;
  scrollViewRef?: React.RefObject<ScrollView | null>;
}

export interface DynamicFormBuilderHandle {
  // Scrolls the form to the first field key present in `orderedKeys`.
  scrollToFirstError: (orderedKeys: string[]) => void;
}

export const DynamicFormBuilder = forwardRef<
  DynamicFormBuilderHandle,
  DynamicFormBuilderProps
>(function DynamicFormBuilder(
  { template, formValues, onFieldChange, validationErrors = {}, scrollViewRef },
  ref,
) {
  const { theme } = useTheme();
  const fieldViewRefs = useRef<Record<string, View | null>>({});

  useImperativeHandle(
    ref,
    () => ({
      scrollToFirstError: (orderedKeys: string[]) => {
        const sv = scrollViewRef?.current;
        if (!sv) return;
        const innerNode =
          (
            sv as unknown as { getInnerViewNode?: () => number }
          ).getInnerViewNode?.() ?? findNodeHandle(sv);
        if (innerNode == null) return;
        for (const key of orderedKeys) {
          const node = fieldViewRefs.current[key];
          if (node) {
            node.measureLayout(
              innerNode as number,
              (_x: number, y: number) => {
                sv.scrollTo({ y: Math.max(y - 120, 0), animated: true });
              },
              () => {},
            );
            return;
          }
        }
      },
    }),
    [scrollViewRef],
  );

  const visibleSections = useMemo(() => {
    if (!template) {
      return [];
    }

    // H23 (audit 2026-04-21): detect colliding field keys across the
    // whole template up front. The old code silently fell back to
    // `field.id` when `field.name` was empty; if two fields shared
    // an id (template authoring error) both would map to the same
    // form-state key and every keystroke on one would overwrite the
    // other. Logging a warning at render time surfaces the bug to
    // telemetry so authoring issues get caught in testing instead of
    // corrupting live submissions.
    const seenKeys = new Set<string>();
    const collisions = new Set<string>();
    for (const section of Array.isArray(template.sections)
      ? template.sections
      : []) {
      for (const field of Array.isArray(section.fields) ? section.fields : []) {
        const valueKey =
          field.name && field.name.trim() !== '' ? field.name : field.id;
        if (!valueKey) {
          continue;
        }
        if (seenKeys.has(valueKey)) {
          collisions.add(valueKey);
        } else {
          seenKeys.add(valueKey);
        }
      }
    }
    if (collisions.size > 0) {
      Logger.warn(
        'DynamicFormBuilder',
        'duplicate field keys in template — form state will collide',
        {
          templateKey: (template as unknown as Record<string, unknown>)
            .formType,
          collisions: Array.from(collisions),
        },
      );
    }

    return (Array.isArray(template.sections) ? template.sections : [])
      .filter((section: FormSectionTemplate) =>
        conditionsMet(section.conditional, formValues),
      )
      .map((section: FormSectionTemplate, index: number) => {
        const sectionKey =
          section.id || `${section.title || 'section'}_${index}`;
        const visibleFields = (
          Array.isArray(section.fields) ? section.fields : []
        )
          .filter(field => conditionsMet(field.conditional, formValues))
          .map(field => {
            // Use field.name as the canonical key for form values. Fall back to
            // field.id only if name is absent. This ensures consistent mapping
            // between mobile form values and backend field expectations.
            const valueKey =
              field.name && field.name.trim() !== '' ? field.name : field.id;
            return {
              key: valueKey,
              field: {
                ...field,
                id: valueKey,
                name: valueKey,
                required: isFieldRequired(field, formValues),
              },
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
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          Loading form template...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.formTitle, { color: theme.colors.text }]}>
        {template.name}
      </Text>
      {template.description ? (
        <Text
          style={[
            styles.formDescription,
            { color: theme.colors.textSecondary },
          ]}
        >
          {template.description}
        </Text>
      ) : null}

      {visibleSections.map(({ index, section, sectionKey, visibleFields }) => (
        <View
          key={sectionKey}
          style={[
            styles.sectionContainer,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.sectionHeader,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderBottomColor: theme.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.sectionBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.sectionBadgeText,
                  { color: theme.colors.surface },
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <View style={styles.sectionTextWrap}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {section.title}
              </Text>
              {section.description ? (
                <Text
                  style={[
                    styles.sectionDesc,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {section.description}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldsContainer}>
            {visibleFields.map(({ key, field }) => (
              <View
                key={`${sectionKey}_${key}`}
                collapsable={false}
                ref={node => {
                  fieldViewRefs.current[key] = node;
                }}
              >
                <DynamicFieldRenderer
                  field={field}
                  value={formValues[key]}
                  onChange={onFieldChange}
                  error={validationErrors[key]}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 14,
    marginBottom: 14,
  },
  // M13 (audit 2026-04-21): colour/background/border tokens removed from the
  // static StyleSheet — every render already overlays `theme.colors.*` via the
  // inline style arrays below, so the hardcoded hex values were dead code and
  // would have drifted from the theme if anyone had toggled dark mode.
  sectionContainer: {
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  fieldsContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
