import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ProfilePhotoCaptureProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

const ProfilePhotoCapture: React.FC<ProfilePhotoCaptureProps> = ({ onSave, onCancel }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
        Profile photo capture is not enabled in this build.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={{ color: theme.colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSave('')}>
          <Text style={{ color: theme.colors.primary }}>Use Placeholder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  text: {
    fontSize: 14,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default ProfilePhotoCapture;
