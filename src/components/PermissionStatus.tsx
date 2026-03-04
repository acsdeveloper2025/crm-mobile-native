import React from 'react';
import { View, Text } from 'react-native';

interface PermissionStatusProps {
  showOnlyDenied?: boolean;
}

const PermissionStatus: React.FC<PermissionStatusProps> = ({ showOnlyDenied = false }) => (
  <View>
    <Text>
      Permission diagnostics are not available in this build.
      {showOnlyDenied ? ' Showing denied only.' : ''}
    </Text>
  </View>
);

export default PermissionStatus;
