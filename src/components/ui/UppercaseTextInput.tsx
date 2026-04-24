import React, { forwardRef, useCallback } from 'react';
import {
  TextInput,
  type TextInputProps,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { shouldUppercaseField, toUpperCaseSafe } from '../../utils/uppercase';

export type UppercaseTextInputProps = TextInputProps & {
  // Field identifier used to look up case-sensitivity tokens. Optional;
  // when absent the input uppercases unless `uppercase={false}` is set.
  name?: string;
  // Force-in / opt-out of the auto-uppercase policy. Unset = auto-detect.
  uppercase?: boolean;
};

/**
 * Drop-in replacement for RN `TextInput` that enforces the global
 * UPPERCASE-on-type policy for user-typed free text. Opts out automatically
 * when `name` matches a case-sensitive token (email, password, url, …) or
 * when the caller passes `uppercase={false}`.
 *
 * Also sets `autoCapitalize="characters"` + `autoCorrect={false}` so the
 * OS keyboard mirrors the behaviour. Copy-paste / autofill / voice input
 * all pass through `onChangeText` which is the authoritative transform.
 */
export const UppercaseTextInput = forwardRef<
  TextInput,
  UppercaseTextInputProps
>(({ name, uppercase, onChangeText, onChange, ...rest }, ref) => {
  const autoUpper = shouldUppercaseField(name, uppercase);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText?.(autoUpper ? toUpperCaseSafe(text) : text);
    },
    [onChangeText, autoUpper],
  );

  // Preserve the raw onChange for callers that read the native event.
  const handleChange = useCallback(
    (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
      if (autoUpper) {
        const upper = toUpperCaseSafe(event.nativeEvent.text);
        if (upper !== event.nativeEvent.text) {
          event.nativeEvent.text = upper;
        }
      }
      onChange?.(event);
    },
    [onChange, autoUpper],
  );

  // When auto-upper is off, force display to mixed case by appending
  // `textTransform: 'none'` to the style chain. This beats the global
  // Text/TextInput render-patch (installUppercaseDefaults), which
  // prepends `textTransform: 'uppercase'`. Last value wins in RN style
  // arrays, so the override here lands on the rendered text. Keeps
  // display in lockstep with the stored value for excluded fields
  // (email, password, username, etc.).
  const resolvedStyle = autoUpper
    ? rest.style
    : [rest.style, { textTransform: 'none' as const }];

  return (
    <TextInput
      ref={ref}
      autoCapitalize={autoUpper ? 'characters' : rest.autoCapitalize ?? 'none'}
      autoCorrect={autoUpper ? false : rest.autoCorrect}
      {...rest}
      onChangeText={handleChangeText}
      onChange={handleChange}
      style={resolvedStyle}
    />
  );
});

UppercaseTextInput.displayName = 'UppercaseTextInput';
