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
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { PreserveCase } from '../../components/ui/PreserveCase';
import { useAuth } from '../../context/AuthContext';
import { Logger } from '../../utils/logger';

// F-MD12 (audit 2026-04-28 deeper): DPDP rights are exercised via
// email to support, who track and process via internal ticketing.
// Mobile prefills subject + identity context to make the request
// auditable on receipt.
const SUPPORT_EMAIL = 'support@allcheckservices.com';

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
  const { user } = useAuth();

  // F-MD12: DPDP right-to-erasure / right-to-access. Both flows route
  // through support email so legal/compliance can apply retention
  // exceptions per client contract before action. The mobile request
  // captures the user's identity in the prefilled subject so support
  // can lookup without asking again.
  const sendRightsRequest = (kind: 'deletion' | 'export') => {
    const subject =
      kind === 'deletion'
        ? `Account deletion request — ${
            user?.employeeId ?? user?.email ?? 'unknown'
          }`
        : `Personal data export request — ${
            user?.employeeId ?? user?.email ?? 'unknown'
          }`;
    const body =
      kind === 'deletion'
        ? `I would like to request deletion of my account and personal data under DPDP Act 2023.\n\nName: ${
            user?.name ?? ''
          }\nEmployee ID: ${user?.employeeId ?? ''}\nEmail: ${
            user?.email ?? ''
          }\n`
        : `I would like to request a copy of my personal data under DPDP Act 2023.\n\nName: ${
            user?.name ?? ''
          }\nEmployee ID: ${user?.employeeId ?? ''}\nEmail: ${
            user?.email ?? ''
          }\n`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(err => {
      Logger.warn('PrivacyPolicyScreen', 'mailto failed', err);
      Alert.alert(
        'Unable to open email',
        `Please email ${SUPPORT_EMAIL} with the subject "${subject}".`,
      );
    });
  };

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

        <View style={styles.actions}>
          <Text style={[styles.actionsTitle, { color: theme.colors.text }]}>
            Exercise Your Rights
          </Text>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: theme.colors.primary }]}
            onPress={() => sendRightsRequest('export')}
            accessibilityRole="button"
            accessibilityLabel="Request a copy of my personal data"
          >
            <PreserveCase
              style={[styles.actionText, { color: theme.colors.primary }]}
            >
              Request a Copy of My Data
            </PreserveCase>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: theme.colors.danger }]}
            onPress={() =>
              Alert.alert(
                'Request Account Deletion',
                'This will email support to request deletion of your account and personal data. Some records may be retained for legal/audit obligations. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => sendRightsRequest('deletion'),
                  },
                ],
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Request account deletion"
          >
            <PreserveCase
              style={[styles.actionText, { color: theme.colors.danger }]}
            >
              Request Account Deletion
            </PreserveCase>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  body: { fontSize: 14, lineHeight: 22 },
  actions: { marginTop: 24 },
  actionsTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  actionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '600' },
});
