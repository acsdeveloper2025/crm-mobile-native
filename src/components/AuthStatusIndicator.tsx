import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const AuthStatusIndicator: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isAuthenticated ? theme.colors.success : theme.colors.warning },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.surface }]}>
        {isAuthenticated ? 'Authenticated' : 'Signed Out'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default AuthStatusIndicator;
