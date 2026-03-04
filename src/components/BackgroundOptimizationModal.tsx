import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface BackgroundOptimizationModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

const BackgroundOptimizationModal: React.FC<BackgroundOptimizationModalProps> = ({
  visible,
  onClose,
  onOpenSettings,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>Background Optimization</Text>
        <Text style={styles.body}>This prompt is not enabled in the native build yet.</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onClose}>
            <Text>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings || onClose}>
            <Text>Settings</Text>
          </TouchableOpacity>
        </View>
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default BackgroundOptimizationModal;
