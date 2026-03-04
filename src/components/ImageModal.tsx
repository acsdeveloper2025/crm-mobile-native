import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ImageModalProps {
  isVisible?: boolean;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ isVisible, onClose }) => (
  <Modal visible={!!isVisible} transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text>Image preview unavailable.</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
  },
});

export default ImageModal;
