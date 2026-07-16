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
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PreserveCase } from '../../components/ui/PreserveCase';
import { useAuth } from '../../context/AuthContext';
import { Logger } from '../../utils/logger';
import { FIELD_EXECUTIVE_ACKNOWLEDGEMENT } from '../../constants/fieldExecutiveAcknowledgement';

// F-MD12 (audit 2026-04-28 deeper): DPDP rights are exercised via
// email to support, who track and process via internal ticketing.
// Mobile prefills subject + identity context to make the request
// auditable on receipt.
const SUPPORT_EMAIL = 'support@allcheckservices.com';

export const PrivacyPolicyScreen: React.FC = () => {
  const { theme } = useTheme();
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* 2026-07-16: was a bare in-scroll <Text> title with no way back —
          the navigator sets headerShown:false, so a screen that doesn't
          render ScreenHeader has no back affordance at all. */}
      <ScreenHeader title="Privacy Policy" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* PreserveCase IS a Text replacement (not a wrapper). It applies
            textTransform:'none' so the global UPPERCASE policy doesn't
            mangle legal text — readability matters here. */}
        <PreserveCase
          style={[styles.body, { color: theme.colors.textSecondary }]}
          accessibilityRole="text"
        >
          {FIELD_EXECUTIVE_ACKNOWLEDGEMENT}
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
