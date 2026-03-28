import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NetworkService } from '../../services/NetworkService';
import Icon from 'react-native-vector-icons/Ionicons';

/**
 * Persistent network status banner shown app-wide.
 * - Shows red "You are offline" when device loses connection
 * - Shows brief green "Back online" when connection restored
 * - Auto-hides the online banner after 3 seconds
 */
export const NetworkStatusBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(NetworkService.getIsOnline());
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const wasOfflineRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = NetworkService.onNetworkChange((online) => {
      setIsOnline(online);

      if (online && wasOfflineRef.current) {
        // Just came back online — show brief success banner
        setShowOnlineBanner(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        setTimeout(() => {
          Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
            setShowOnlineBanner(false);
          });
        }, 3000);
      }

      wasOfflineRef.current = !online;
    });

    // Initialize
    wasOfflineRef.current = !NetworkService.getIsOnline();

    return unsubscribe;
  }, [fadeAnim]);

  if (!isOnline) {
    return (
      <View style={[styles.banner, styles.offlineBanner, { paddingTop: Math.max(insets.top, 8) }]}>
        <Icon name="cloud-offline-outline" size={16} color="#FFFFFF" />
        <Text style={styles.offlineText}>
          You are offline. Changes will be saved locally and synced when connection is restored.
        </Text>
      </View>
    );
  }

  if (showOnlineBanner) {
    return (
      <Animated.View style={[styles.banner, styles.onlineBanner, { paddingTop: Math.max(insets.top, 8), opacity: fadeAnim }]}>
        <Icon name="cloud-done-outline" size={16} color="#FFFFFF" />
        <Text style={styles.onlineText}>Back online. Syncing...</Text>
      </Animated.View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  offlineBanner: {
    backgroundColor: '#DC2626',
  },
  onlineBanner: {
    backgroundColor: '#16A34A',
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  onlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});
