import React from 'react';
import type { TextProps } from 'react-native';

// Resolve the unwrapped Text via deep path using `require(...).default`. The
// d.ts declares `export class Text` (named) but the runtime JS uses
// `export default TextImpl` only — a named `import { Text }` resolves to
// `undefined` at runtime and any JSX use crashes with "Element type is
// invalid". `require(...).default` works regardless of the d.ts shape.
//
// The deep import is intentional: this wrapper MUST compose against the
// unwrapped Text so it's not double-wrapped by the upper render-patch
// installed via `installUppercaseDefaults`.
const OriginalText =
  // eslint-disable-next-line @react-native/no-deep-imports
  require('react-native/Libraries/Text/Text')
    .default as React.ComponentType<TextProps>;

/**
 * Escape hatch for the global UPPERCASE-on-display policy installed via
 * `installUppercaseDefaults`. Wrap any content that must render in its
 * captured case — emails, URLs, hex hashes, GPS coord strings, filenames,
 * log entity IDs, timestamps that include letters, etc.
 *
 * Inline `textTransform: 'none'` wins because RN style arrays merge
 * left-to-right (`[localStyle, PRESERVE_CASE_STYLE]`).
 */
const PRESERVE_CASE_STYLE = { textTransform: 'none' as const };

export const PreserveCase: React.FC<TextProps> = ({ style, ...rest }) => {
  return <OriginalText {...rest} style={[style, PRESERVE_CASE_STYLE]} />;
};

PreserveCase.displayName = 'PreserveCase';
