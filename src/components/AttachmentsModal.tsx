import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import AttachmentViewer from './AttachmentViewer';
import { useTheme } from '../context/ThemeContext';

interface AttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  onAttachmentsChange?: () => void;
}

const AttachmentsModal: React.FC<AttachmentsModalProps> = ({
  isOpen,
  onClose,
  taskId,
}) => {
  const { theme } = useTheme();
  const items = useMemo(() => [], []);

  return (
    <>
      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Attachments</Text>
            <FlatList
              data={items}
              keyExtractor={(_, index) => String(index)}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
                  Attachments are not available in this build for task {taskId}.
                </Text>
              }
              renderItem={() => null}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: theme.colors.surface }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <AttachmentViewer attachment={null} isVisible={false} onClose={() => {}} />
    </>
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
    maxHeight: '70%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  empty: {
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

export default AttachmentsModal;
