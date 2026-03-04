import React from 'react';
import { View, Text } from 'react-native';

interface SyncStatusIndicatorProps {
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = () => (
  <View>
    <Text>Sync status available in diagnostics.</Text>
  </View>
);

export default SyncStatusIndicator;
