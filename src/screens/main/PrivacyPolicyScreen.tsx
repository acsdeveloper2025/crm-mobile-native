// 2026-04-27 deep-audit fix (D16): in-app privacy notice. Required by
// India's DPDP Act 2023 ("notice" obligation under §5). This is a
// placeholder — replace the static text with the legal-team-approved
// policy when published. The screen exists so that:
//   1. The Profile menu has a discoverable "Privacy Policy" tile.
//   2. Future ICICI compliance audits can be answered with "yes, agents
//      see the privacy notice in-app, here is the screen."
//   3. The existing UPPERCASE installer is bypassed via PreserveCase so
//      legal text reads in mixed case (per user policy).

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { PreserveCase } from '../../components/ui/PreserveCase';

const PRIVACY_POLICY_TEXT = `Last updated: April 2026

AllCheckServices ("we", "us") operates this verification CRM mobile app (the "App") on behalf of our enterprise clients (lending banks/NBFCs).

1. WHAT WE COLLECT
- Your account identity (name, employee ID, phone, designation).
- Your verification activity: tasks accepted, photos captured, forms submitted, location captured at the moment of capture.
- Device information: model, OS version, app version, push token.
- Diagnostic logs: app errors, sync events, performance metrics.

2. HOW WE USE IT
- To assign and track field verification tasks.
- To produce verification reports for our enterprise clients.
- To pay your commissions and track your performance.
- To diagnose app issues and improve reliability.

3. WHO WE SHARE IT WITH
- Our enterprise clients receive your verification submissions and reports.
- Our cloud infrastructure providers process the data on our behalf under contract.
- We do not sell your personal data.

4. STORAGE & SECURITY
- App data on your phone is encrypted at rest (SQLCipher).
- Data in transit uses TLS 1.2+ with certificate pinning.
- We retain your verification data for 45 days locally and indefinitely on our servers (subject to client contract).

5. YOUR RIGHTS (under India's DPDP Act 2023)
- You can request a copy of your personal data at any time.
- You can request correction of inaccurate data.
- You can request deletion of your account and personal data, subject to legal retention obligations.
- To exercise these rights, contact: support@allcheckservices.com.

6. CHANGES
- We will update this notice when our practices change. Material changes will be communicated via the app and email.

7. CONTACT
- Email: support@allcheckservices.com
- Address: [Office address]
`;

export const PrivacyPolicyScreen: React.FC = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Privacy Policy
        </Text>
        {/* PreserveCase IS a Text replacement (not a wrapper). It applies
            textTransform:'none' so the global UPPERCASE policy doesn't
            mangle legal text — readability matters here. */}
        <PreserveCase
          style={[styles.body, { color: theme.colors.textSecondary }]}
          accessibilityRole="text"
        >
          {PRIVACY_POLICY_TEXT}
        </PreserveCase>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  body: { fontSize: 14, lineHeight: 22 },
});
