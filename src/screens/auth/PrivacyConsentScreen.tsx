// PrivacyConsentScreen — F-MD12 (audit 2026-04-28 deeper).
//
// Shown once after login when the agent has not yet accepted the
// current privacy policy version (DPDP Act 2023 notice obligation).
// On accept, persists the version via PrivacyConsentService and the
// caller's onAccepted hook re-renders the navigator into the main app.

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { PreserveCase } from '../../components/ui/PreserveCase';
import { PrivacyConsentService } from '../../services/PrivacyConsentService';
import { Logger } from '../../utils/logger';

const NOTICE = `Last updated: April 2026

By using this app you confirm you have read our privacy notice.

WHAT WE COLLECT
- Your account identity (name, employee ID, phone, designation).
- Verification activity: tasks accepted, photos captured, forms submitted, location at the moment of capture.
- Device + diagnostic information for app reliability.

HOW WE USE IT
- Assigning verification tasks, producing client reports, paying commissions, diagnosing issues.

YOUR RIGHTS (DPDP Act 2023)
- Request access, correction, or deletion of your personal data.
- Withdraw consent at any time (may limit your ability to use the app).

To exercise your rights, use the Profile → Privacy Policy screen, or email support@allcheckservices.com.
`;

interface Props {
  onAccepted: () => void;
}

export const PrivacyConsentScreen: React.FC<Props> = ({ onAccepted }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await PrivacyConsentService.accept();
      onAccepted();
    } catch (err) {
      Logger.error('PrivacyConsentScreen', 'Failed to record consent', err);
      setSubmitting(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Privacy Notice
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <PreserveCase
          style={[styles.body, { color: theme.colors.textSecondary }]}
        >
          {NOTICE}
        </PreserveCase>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[
            styles.acceptButton,
            { backgroundColor: theme.colors.primary },
            submitting && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Accept privacy notice"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptText}>I Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 16,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  body: { fontSize: 14, lineHeight: 22 },
  footer: { paddingTop: 12 },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonDisabled: { opacity: 0.6 },
  acceptText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
