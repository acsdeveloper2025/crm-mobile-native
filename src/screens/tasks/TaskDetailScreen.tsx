import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTask } from '../../hooks/useTask';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TaskTimeline } from '../../components/tasks/TaskTimeline';
import { startVisitUseCase } from '../../usecases/StartVisitUseCase';
import { FormRepository } from '../../repositories/FormRepository';
import { SyncService } from '../../services/SyncService';

export const TaskDetailScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { taskId } = route.params || {};
  const { task, isLoading, error, refetch } = useTask(taskId);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [submissionSync, setSubmissionSync] = useState<{
    status: string;
    syncStatus: string;
    syncError?: string;
  } | null>(null);

  useEffect(() => {
    if (task?.status === 'COMPLETED' && task?.id) {
      FormRepository.getSubmissionSyncStatus(task.id)
        .then(setSubmissionSync)
        .catch(() => {});
    }
  }, [task?.status, task?.id]);

  // Helper to map status to UI colors
  const getStatusColor = (status: string) => {
    if (!status) return theme.colors.textMuted;
    switch (status.toUpperCase()) {
      case 'ASSIGNED':
        return theme.colors.primary;
      case 'IN_PROGRESS':
        return theme.colors.warning;
      case 'COMPLETED':
        return theme.colors.success;
      default:
        return theme.colors.textMuted;
    }
  };

  const handleStartVisit = async () => {
    if (!task) return;

    setIsActionLoading(true);
    try {
      await startVisitUseCase(task.id);
      Alert.alert('Success', 'Visit started successfully.');
      refetch();
      navigation.navigate('VerificationForm', { taskId: task.id });
    } catch (err: unknown) {
      Alert.alert(
        'Error',
        (err instanceof Error ? err.message : String(err)) ||
          'Failed to start visit.',
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleFillForm = () => {
    navigation.navigate('VerificationForm', { taskId: task?.id });
  };

  const handleResubmit = async () => {
    if (!task) return;
    setIsActionLoading(true);
    try {
      const { SyncEngineRepository } = await import(
        '../../repositories/SyncEngineRepository'
      );

      // Check if there are failed sync items to re-queue
      const failedItems = await SyncEngineRepository.query<{ id: string }>(
        "SELECT id FROM sync_queue WHERE status = 'FAILED' AND (json_extract(payload_json, '$.localTaskId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
        [task.id, task.verificationTaskId || task.id],
      );

      if (failedItems.length > 0) {
        // Re-queue failed items and sync
        await SyncEngineRepository.execute(
          "UPDATE sync_queue SET status = 'PENDING', error = NULL, attempts = 0 WHERE status = 'FAILED' AND (json_extract(payload_json, '$.localTaskId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
          [task.id, task.verificationTaskId || task.id],
        );
        await SyncService.performSync();
        const newStatus = await FormRepository.getSubmissionSyncStatus(task.id);
        setSubmissionSync(newStatus);
        if (newStatus?.syncStatus === 'SYNCED') {
          Alert.alert('Success', 'Form resubmitted successfully.');
        } else {
          Alert.alert('Resubmitted', 'Form has been queued for upload.');
        }
      } else {
        // No local data to resubmit — open form to fill and submit again
        Alert.alert(
          'No Local Data',
          'No saved submission found for this task. Would you like to fill the form again?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Form',
              onPress: () =>
                navigation.navigate('VerificationForm', { taskId: task.id }),
            },
          ],
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      Alert.alert('Error', msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.stateText, { color: theme.colors.textSecondary }]}>
          Loading task details...
        </Text>
      </View>
    );
  }

  if (error || !task) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Icon
          name="alert-circle-outline"
          size={48}
          color={theme.colors.danger}
        />
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>
          {error || 'Task not found'}
        </Text>
        <TouchableOpacity
          style={[
            styles.retryButton,
            { backgroundColor: theme.colors.primary },
          ]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={[styles.retryText, { color: theme.colors.surface }]}>
            Back to Task List
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Task Details" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        {/* Header Header */}
        <View
          style={[
            styles.headerCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.headerTop}>
            <Text
              style={[styles.taskNumber, { color: theme.colors.textMuted }]}
            >
              {task.verificationTaskNumber || `Case #${task.caseId}`}
            </Text>
            <View
              style={[
                styles.badge,
                { backgroundColor: getStatusColor(task.status) },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.colors.surface }]}>
                {task.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {task.customerName || task.title}
          </Text>
          <Text style={[styles.clientName, { color: theme.colors.primary }]}>
            {task.clientName}
          </Text>
        </View>

        {/* Revoke Banner */}
        {(task.isRevoked === 1 || task.status === 'REVOKED') && (
          <View style={[styles.sectionCard, styles.revokedBannerContainer]}>
            <View style={styles.revokedBannerHeader}>
              <Icon
                name="alert-circle"
                size={24}
                color="#DC2626"
                style={styles.icon}
              />
              <View style={styles.flex1}>
                <Text style={[styles.sectionTitle, styles.revokedBannerTitle]}>
                  Task Revoked
                </Text>
                {task.revokeReason ? (
                  <Text style={[styles.detailValue, styles.revokedBannerText]}>
                    Reason: {task.revokeReason}
                  </Text>
                ) : null}
                {task.revokedByName ? (
                  <Text
                    style={[styles.detailLabel, styles.revokedBannerSubtext]}
                  >
                    By: {task.revokedByName}
                  </Text>
                ) : null}
                {task.revokedAt ? (
                  <Text
                    style={[styles.detailLabel, styles.revokedBannerSubtext]}
                  >
                    At: {new Date(task.revokedAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {/* Customer Info */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textMuted }]}
          >
            Customer Details
          </Text>
          <View style={styles.detailRow}>
            <Icon
              name="person-outline"
              size={20}
              color={theme.colors.textSecondary}
              style={styles.icon}
            />
            <View>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Name
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.customerName}
              </Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Icon
              name="call-outline"
              size={20}
              color={theme.colors.textSecondary}
              style={styles.icon}
            />
            <View style={styles.phoneBlock}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Phone
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.customerPhone || 'N/A'}
              </Text>
            </View>
            <View style={styles.phoneBlock}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Calling Code
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.customerCallingCode || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Case Details */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textMuted }]}
          >
            Case Details
          </Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Verification Type
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.verificationTypeName || task.verificationType || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Product
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.productName || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Applicant Type
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.applicantType || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Created By (Backend)
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.createdByBackendUser || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Backend Contact
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.backendContactNumber || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Trigger / Notes
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.notes || task.description || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Address Info */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textMuted }]}
          >
            Location
          </Text>
          <View style={styles.detailRow}>
            <Icon
              name="location-outline"
              size={20}
              color={theme.colors.textSecondary}
              style={styles.icon}
            />
            <View style={styles.addressRowContent}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Address
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.addressStreet}, {task.addressCity}, {task.addressState}{' '}
                {task.addressPincode}
              </Text>
            </View>
          </View>
        </View>

        {/* Task Timeline */}
        <View style={styles.timelineContainer}>
          <TaskTimeline task={task} />
        </View>
      </ScrollView>

      {/* Sticky Action Footer */}
      {task.isRevoked !== 1 && (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {task.status === 'ASSIGNED' && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.primary },
                isActionLoading && styles.primaryButtonDisabled,
              ]}
              onPress={handleStartVisit}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <>
                  <ActivityIndicator color={theme.colors.surface} />
                  <Text
                    style={[styles.buttonText, { color: theme.colors.surface }]}
                  >
                    Starting Visit...
                  </Text>
                </>
              ) : (
                <>
                  <Icon
                    name="play-outline"
                    size={20}
                    color={theme.colors.surface}
                  />
                  <Text
                    style={[styles.buttonText, { color: theme.colors.surface }]}
                  >
                    Start Visit
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {(task.status === 'IN_PROGRESS' || task.status === 'REVISIT') && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleFillForm}
            >
              <Icon
                name="create-outline"
                size={20}
                color={theme.colors.surface}
              />
              <Text
                style={[styles.buttonText, { color: theme.colors.surface }]}
              >
                Continue Verification
              </Text>
            </TouchableOpacity>
          )}

          {task.status === 'COMPLETED' && (
            <View>
              {/* Sync Status Banner */}
              {submissionSync?.syncStatus === 'SYNCED' ? (
                <View
                  style={[
                    styles.completedBanner,
                    {
                      backgroundColor: theme.colors.success + '10',
                      borderColor: theme.colors.success,
                    },
                  ]}
                >
                  <Icon
                    name="checkmark-circle"
                    size={24}
                    color={theme.colors.success}
                  />
                  <Text
                    style={[
                      styles.completedText,
                      { color: theme.colors.success },
                    ]}
                  >
                    Submitted to Server
                  </Text>
                </View>
              ) : submissionSync?.syncStatus === 'PENDING' ? (
                <View
                  style={[
                    styles.completedBanner,
                    {
                      backgroundColor: theme.colors.warning + '15',
                      borderColor: theme.colors.warning,
                    },
                  ]}
                >
                  <Icon
                    name="cloud-upload-outline"
                    size={24}
                    color={theme.colors.warning}
                  />
                  <Text
                    style={[
                      styles.completedText,
                      { color: theme.colors.warning },
                    ]}
                  >
                    Pending Upload
                  </Text>
                </View>
              ) : submissionSync ? (
                <View
                  style={[
                    styles.completedBanner,
                    {
                      backgroundColor: theme.colors.danger + '10',
                      borderColor: theme.colors.danger,
                    },
                  ]}
                >
                  <Icon
                    name="alert-circle"
                    size={24}
                    color={theme.colors.danger}
                  />
                  <Text
                    style={[
                      styles.completedText,
                      { color: theme.colors.danger },
                    ]}
                  >
                    Upload Failed
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.completedBanner,
                    {
                      backgroundColor: theme.colors.textMuted + '10',
                      borderColor: theme.colors.textMuted,
                    },
                  ]}
                >
                  <Icon
                    name="help-circle-outline"
                    size={24}
                    color={theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.completedText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    No Submission Found
                  </Text>
                </View>
              )}

              {/* Resubmit button — show when sync failed, pending, or no submission found */}
              {(!submissionSync || submissionSync.syncStatus !== 'SYNCED') && (
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.resubmitButton,
                    { backgroundColor: theme.colors.warning },
                    isActionLoading && styles.buttonDimmed,
                  ]}
                  onPress={handleResubmit}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <>
                      <ActivityIndicator color={theme.colors.surface} />
                      <Text
                        style={[
                          styles.buttonText,
                          { color: theme.colors.surface },
                        ]}
                      >
                        Resubmitting...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="refresh-outline"
                        size={20}
                        color={theme.colors.surface}
                      />
                      <Text
                        style={[
                          styles.buttonText,
                          { color: theme.colors.surface },
                        ]}
                      >
                        Resubmit
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  detailsGrid: {
    marginTop: 8,
  },
  flex1: {
    flex: 1,
  },
  revokedBannerContainer: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  revokedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  revokedBannerTitle: {
    color: '#DC2626',
    marginBottom: 4,
  },
  revokedBannerText: {
    color: '#991B1B',
  },
  revokedBannerSubtext: {
    color: '#B91C1C',
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  headerCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskNumber: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  phoneBlock: {
    flex: 1,
  },
  icon: {
    width: 24,
    marginRight: 12,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  addressRowContent: {
    flex: 1,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.9,
  },
  resubmitButton: {
    marginTop: 10,
  },
  buttonDimmed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  completedBanner: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  completedText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  errorText: {
    fontSize: 16,
    marginVertical: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  stateText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  timelineContainer: {
    marginBottom: 16,
  },
});
