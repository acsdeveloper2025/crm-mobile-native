import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { DigitalIdCard } from '../../components/profile/DigitalIdCard';

export const DigitalIdCardScreen = () => {
  const { theme } = useTheme();
  const { user } = useAuth();

  // 2026-05-14: read actual user fields rather than the prior hardcoded
  // 'Verification Services' / role==='AGENT' branch (the real role is
  // 'FIELD_AGENT' so that branch never matched, and ID cards rendered
  // the raw enum string as designation) / fixed '31 Dec 2026' expiry.
  // Mobile UserProfile.designation + .department are already the
  // FK-derived names per their 2026-04-28 comments — no extra mapping.
  // The DigitalIdCard component conditionally hides any field left
  // undefined, so optional rows just disappear cleanly.
  const userProfileInfo = {
    fullName: user?.name || 'Unknown Agent',
    employeeId: user?.employeeId || user?.username || 'N/A',
    department: user?.department || undefined,
    designation: user?.designation || undefined,
    email: user?.email || undefined,
    profilePhoto: user?.profilePhotoUrl || undefined,
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Digital ID Card" />
      <ScrollView style={styles.scroll}>
        <View style={styles.content}>
          <DigitalIdCard userProfile={userProfileInfo} />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
