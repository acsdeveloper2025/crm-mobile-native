import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';

const ImageModal: React.FC<any> = ({ isVisible, onClose }) => (
  <Modal visible={!!isVisible} transparent onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 12 }}>
        <Text>Image preview unavailable.</Text>
        <TouchableOpacity onPress={onClose}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default ImageModal;
