import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Attachment } from '../types/index';
import { useTheme } from '../context/ThemeContext';

interface AttachmentViewerProps {
  attachment: Attachment | null | any;
  isVisible: boolean;
  onClose: () => void;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  attachment,
  isVisible,
  onClose,
}) => {
  const { theme } = useTheme();

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Attachment</Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {attachment?.filename || attachment?.originalName || 'No attachment selected'}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: theme.colors.surface }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 12,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    fontWeight: '600',
  },
});

export default AttachmentViewer;
