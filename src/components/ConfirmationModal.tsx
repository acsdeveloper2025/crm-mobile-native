import React, { ReactNode } from 'react';
import Modal from './Modal';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';


interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  saveText?: string;
  confirmText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onConfirm,
  title,
  children,
  saveText = 'Save',
  confirmText = 'Confirm',
}) => {
  const { theme } = useTheme();
  return (
    <Modal isVisible={isOpen} onClose={onClose} title={title}>
      <View style={{ gap: 16 }}>
        {children}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 24 }}>
          <TouchableOpacity
            onPress={onSave}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: theme.colors.success }}>
            <Text style={{ color: 'white', fontWeight: '600' }}>{saveText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: theme.colors.primary }}>
            <Text style={{ color: 'white', fontWeight: '600' }}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default ConfirmationModal;
