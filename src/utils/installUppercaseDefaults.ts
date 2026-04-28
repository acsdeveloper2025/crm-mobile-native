import React from 'react';
import type {
  TextProps,
  TextInputProps,
  StyleProp,
  TextStyle,
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { shouldUppercaseField, toUpperCaseSafe } from './uppercase';

// Resolve the unwrapped originals via deep paths using `require(...).default`.
// The d.ts at these paths declares `export class Text` / `class TextInput`
// (named) but the runtime JS uses `export default TextImpl` only — a named
// `import { Text }` resolves to `undefined` at runtime and any JSX use crashes
// with "Element type is invalid". `require(...).default` works at runtime
// regardless of the d.ts shape mismatch.
//
// These wrappers MUST compose against the unwrapped originals so that
// `installUppercaseDefaults` can override the public `react-native` exports
// without recursing through itself.
const OriginalText =
  // eslint-disable-next-line @react-native/no-deep-imports
  require('react-native/Libraries/Text/Text').default as React.ComponentType<
    TextProps & { ref?: unknown }
  >;
const OriginalTextInput =
  // eslint-disable-next-line @react-native/no-deep-imports
  require('react-native/Libraries/Components/TextInput/TextInput')
    .default as React.ComponentType<TextInputProps & { ref?: unknown }>;

// Global UPPERCASE-on-display policy for the mobile app.
//
// Web uses a single CSS rule (`body { text-transform: uppercase }`) and
// inheritance does the rest. RN has no cascade, and `Text.defaultProps` is
// REPLACED (not merged) by callers, so a defaults-merge approach misses every
// element that sets a `style` prop. The previous render-patch attempt assumed
// class/forwardRef internals that no longer exist on RN 0.84+ (Text and
// TextInput are now `component(...)` function components with no `.render`),
// so it silently no-op'd.
//
// This file replaces the `Text` and `TextInput` getters on the
// `react-native` module exports with thin wrappers that prepend
// `textTransform: 'uppercase'` to the style chain. Per-element style still
// wins (RN style arrays merge left-to-right, last value wins), so callers
// can opt out by appending `{ textTransform: 'none' }` — see PreserveCase
// for the standard escape hatch.
//
// The patch self-installs at module load time. Import this file FIRST in
// `index.js` (before `import { AppRegistry } from 'react-native'` and
// before any screen module is loaded) so subsequent property reads against
// the `react-native` exports object hit the wrapped components.

const UPPER_STYLE: StyleProp<TextStyle> = { textTransform: 'uppercase' };
const PRESERVE_STYLE: StyleProp<TextStyle> = { textTransform: 'none' };

// 2026-04-27 deep-audit fix (D12): cap font scaling to 1.5× to prevent
// layouts from breaking at 200%+ system font scale (Android's "Largest"
// + display zoom can exceed 2.0). Per-element `maxFontSizeMultiplier` prop
// still wins because we spread `props` AFTER the default so caller props
// shadow the default. allowFontScaling itself stays default-on so users
// who scale up to 1.5× still get their preferred size.
const DEFAULT_MAX_FONT_SCALE = 1.5;

const UpperText = React.forwardRef<unknown, TextProps>(function UpperText(
  props,
  ref,
) {
  return React.createElement(OriginalText, {
    maxFontSizeMultiplier: DEFAULT_MAX_FONT_SCALE,
    ...props,
    ref,
    style: [UPPER_STYLE, props.style],
  });
});

// Keyboards that imply non-text content. Matching here keeps every numeric /
// email / url / phone TextInput from being silently uppercased even if the
// caller forgot to pass a recognisable `name` token.
const EXCLUDED_KEYBOARD_TYPES = new Set<string>([
  'email-address',
  'numeric',
  'number-pad',
  'decimal-pad',
  'phone-pad',
  'url',
  'ascii-capable-number-pad',
]);

type UpperTextInputProps = TextInputProps & {
  name?: string;
  uppercase?: boolean;
};

const UpperTextInput = React.forwardRef<unknown, UpperTextInputProps>(
  function UpperTextInput(props, ref) {
    const { name, uppercase, onChangeText, onChange, ...rest } = props;

    const excludedByKeyboard =
      rest.keyboardType !== undefined &&
      EXCLUDED_KEYBOARD_TYPES.has(String(rest.keyboardType));
    const excludedBySecure = rest.secureTextEntry === true;

    const auto =
      uppercase === false
        ? false
        : uppercase === true
        ? true
        : !excludedByKeyboard &&
          !excludedBySecure &&
          shouldUppercaseField(name, undefined);

    const handleChangeText = React.useCallback(
      (text: string) => {
        onChangeText?.(auto ? toUpperCaseSafe(text) : text);
      },
      [onChangeText, auto],
    );

    const handleChange = React.useCallback(
      (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
        if (auto) {
          const upper = toUpperCaseSafe(event.nativeEvent.text);
          if (upper !== event.nativeEvent.text) {
            event.nativeEvent.text = upper;
          }
        }
        onChange?.(event);
      },
      [onChange, auto],
    );

    // When auto-upper is OFF, append `textTransform: 'none'` so the rendered
    // text matches the stored value (mirrors web Phase 3 fix). When ON, prepend
    // the upper style; per-call inline `textTransform` overrides still win.
    const style: StyleProp<TextStyle> = auto
      ? [UPPER_STYLE, rest.style]
      : [rest.style, PRESERVE_STYLE];

    return React.createElement(OriginalTextInput, {
      // 2026-04-27 deep-audit fix (D12): default font-scale cap; per-call
      // override still wins because `...rest` spreads after.
      maxFontSizeMultiplier: DEFAULT_MAX_FONT_SCALE,
      ...rest,
      ref,
      autoCapitalize: auto ? 'characters' : rest.autoCapitalize ?? 'none',
      autoCorrect: auto ? false : rest.autoCorrect,
      onChangeText: handleChangeText,
      onChange: handleChange,
      style,
    });
  },
);

let installed = false;

export function installUppercaseDefaults(): void {
  if (installed) {
    return;
  }
  installed = true;

  // `react-native`'s root `index.js` defines exports as configurable lazy
  // getters. Replacing them with our wrappers means every subsequent
  // `import { Text } from 'react-native'` resolves to the upper-wrapped
  // version. Use require here so that bundler analysis treats this as a
  // runtime-side mutation rather than a static import that gets hoisted.
  const RN = require('react-native') as Record<string, unknown>;
  Object.defineProperty(RN, 'Text', {
    configurable: true,
    enumerable: true,
    get: () => UpperText,
  });
  Object.defineProperty(RN, 'TextInput', {
    configurable: true,
    enumerable: true,
    get: () => UpperTextInput,
  });
}

// Self-install at module load. Importing this file once (with its side
// effects preserved) is enough — keep it the first import in index.js.
installUppercaseDefaults();
