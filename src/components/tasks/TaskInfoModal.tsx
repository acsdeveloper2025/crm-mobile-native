import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LocalTask } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';

interface TaskInfoModalProps {
  visible: boolean;
  task: LocalTask | null;
  onClose: () => void;
}

const InfoRow = ({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: any;
}) => (
  <View style={styles.infoRow}>
    <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>
      {label}
    </Text>
    <Text style={[styles.infoValue, { color: theme.colors.text }]}>
      {value || 'N/A'}
    </Text>
  </View>
);

export const TaskInfoModal: React.FC<TaskInfoModalProps> = ({
  visible,
  task,
  onClose,
}) => {
  const { theme } = useTheme();

  if (!task) {
    return null;
  }

  const getPriorityText = (priority: string): string => {
    switch (priority) {
      case '1':
        return 'Low';
      case '2':
        return 'Medium';
      case '3':
        return 'High';
      case '4':
        return 'Urgent';
      default:
        return priority || 'Medium';
    }
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
              Task Information
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator
            persistentScrollbar
            indicatorStyle="default"
          >
            <InfoRow
              label="Customer Name"
              value={task.customerName}
              theme={theme}
            />
            <InfoRow label="Case ID" value={`#${task.caseId}`} theme={theme} />
            <InfoRow
              label="Verification Task Number"
              value={task.verificationTaskNumber || ''}
              theme={theme}
            />
            <InfoRow label="Client" value={task.clientName} theme={theme} />
            <InfoRow
              label="Product"
              value={task.productName || ''}
              theme={theme}
            />
            <InfoRow
              label="Verification Type"
              value={task.verificationTypeName || task.verificationType || ''}
              theme={theme}
            />
            <InfoRow
              label="Applicant Type"
              value={task.applicantType || ''}
              theme={theme}
            />
            <InfoRow
              label="Created By"
              value={task.createdByBackendUser || ''}
              theme={theme}
            />
            <InfoRow
              label="Contact Number"
              value={task.backendContactNumber || ''}
              theme={theme}
            />
            <InfoRow
              label="Assigned To"
              value={task.assignedToFieldUser || ''}
              theme={theme}
            />
            <InfoRow
              label="Priority"
              value={getPriorityText(task.priority)}
              theme={theme}
            />
            <InfoRow
              label="Trigger / Notes"
              value={task.notes || task.description || ''}
              theme={theme}
            />
            <InfoRow
              label="Customer Calling Code"
              value={task.customerCallingCode || ''}
              theme={theme}
            />
            <View style={styles.infoRow}>
              <Text
                style={[styles.infoLabel, { color: theme.colors.textMuted }]}
              >
                Address
              </Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {task.addressStreet ||
                  [task.addressCity, task.addressState, task.addressPincode]
                    .filter(Boolean)
                    .join(' ')
                    .trim()}
              </Text>
            </View>
          </ScrollView>

          <View
            style={[
              styles.modalFooter,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.closeButtonText,
                  { color: theme.colors.surface },
                ]}
              >
                Close
              </Text>
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
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
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
    paddingLeft: 20,
    paddingTop: 20,
  },
  modalBodyContent: {
    paddingRight: 12,
    paddingBottom: 20,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
  },
  closeButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
