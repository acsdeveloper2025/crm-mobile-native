import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RevokeReason } from '../../types/api';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker';

interface TaskRevokeModalProps {
  visible: boolean;
  onClose: () => void;
  onRevoke: (reason: RevokeReason) => Promise<void>;
  isRevoking: boolean;
}

export const TaskRevokeModal: React.FC<TaskRevokeModalProps> = ({
  visible,
  onClose,
  onRevoke,
  isRevoking,
}) => {
  const { theme } = useTheme();
  // Provide a default value mapping to the first enum value
  const [reason, setReason] = useState<RevokeReason>(RevokeReason.NotMyArea);

  const handleConfirm = async () => {
    await onRevoke(reason);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Revoke Task
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={isRevoking}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Reason for Revocation
            </Text>

            <View
              style={[
                styles.pickerContainer,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                },
              ]}
            >
              <Picker
                selectedValue={reason}
                onValueChange={(itemValue: unknown) =>
                  setReason(itemValue as RevokeReason)
                }
                enabled={!isRevoking}
                dropdownIconColor={theme.colors.text}
                style={{ color: theme.colors.text }}
              >
                {Object.values(RevokeReason).map(r => (
                  <Picker.Item key={r} label={r} value={r} />
                ))}
              </Picker>
            </View>

            <Text
              style={[
                styles.warningText,
                { color: theme.colors.textSecondary },
              ]}
            >
              This will revoke the verification task and notify backend users.
              This action cannot be undone.
            </Text>
          </View>

          <View
            style={[
              styles.modalFooter,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.cancelButton,
                { backgroundColor: theme.colors.background },
              ]}
              onPress={onClose}
              disabled={isRevoking}
            >
              <Text
                style={[styles.cancelButtonText, { color: theme.colors.text }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: theme.colors.danger },
                isRevoking && styles.disabledConfirmButton,
              ]}
              onPress={handleConfirm}
              disabled={isRevoking}
            >
              {isRevoking ? (
                <ActivityIndicator color={theme.colors.surface} />
              ) : (
                <Text
                  style={[
                    styles.confirmButtonText,
                    { color: theme.colors.surface },
                  ]}
                >
                  Confirm Revoke
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledConfirmButton: {
    opacity: 0.7,
  },
});
