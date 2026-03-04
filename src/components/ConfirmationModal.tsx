import React, { ReactNode } from 'react';
import Modal from './Modal';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
      <View style={styles.content}>
        {children}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onSave}
            style={[styles.button, { backgroundColor: theme.colors.success }]}>
            <Text style={styles.buttonText}>{saveText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={[styles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.buttonText}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 24,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

export default ConfirmationModal;
