import React from 'react';
import { Text, type TextProps } from 'react-native';

/**
 * Escape hatch for the global `Text.defaultProps = { textTransform: 'uppercase' }`
 * override wired in App.tsx. Wrap any content that must render in its
 * captured case — emails, URLs, hex hashes, GPS coord strings, filenames,
 * log entity IDs, timestamps that include letters, etc.
 *
 * Inline `textTransform: 'none'` wins against the default props style
 * because StyleSheet arrays merge in order: `[defaultStyle, localStyle]`.
 */
const PRESERVE_CASE_STYLE = { textTransform: 'none' as const };

export const PreserveCase: React.FC<TextProps> = ({ style, ...rest }) => {
  return <Text {...rest} style={[PRESERVE_CASE_STYLE, style]} />;
};

PreserveCase.displayName = 'PreserveCase';
