import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SubmissionProgressModalProps {
  isVisible?: boolean;
  visible?: boolean;
  onClose?: () => void;
}

export const SubmissionProgressModal: React.FC<SubmissionProgressModalProps> = ({
  isVisible,
  visible,
  onClose,
}) => (
  <Modal visible={!!(isVisible ?? visible)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>Submission Progress</Text>
        <Text style={styles.body}>Detailed submission progress is disabled in this build.</Text>
        <TouchableOpacity onPress={onClose}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
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
});

export default SubmissionProgressModal;
