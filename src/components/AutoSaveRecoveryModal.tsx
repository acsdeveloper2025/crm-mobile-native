import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface AutoSaveRecoveryModalProps {
  isVisible: boolean;
  savedData: any;
  onRestore: (data: any) => void;
  onDiscard: () => void;
  onCancel: () => void;
}

const AutoSaveRecoveryModal: React.FC<AutoSaveRecoveryModalProps> = ({
  isVisible,
  savedData,
  onRestore,
  onDiscard,
  onCancel,
}) => {
  const { theme } = useTheme();

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Restore Draft</Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {savedData ? 'A saved draft is available.' : 'No saved draft found.'}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={{ color: theme.colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDiscard}>
              <Text style={{ color: theme.colors.danger }}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onRestore(savedData)}>
              <Text style={{ color: theme.colors.primary }}>Restore</Text>
            </TouchableOpacity>
          </View>
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default AutoSaveRecoveryModal;
