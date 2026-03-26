import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

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
  style 
}) => {
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
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View 
      style={[
        styles.skeleton, 
        { width, height, borderRadius, opacity },
        style
      ]} 
    />
  );
};

export const TaskCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.header}>
      <SkeletonBox width={80} height={24} borderRadius={12} />
      <SkeletonBox width={100} height={16} />
    </View>
    <SkeletonBox width="60%" height={20} style={styles.mb12} />
    <SkeletonBox width="40%" height={16} style={styles.mb12} />
    <View style={styles.footer}>
      <SkeletonBox width="80%" height={16} />
    </View>
  </View>
);

export const DashboardCardSkeleton = () => (
  <View style={styles.dashboardCard}>
    <SkeletonBox width={40} height={40} borderRadius={8} style={styles.mb16} />
    <SkeletonBox width="40%" height={24} style={styles.mb8} />
    <SkeletonBox width="70%" height={16} />
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E5E7EB', // gray-200
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
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
    borderTopColor: '#F3F4F6',
  },
  dashboardCard: {
    backgroundColor: '#FFFFFF',
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
  mb8: { marginBottom: 8 }
});
