import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: object;
}

export const SkeletonBox: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const { theme } = useTheme();
  // 2026-04-27 deep-audit fix (D12): respect Reduce Motion. When on, the
  // shimmer pulse loop is replaced with a static mid-opacity tint so users
  // sensitive to motion don't get a constantly-pulsing skeleton.
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 0.5 : 0.3)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        // M13 (audit 2026-04-21): theme-aware skeleton tint. Previous
        // hardcoded `#E5E7EB` showed a bright gray block in dark mode.
        { backgroundColor: theme.colors.border },
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
};

export const TaskCardSkeleton = () => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <SkeletonBox width={80} height={24} borderRadius={12} />
        <SkeletonBox width={100} height={16} />
      </View>
      <SkeletonBox width="60%" height={20} style={styles.mb12} />
      <SkeletonBox width="40%" height={16} style={styles.mb12} />
      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <SkeletonBox width="80%" height={16} />
      </View>
    </View>
  );
};

export const DashboardCardSkeleton = () => {
  const { theme } = useTheme();
  return (
    <View
      style={[styles.dashboardCard, { backgroundColor: theme.colors.surface }]}
    >
      <SkeletonBox
        width={40}
        height={40}
        borderRadius={8}
        style={styles.mb16}
      />
      <SkeletonBox width="40%" height={24} style={styles.mb8} />
      <SkeletonBox width="70%" height={16} />
    </View>
  );
};

// M15 (audit 2026-04-21): per-screen skeletons replace bare
// ActivityIndicator spinners so users see a rough layout preview that
// matches the real page, reducing perceived load time.

export const TaskDetailSkeleton = () => {
  const { theme } = useTheme();
  const cardStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  };
  return (
    <View style={styles.scrollPad}>
      {/* Header card */}
      <View style={[styles.card, cardStyle]}>
        <View style={styles.header}>
          <SkeletonBox width={90} height={22} borderRadius={11} />
          <SkeletonBox width={60} height={16} />
        </View>
        <SkeletonBox width="70%" height={22} style={styles.mb12} />
        <SkeletonBox width="50%" height={16} style={styles.mb12} />
        <SkeletonBox width="40%" height={16} />
      </View>

      {/* Details card */}
      <View style={[styles.card, cardStyle]}>
        <SkeletonBox width={120} height={18} style={styles.mb16} />
        <SkeletonBox width="90%" height={14} style={styles.mb8} />
        <SkeletonBox width="85%" height={14} style={styles.mb8} />
        <SkeletonBox width="60%" height={14} style={styles.mb8} />
        <SkeletonBox width="75%" height={14} />
      </View>

      {/* Action card */}
      <View style={[styles.card, cardStyle]}>
        <SkeletonBox width="100%" height={44} borderRadius={8} />
      </View>
    </View>
  );
};

export const VerificationFormSkeleton = () => {
  const { theme } = useTheme();
  const sectionStyle = {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
  };
  return (
    <View style={styles.scrollPad}>
      {/* Outcome picker */}
      <View style={[styles.card, sectionStyle]}>
        <SkeletonBox width={100} height={16} style={styles.mb8} />
        <SkeletonBox width="100%" height={44} borderRadius={8} />
      </View>

      {/* Form section 1 */}
      <View style={[styles.card, sectionStyle]}>
        <SkeletonBox width={140} height={18} style={styles.mb16} />
        <SkeletonBox
          width="100%"
          height={44}
          borderRadius={8}
          style={styles.mb12}
        />
        <SkeletonBox
          width="100%"
          height={44}
          borderRadius={8}
          style={styles.mb12}
        />
        <SkeletonBox width="100%" height={44} borderRadius={8} />
      </View>

      {/* Form section 2 */}
      <View style={[styles.card, sectionStyle]}>
        <SkeletonBox width={160} height={18} style={styles.mb16} />
        <SkeletonBox
          width="100%"
          height={44}
          borderRadius={8}
          style={styles.mb12}
        />
        <SkeletonBox width="100%" height={88} borderRadius={8} />
      </View>
    </View>
  );
};

export const SyncLogsSkeleton = () => {
  const { theme } = useTheme();
  const rowStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  };
  return (
    <View>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={`sync-skel-${i}`} style={[styles.syncRow, rowStyle]}>
          <SkeletonBox width={24} height={24} borderRadius={12} />
          <View style={styles.syncRowBody}>
            <SkeletonBox width="70%" height={14} style={styles.mb8} />
            <SkeletonBox width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  dashboardCard: {
    borderRadius: 16,
    padding: 20,
    width: '48%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb8: { marginBottom: 8 },
  scrollPad: {
    padding: 16,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  syncRowBody: {
    flex: 1,
  },
});
