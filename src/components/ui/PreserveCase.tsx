import React from 'react';
// Import the unwrapped Text via deep path so this wrapper composes with
// the original native component, NOT with the upper-wrapped version
// installed by `installUppercaseDefaults` on the public `react-native`
// export. Avoids the redundant `[UPPER, ...]` style entry on every
// rendered preserve-case node.
// eslint-disable-next-line @react-native/no-deep-imports
import { Text as OriginalText } from 'react-native/Libraries/Text/Text';
import type { TextProps } from 'react-native';

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
