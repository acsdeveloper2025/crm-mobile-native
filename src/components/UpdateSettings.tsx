import React from 'react';
import { View, Text } from 'react-native';

interface UpdateSettingsProps {
  onClose?: () => void;
}

export const UpdateSettings: React.FC<UpdateSettingsProps> = () => (
  <View>
    <Text>Update settings are not available in this build.</Text>
  </View>
);

export default UpdateSettings;
