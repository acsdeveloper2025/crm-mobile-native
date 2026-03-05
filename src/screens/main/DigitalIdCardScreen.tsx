import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { DigitalIdCard } from '../../components/profile/DigitalIdCard';

export const DigitalIdCardScreen = () => {
  const { theme } = useTheme();
  const { user } = useAuth();

  const userProfileInfo = {
    fullName: user?.name || 'Unknown Agent',
    employeeId: user?.employeeId || user?.username || 'N/A',
    department: 'Verification Services',
    designation: user?.role === 'AGENT' ? 'Field Verification Agent' : user?.role,
    email: user?.email,
    validUntil: '31 Dec 2026',
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <DigitalIdCard userProfile={userProfileInfo} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
