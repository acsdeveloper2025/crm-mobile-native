import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, [opacity]);

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
});
