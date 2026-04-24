import React, { forwardRef, useCallback } from 'react';
import type {
  TextInput,
  TextInputProps,
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { shouldUppercaseField, toUpperCaseSafe } from '../../utils/uppercase';

// Resolve the unwrapped TextInput via deep path using `require(...).default`.
// The d.ts declares `export class TextInput` (named) but the runtime JS uses
// `export default TextInput as any` only — a named `import { TextInput }`
// resolves to `undefined` at runtime and any JSX use crashes with
// "Element type is invalid". `require(...).default` works regardless of the
// d.ts shape mismatch.
//
// The deep import is intentional: this wrapper MUST compose against the
// unwrapped TextInput so it's not double-wrapped by the upper render-patch
// installed via `installUppercaseDefaults`.
const OriginalTextInput =
  // eslint-disable-next-line @react-native/no-deep-imports
  require('react-native/Libraries/Components/TextInput/TextInput')
    .default as React.ComponentType<TextInputProps & { ref?: unknown }>;

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
    <OriginalTextInput
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
