import React, { useEffect, useState } from 'react';
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
import {
  RevokeReasonsRepository,
  type RevokeReasonRow,
} from '../../repositories/RevokeReasonsRepository';
import { Logger } from '../../utils/logger';

const TAG = 'TaskRevokeModal';

interface TaskRevokeModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * A2.4 (audit 2026-05-25): submit string is the master `label`
   * (e.g. "Not my area"). The compiled-in `RevokeReason` enum values
   * map 1:1 to the same labels for offline fallback compatibility.
   */
  onRevoke: (reason: string) => Promise<void>;
  isRevoking: boolean;
}

/**
 * Offline fallback list used when the local revoke_reasons mirror is
 * empty (fresh install before first successful sync). Mirrors the
 * `RevokeReason` enum order from `src/types/api.ts`.
 */
const FALLBACK_REASONS: Array<{ code: string; label: string }> = [
  { code: 'NOT_MY_AREA', label: RevokeReason.NotMyArea },
  { code: 'WRONG_PINCODE', label: RevokeReason.WrongPincode },
  { code: 'NOT_WORKING', label: RevokeReason.NotWorking },
  { code: 'LEFT_AREA', label: RevokeReason.LeftArea },
  { code: 'WRONG_INCOMPLETE_ADDRESS', label: RevokeReason.WrongAddress },
];

export const TaskRevokeModal: React.FC<TaskRevokeModalProps> = ({
  visible,
  onClose,
  onRevoke,
  isRevoking,
}) => {
  const { theme } = useTheme();
  const [reasons, setReasons] = useState<Array<{ code: string; label: string }>>(
    FALLBACK_REASONS,
  );
  const [reason, setReason] = useState<string>(FALLBACK_REASONS[0].label);

  // Hydrate from the local mirror each time the modal opens. Falls back
  // to the compiled-in list when the table is empty (fresh install
  // offline) or the read fails.
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await RevokeReasonsRepository.listActive();
        if (cancelled) {
          return;
        }
        if (rows.length > 0) {
          const mapped = rows.map((r: RevokeReasonRow) => ({
            code: r.code,
            label: r.label,
          }));
          setReasons(mapped);
          setReason(mapped[0].label);
        } else {
          // empty mirror — keep fallback
          setReasons(FALLBACK_REASONS);
          setReason(FALLBACK_REASONS[0].label);
        }
      } catch (err) {
        Logger.warn(TAG, 'Failed to read revoke_reasons mirror; using fallback', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

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
                  setReason(String(itemValue))
                }
                enabled={!isRevoking}
                dropdownIconColor={theme.colors.text}
                style={{ color: theme.colors.text }}
              >
                {reasons.map(r => (
                  <Picker.Item key={r.code} label={r.label} value={r.label} />
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
