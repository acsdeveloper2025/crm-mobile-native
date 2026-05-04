import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  notificationService,
  type ForegroundNotificationPayload,
} from '../../services/NotificationService';
import { navigationRef } from '../../navigation/RootNavigator';
import type { Theme } from '../../theme/Theme';

/**
 * Phase 1.1 (2026-05-04) — WhatsApp-style foreground toast banner.
 *
 * Slides down from the top of the screen when an FCM push arrives while
 * the app is in foreground. Auto-dismisses after AUTO_DISMISS_MS, or
 * dismisses immediately when tapped. Tapping navigates to the task /
 * dashboard depending on payload.taskId.
 *
 * Mounted ONCE in App.tsx after NetworkStatusBanner. Subscribes to
 * `notificationService.onForegroundNotification`. Distinct from the bell
 * icon's NotificationCenter (that's the persistent list); this banner is
 * the moment-of-arrival popup.
 */
const AUTO_DISMISS_MS = 4500;
const SLIDE_IN_MS = 280;
const SLIDE_OUT_MS = 220;

export const ForegroundNotificationBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();

  const [current, setCurrent] = useState<ForegroundNotificationPayload | null>(
    null,
  );
  const slide = useRef(new Animated.Value(-200)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide animation runs first; setCurrent(null) only after slide-out
  // finishes. Otherwise the banner snaps off-screen.
  const dismiss = React.useCallback(
    (immediate: boolean = false) => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      if (immediate || reduceMotion) {
        slide.setValue(-200);
        fade.setValue(0);
        setCurrent(null);
        return;
      }
      Animated.parallel([
        Animated.timing(slide, {
          toValue: -200,
          duration: SLIDE_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: SLIDE_OUT_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setCurrent(null);
        }
      });
    },
    [slide, fade, reduceMotion],
  );

  useEffect(() => {
    const unsubscribe = notificationService.onForegroundNotification(
      payload => {
        // If a banner is already showing, replace it with the latest. Reset
        // the auto-dismiss timer so the new one gets the full window.
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
        setCurrent(payload);
      },
    );
    return () => {
      unsubscribe();
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  // Whenever `current` changes to a new payload, run the slide-in
  // animation + arm the auto-dismiss timer.
  useEffect(() => {
    if (!current) {
      return;
    }
    if (reduceMotion) {
      slide.setValue(0);
      fade.setValue(1);
    } else {
      slide.setValue(-200);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: SLIDE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: SLIDE_IN_MS,
          useNativeDriver: true,
        }),
      ]).start();
    }
    dismissTimer.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [current, dismiss, fade, slide, reduceMotion]);

  const handlePress = React.useCallback(() => {
    if (!current) {
      return;
    }
    const taskId = current.taskId;
    // Best-effort navigation. If nav isn't ready or taskId is absent,
    // we simply dismiss — the notification still landed in the bell
    // icon's persistent list via addNotification().
    const navRef = navigationRef.current;
    if (taskId && navRef?.isReady?.()) {
      try {
        // navigationRef is typed against the strict RootStackParamList
        // and the navigate overload narrows to `never` without importing
        // the param map here. Keeping this component decoupled from the
        // nav types — the `TaskDetail` screen is registered in
        // RootNavigator.tsx and is the same destination used by
        // navigationRef.current?.navigate('TaskDetail', { taskId }) at
        // line 363 there.
        const nav = navRef.navigate as unknown as (
          name: string,
          params: { taskId: string },
        ) => void;
        nav('TaskDetail', { taskId });
      } catch {
        // swallow — banner still dismisses
      }
    }
    dismiss(true);
  }, [current, dismiss]);

  if (!current) {
    return null;
  }

  const accentColor = priorityColor(theme, current.priority);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 8),
          transform: [{ translateY: slide }],
          opacity: fade,
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { borderLeftColor: accentColor },
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${current.title}. ${current.message}. Tap to open.`}
      >
        <View style={[styles.iconBubble, { backgroundColor: accentColor }]}>
          <Icon name="notifications" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {current.title}
          </Text>
          <Text style={styles.message} numberOfLines={2} ellipsizeMode="tail">
            {current.message}
          </Text>
        </View>
        <Pressable
          onPress={() => dismiss()}
          hitSlop={10}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
        >
          <Icon name="close" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
};

const priorityColor = (
  theme: Theme,
  priority: ForegroundNotificationPayload['priority'],
): string => {
  switch (priority) {
    case 'URGENT':
      return theme.colors.danger;
    case 'HIGH':
      return theme.colors.primary;
    case 'LOW':
      return theme.colors.textMuted;
    case 'MEDIUM':
    default:
      return theme.colors.primary;
  }
};

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      zIndex: 9999,
      elevation: 9999,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderLeftWidth: 4,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    cardPressed: {
      opacity: 0.85,
    },
    iconBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    body: {
      flex: 1,
      flexShrink: 1,
    },
    title: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },
    message: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    closeBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
  });
