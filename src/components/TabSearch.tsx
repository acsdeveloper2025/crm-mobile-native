import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface TabSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
}

const TabSearch: React.FC<TabSearchProps> = ({
  searchQuery,
  onSearchChange,
  placeholder = 'Search',
  resultCount,
  totalCount,
}) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
          },
        ]}
      />
      {typeof resultCount === 'number' && typeof totalCount === 'number' ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          {resultCount}/{totalCount}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

export default TabSearch;
