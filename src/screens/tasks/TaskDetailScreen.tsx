import React, { useState, useEffect, useRef } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTask } from '../../hooks/useTask';
import { formatTaskAddress } from '../../utils/formatTaskAddress';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TaskDetailSkeleton } from '../../components/ui/Skeleton';
import { TaskTimeline } from '../../components/tasks/TaskTimeline';
import { startVisitUseCase } from '../../usecases/StartVisitUseCase';
import { FormRepository } from '../../repositories/FormRepository';
import { countUnuploadedEvidence } from '../../utils/evidenceCount';
import { Logger } from '../../utils/logger';
import { isFieldSubmitted, toFieldStatus } from '../../utils/fieldStatus';
import { SyncService } from '../../services/SyncService';
import { notificationService } from '../../services/NotificationService';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetail'>;

export const TaskDetailScreen = ({ route, navigation }: Props) => {
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
  // Captures that have not reached the server (no backend_attachment_id). A
  // synced FORM does not mean a complete SUBMISSION — see the loader below.
  const [unuploadedEvidence, setUnuploadedEvidence] = useState(0);
  // Phase 3.2 (2026-05-04): WhatsApp-style task mute. Read once on mount,
  // toggle via mute/unmute API. Backend's getScopedNotificationRows
  // filter silences the bell on the next refresh; mute is online-only
  // (no offline queue) — agents in the field rarely hit this anyway.
  const [isMuted, setIsMuted] = useState(false);
  const [isMuteToggling, setIsMuteToggling] = useState(false);
  const muteTaskUuid = task?.verificationTaskId || task?.id || null;

  // H16 (audit 2026-04-21): guard setState calls in async handlers
  // against unmount. Without this, `handleStartVisit`'s finally
  // setState could fire after the user navigated away, producing
  // the classic "can't perform React state update on unmounted
  // component" console warning.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Phase 3.2: hydrate mute state from backend on mount + when task changes.
    // Cheap + best-effort — failure leaves the toggle in "muted=false" which
    // matches the silent default (notifications still flow as usual).
    if (!muteTaskUuid) return;
    let cancelled = false;
    notificationService
      .listMutes()
      .then(mutes => {
        if (cancelled) return;
        setIsMuted(mutes.some(m => m.taskId === muteTaskUuid));
      })
      .catch(err => {
        Logger.warn('TaskDetailScreen', 'Failed to hydrate mute state', err);
      });
    return () => {
      cancelled = true;
    };
  }, [muteTaskUuid]);

  const handleToggleMute = async () => {
    if (!muteTaskUuid || isMuteToggling) return;
    setIsMuteToggling(true);
    try {
      if (isMuted) {
        await notificationService.unmuteTask(muteTaskUuid);
        if (isMountedRef.current) setIsMuted(false);
      } else {
        await notificationService.muteTask(muteTaskUuid);
        if (isMountedRef.current) setIsMuted(true);
      }
    } catch (err) {
      Logger.warn('TaskDetailScreen', 'Mute toggle failed', err);
      Alert.alert(
        'Mute Failed',
        'Could not update notifications for this task. Try again.',
      );
    } finally {
      if (isMountedRef.current) setIsMuteToggling(false);
    }
  };

  useEffect(() => {
    // 2026-07-17: was `task?.status === 'COMPLETED'` — a status the device
    // never writes, so submissionSync never loaded for a just-submitted task.
    if (isFieldSubmitted(task?.status) && task?.id) {
      // H14 (audit 2026-04-21): was .catch(() => {}) — silent. Log
      // the failure so a broken sync-status read doesn't leave the
      // UI in a stale "unknown" state without any record.
      FormRepository.getSubmissionSyncStatus(task.id)
        .then(setSubmissionSync)
        .catch(err => {
          Logger.warn(
            'TaskDetailScreen',
            `Failed to load submission sync status for task ${task.id}`,
            err,
          );
        });

      // 2026-07-17 (owner rule): "Resubmit only shows if any data is missing —
      // fields or photo capture."
      //
      // A synced FORM does not mean the server has the SUBMISSION. Photos
      // enqueue at capture and the form enqueues at submit, both at the same
      // priority, so they are ordered only by created_at — and a photo whose
      // upload FAILS gets a next_retry_at backoff and is SKIPPED by the
      // dequeue, while the form (PENDING) uploads anyway.
      // FormUploader.resolveBackendAttachmentIds then ships only the photos
      // that happen to be SYNCED (and, with none, the LOCAL uuids the server
      // cannot resolve). The server acks, the form goes SYNCED, and the agent
      // is told "Submitted to Server" while the case has a partial photo set —
      // which is what breaks report generation, the web template and the
      // reverse-geocode (it reads the photos' GPS).
      //
      // The device can see this: a capture that has not reached the server has
      // no backend_attachment_id. Count those, and treat them as missing data.
      countUnuploadedEvidence(task.id)
        .then(setUnuploadedEvidence)
        .catch(err => {
          Logger.warn(
            'TaskDetailScreen',
            `Failed to count unuploaded evidence for task ${task.id}`,
            err,
          );
        });
    }
  }, [task?.status, task?.id]);

  // Helper to map status to UI colors
  // Takes a FIELD status — the only call site passes toFieldStatus(task.status),
  // so COMPLETED can never arrive here. The old `case 'COMPLETED'` arm was dead,
  // and had it ever fired it would have shown the agent a green completion pill
  // for back-office work they take no part in. 2026-07-17.
  const getStatusColor = (status: string) => {
    if (!status) return theme.colors.textMuted;
    switch (status.toUpperCase()) {
      case 'ASSIGNED':
        return theme.colors.primary;
      case 'IN_PROGRESS':
        return theme.colors.warning;
      case 'SUBMITTED':
        return theme.colors.submitted;
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
      if (isMountedRef.current) {
        setIsActionLoading(false);
      }
    }
  };

  const handleFillForm = () => {
    // H21 (audit 2026-04-21): proper typing caught that task?.id can
    // be undefined. Guard so the navigate call is never made without
    // a real task id.
    if (!task?.id) return;
    navigation.navigate('VerificationForm', { taskId: task.id });
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
        // Re-queue failed items and sync.
        // B1 (audit 2026-04-21 round 2): column was `last_error`, not
        // `error` (schema renamed by C24). Previous `error = NULL`
        // raised "no such column" so the Resubmit button was a silent
        // no-op — caller's catch shows a generic Alert but nothing
        // ever got re-queued.
        await SyncEngineRepository.execute(
          "UPDATE sync_queue SET status = 'PENDING', last_error = NULL, attempts = 0 WHERE status = 'FAILED' AND (json_extract(payload_json, '$.localTaskId') = ? OR json_extract(payload_json, '$.taskId') = ?)",
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
        // 2026-07-17: this used to offer "Would you like to fill the form
        // again?" → navigate('VerificationForm'). That broke the owner's rule
        // outright: a field agent may NOT open or edit a submitted form — once
        // sent, it is the office's. It was also the only door into the form
        // editor for a submitted task; every legitimate entry is gated
        // (handleStartVisit → ASSIGNED, handleFillForm → IN_PROGRESS), and
        // TaskListScreen routes a submitted tap to this detail view instead.
        //
        // Nothing is FAILED. Captures may still be PENDING though — those are
        // not re-queued above (that query matches status='FAILED'), they just
        // need a sync to carry them up. Run one and re-check rather than
        // guessing.
        await SyncService.performSync();
        const stillMissing = await countUnuploadedEvidence(task.id);
        if (isMountedRef.current) {
          setUnuploadedEvidence(stillMissing);
        }
        if (stillMissing > 0) {
          Alert.alert(
            'Upload Incomplete',
            `${stillMissing} photo${
              stillMissing === 1 ? '' : 's'
            } still have not reached the server. They will keep retrying while you are online — the office cannot generate the report until they arrive.`,
          );
        } else {
          Alert.alert(
            'Already Submitted',
            'This task was submitted and the office has it. There is nothing on this device left to upload.',
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      Alert.alert('Error', msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    // M15 (audit 2026-04-21): layout-preview skeleton instead of a bare
    // spinner. Matches the eventual header/details/action card layout so
    // the shell doesn't shift when data arrives.
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <ScreenHeader title="Task Details" />
        <TaskDetailSkeleton />
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

  // Bug 111-cleanup (e2e 2026-05-09): extracted from inline-style block to
  // pass `react-native/no-inline-styles` ESLint rule (warning was flagged
  // on the previous inline conditional style array). Dynamic theme-driven
  // styles can't live in StyleSheet.create — declared here per-render and
  // passed via StyleSheet.flatten so the rule sees a variable, not a
  // literal object.
  const muteButtonDynamicStyle = {
    backgroundColor: isMuted ? `${theme.colors.warning}22` : 'transparent',
    borderColor: isMuted ? theme.colors.warning : theme.colors.border,
  };
  const muteLabelDynamicStyle = {
    color: isMuted ? theme.colors.warning : theme.colors.textMuted,
  };

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
              {task.verificationTaskNumber ||
                `Case #${task.caseNumber || task.caseId}`}
            </Text>
            <View style={styles.headerTopRight}>
              {muteTaskUuid && (
                <TouchableOpacity
                  onPress={handleToggleMute}
                  disabled={isMuteToggling}
                  style={StyleSheet.flatten([
                    styles.muteButton,
                    muteButtonDynamicStyle,
                  ])}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isMuted
                      ? 'Unmute notifications for this task'
                      : 'Mute notifications for this task'
                  }
                >
                  <Icon
                    name={
                      isMuted
                        ? 'notifications-off-outline'
                        : 'notifications-outline'
                    }
                    size={16}
                    color={
                      isMuted ? theme.colors.warning : theme.colors.textMuted
                    }
                  />
                  <Text
                    style={StyleSheet.flatten([
                      styles.muteButtonText,
                      muteLabelDynamicStyle,
                    ])}
                  >
                    {isMuted ? 'Muted' : 'Mute'}
                  </Text>
                </TouchableOpacity>
              )}
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getStatusColor(toFieldStatus(task.status)) },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: theme.colors.surface }]}
                >
                  {toFieldStatus(task.status).replace('_', ' ')}
                </Text>
              </View>
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
          <View
            style={[
              styles.sectionCard,
              styles.revokedBannerContainer,
              {
                backgroundColor: theme.colors.danger + '1A',
                borderLeftColor: theme.colors.danger,
              },
            ]}
          >
            <View style={styles.revokedBannerHeader}>
              <Icon
                name="alert-circle"
                size={24}
                color={theme.colors.danger}
                style={styles.icon}
              />
              <View style={styles.flex1}>
                <Text
                  style={[
                    styles.sectionTitle,
                    styles.revokedBannerTitle,
                    { color: theme.colors.danger },
                  ]}
                >
                  Task Revoked
                </Text>
                {task.revokeReason ? (
                  <Text
                    style={[
                      styles.detailValue,
                      styles.revokedBannerText,
                      { color: theme.colors.danger },
                    ]}
                  >
                    Reason: {task.revokeReason}
                  </Text>
                ) : null}
                {task.revokedByName ? (
                  <Text
                    style={[
                      styles.detailLabel,
                      styles.revokedBannerSubtext,
                      { color: theme.colors.danger },
                    ]}
                  >
                    By: {task.revokedByName}
                  </Text>
                ) : null}
                {task.revokedAt ? (
                  <Text
                    style={[
                      styles.detailLabel,
                      styles.revokedBannerSubtext,
                      { color: theme.colors.danger },
                    ]}
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
            <View style={styles.detailValueWrap}>
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
          {task.companyName ? (
            <View style={styles.detailRow}>
              <Icon
                name="business-outline"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.icon}
              />
              <View style={styles.detailValueWrap}>
                <Text
                  style={[
                    styles.detailLabel,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Company
                </Text>
                <Text
                  style={[styles.detailValue, { color: theme.colors.text }]}
                >
                  {task.companyName}
                </Text>
              </View>
            </View>
          ) : null}
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
            <View style={styles.detailRowStacked}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Verification Type
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.verificationTypeName || task.verificationType || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRowStacked}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Product
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.productName || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRowStacked}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Applicant Type
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.applicantType || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRowStacked}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Created By (Backend)
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.createdByBackendUser || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRowStacked}>
              <Text
                style={[styles.detailLabel, { color: theme.colors.textMuted }]}
              >
                Backend Contact
              </Text>
              <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                {task.backendContactNumber || 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRowStacked}>
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
                {formatTaskAddress(task)}
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

          {task.status === 'IN_PROGRESS' && (
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

          {/*
           * 2026-07-17: gate on the FIELD-terminal set, not `status ===
           * 'COMPLETED'`. The device never writes COMPLETED, so this block —
           * the sync banner AND the Resubmit button — was unreachable for the
           * whole submit-to-sign-off window, i.e. exactly when a DLQ'd
           * submission needs resubmitting. TaskCard shows the red "Pending
           * Upload" badge and points the agent here; this made that a dead end.
           */}
          {isFieldSubmitted(task.status) && (
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
              ) : unuploadedEvidence > 0 ? (
                /*
                 * 2026-07-17 (owner rule): the FORM landed but photos did not.
                 * Never call this "Submitted to Server" — the office has a
                 * partial case, and report generation / the web template / the
                 * reverse-geocode all fail on it. Say what is missing and leave
                 * Resubmit available to push the captures up.
                 */
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
                    {unuploadedEvidence} photo
                    {unuploadedEvidence === 1 ? '' : 's'} not uploaded
                  </Text>
                </View>
              ) : (
                /*
                 * 2026-07-17: no LOCAL submission row, and every capture has a
                 * server receipt. This used to render a grey "No Submission
                 * Found", which was simply untrue: we are inside
                 * isFieldSubmitted(task.status), so the SERVER told us this task
                 * is submitted (or the office has already completed it).
                 * `form_submissions` is a device-local OUTBOX —
                 * SyncDownloadService only ever DELETEs from it and never
                 * inserts — so it is empty for every task after a fresh
                 * install, a re-login, or a submit made on another device. An
                 * empty outbox means "this device has no pending upload", which
                 * is the same thing as done.
                 */
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
              )}

              {/*
               * Owner rule: "Resubmit only shows if any data is missing — fields
               * or photo capture."
               *
               * So: this device is holding a FORM that has not reached the
               * server, OR captures that have not (a synced form with stuck
               * photos leaves the office a partial case — the exact thing that
               * breaks the report/template/geocode downstream). Resubmit's
               * re-queue matches FAILED queue items by localTaskId, and the
               * ATTACHMENT payload carries it, so it pushes stuck photos too.
               *
               * NOT shown merely because `!submissionSync` — an empty local
               * outbox is the normal state after a fresh install or a submit
               * from another device. That arm offered Resubmit on work the
               * office already had (93 of this agent's 97 tasks) and, worse,
               * ended in an "open the form again" prompt.
               */}
              {((submissionSync && submissionSync.syncStatus !== 'SYNCED') ||
                unuploadedEvidence > 0) && (
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
  // M13 (audit 2026-04-21): danger-hex literals removed — the banner now
  // derives all four colours from `theme.colors.danger` (with alpha for the
  // tint) at render time so dark mode renders a legible banner.
  revokedBannerContainer: {
    borderLeftWidth: 4,
  },
  revokedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  revokedBannerTitle: {
    marginBottom: 4,
  },
  revokedBannerText: {},
  revokedBannerSubtext: {},
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  taskNumber: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flexShrink: 1,
  },
  headerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  muteButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
    maxWidth: '60%',
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
  // Stacked variant for label-above-value rows that hold long, free-form
  // values (notes, descriptions, full names). The standard `detailRow` is
  // a horizontal layout that overflowed for long values; this variant
  // gives the value the full row width to wrap naturally.
  detailRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  // Wrapper view inside `detailRow` (icon + label/value column) — the
  // column needs flex:1 so long values wrap inside the available width
  // instead of pushing past the card edge.
  detailValueWrap: {
    flex: 1,
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
