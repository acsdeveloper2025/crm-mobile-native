// PrivacyConsentScreen — F-MD12 (audit 2026-04-28 deeper).
//
// Shown once after login when the agent has not yet accepted the
// current privacy policy version (DPDP Act 2023 notice obligation).
// On accept, persists the version via PrivacyConsentService and the
// caller's onAccepted hook re-renders the navigator into the main app.

import React, { useCallback, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { PreserveCase } from '../../components/ui/PreserveCase';
import { PrivacyConsentService } from '../../services/PrivacyConsentService';
import { Logger } from '../../utils/logger';
import { FIELD_EXECUTIVE_ACKNOWLEDGEMENT } from '../../constants/fieldExecutiveAcknowledgement';

interface Props {
  onAccepted: () => void;
}

// Treat "within this many px of the bottom" as read-to-end — fractional
// layout heights and overscroll mean the sum rarely lands exactly on
// contentSize.height.
const SCROLL_END_TOLERANCE = 24;

export const PrivacyConsentScreen: React.FC<Props> = ({ onAccepted }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  // 2026-07-16: "I Accept" stays disabled until the agent has actually
  // scrolled through the notice. The button asserts "you have read and
  // agreed to all 10 sections" and the acceptance is recorded for DPDP
  // audit — it must not be tappable from the first screenful.
  const [hasReadToEnd, setHasReadToEnd] = useState(false);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  // If the notice ever fits the viewport without scrolling (short policy,
  // tablet, large display), onScroll NEVER fires — gating on it alone would
  // lock the agent out of the app permanently. Reaching the end is then
  // vacuously true.
  const markReadIfContentFits = useCallback(() => {
    if (
      viewportHeightRef.current > 0 &&
      contentHeightRef.current > 0 &&
      contentHeightRef.current <= viewportHeightRef.current + SCROLL_END_TOLERANCE
    ) {
      setHasReadToEnd(true);
    }
  }, []);

  const handleScrollViewLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportHeightRef.current = e.nativeEvent.layout.height;
      markReadIfContentFits();
    },
    [markReadIfContentFits],
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentHeightRef.current = h;
      markReadIfContentFits();
    },
    [markReadIfContentFits],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - SCROLL_END_TOLERANCE
      ) {
        // Latch: scrolling back up must not un-read the notice.
        setHasReadToEnd(true);
      }
    },
    [],
  );

  const handleAccept = async () => {
    if (submitting || !hasReadToEnd) {
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
        onLayout={handleScrollViewLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <PreserveCase
          style={[styles.body, { color: theme.colors.textSecondary }]}
        >
          {FIELD_EXECUTIVE_ACKNOWLEDGEMENT}
        </PreserveCase>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!hasReadToEnd ? (
          <Text style={[styles.scrollHint, { color: theme.colors.textMuted }]}>
            Scroll to the end of the notice to continue
          </Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.acceptButton,
            { backgroundColor: theme.colors.primary },
            (submitting || !hasReadToEnd) && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={submitting || !hasReadToEnd}
          accessibilityRole="button"
          accessibilityLabel="Accept privacy notice"
          accessibilityState={{ disabled: submitting || !hasReadToEnd }}
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
  scrollHint: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonDisabled: { opacity: 0.6 },
  acceptText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
