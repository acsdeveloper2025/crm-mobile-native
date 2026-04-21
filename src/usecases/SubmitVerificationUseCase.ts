import { v4 as uuidv4 } from 'uuid';
import { AttachmentRepository } from '../repositories/AttachmentRepository';
import { DatabaseService } from '../database/DatabaseService';
import { FormRepository } from '../repositories/FormRepository';
// LocationRepository removed — GPS comes from photo attachments only
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { TaskRepository } from '../repositories/TaskRepository';
import { SyncGateway } from '../services/SyncGateway';
import { AuthService } from '../services/AuthService';
// LocationService removed — no separate location capture needed
import { NetworkService } from '../services/NetworkService';
import { StorageService } from '../services/StorageService';
import { SyncService } from '../services/SyncService';
import type { GeoLocation, MobileFormSubmissionRequest } from '../types/api';
import type { LocalAttachment } from '../types/mobile';
import {
  resolveFormTypeKey,
  toBackendFormType as toBackendFormTypeKey,
  type FormTypeKey,
} from '../utils/formTypeKey';
import { ENDPOINTS } from '../api/endpoints';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORM_ENDPOINT_MAP: Record<FormTypeKey, (taskId: string) => string> = {
  residence: ENDPOINTS.FORMS.RESIDENCE,
  office: ENDPOINTS.FORMS.OFFICE,
  business: ENDPOINTS.FORMS.BUSINESS,
  'residence-cum-office': ENDPOINTS.FORMS.RESIDENCE_CUM_OFFICE,
  'dsa-connector': ENDPOINTS.FORMS.DSA_CONNECTOR,
  builder: ENDPOINTS.FORMS.BUILDER,
  'property-individual': ENDPOINTS.FORMS.PROPERTY_INDIVIDUAL,
  'property-apf': ENDPOINTS.FORMS.PROPERTY_APF,
  noc: ENDPOINTS.FORMS.NOC,
};

const parseFormData = (raw?: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const toSubmissionPhotoType = (
  componentType: LocalAttachment['componentType'],
): 'verification' | 'selfie' =>
  componentType === 'selfie' ? 'selfie' : 'verification';

const toAttachmentGeoLocation = (
  attachment: LocalAttachment,
): GeoLocation | null => {
  if (attachment.latitude == null || attachment.longitude == null) {
    return null;
  }
  return {
    latitude: attachment.latitude,
    longitude: attachment.longitude,
    accuracy: attachment.accuracy ?? 0,
    timestamp: attachment.locationTimestamp || attachment.uploadedAt,
  };
};

const resolveBackendTaskId = (
  taskId: string,
  verificationTaskId?: string | null,
): string => {
  if (verificationTaskId && UUID_REGEX.test(verificationTaskId.trim())) {
    return verificationTaskId.trim();
  }
  if (UUID_REGEX.test(taskId.trim())) {
    return taskId.trim();
  }
  throw new Error('Invalid task identifier');
};

export const SubmitVerificationUseCase = {
  async execute(input: {
    taskId: string;
    formType: string;
    formData: Record<string, unknown>;
    verificationOutcome?: string | null;
  }): Promise<void> {
    const task = await TaskRepository.getTaskById(input.taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const backendTaskId = resolveBackendTaskId(
      task.id,
      task.verificationTaskId,
    );
    const submissionId = uuidv4();
    const now = new Date().toISOString();
    const taskFormType = resolveFormTypeKey({
      formType: input.formType,
      verificationTypeCode: task.verificationTypeCode || null,
      verificationTypeName: task.verificationTypeName || null,
      verificationType: task.verificationType || null,
    });

    if (!taskFormType || !FORM_ENDPOINT_MAP[taskFormType]) {
      throw new Error(`Unsupported form type: ${input.formType}`);
    }

    const attachments = await AttachmentRepository.listForSubmission(task.id);
    const verificationPhotos = attachments.filter(
      attachment => attachment.componentType === 'photo',
    );
    const selfiePhotos = attachments.filter(
      attachment => attachment.componentType === 'selfie',
    );
    if (verificationPhotos.length < 5) {
      throw new Error(
        'At least 5 verification photos are required before submission.',
      );
    }
    if (selfiePhotos.length < 1) {
      throw new Error('At least 1 selfie is required before submission.');
    }

    const photos = attachments.map(attachment => {
      const geoLocation = toAttachmentGeoLocation(attachment);
      if (!geoLocation) {
        throw new Error(
          'All photos must include geo-location data before submission.',
        );
      }
      return {
        attachmentId: attachment.id,
        type: toSubmissionPhotoType(attachment.componentType),
        geoLocation,
        metadata: {
          fileSize: attachment.size,
          capturedAt: attachment.locationTimestamp || attachment.uploadedAt,
        },
      };
    });

    // Use GPS from captured photos — photos are the source of truth for location
    const latestGeoPhoto = attachments.find(
      a => a.latitude != null && a.longitude != null,
    );
    const geoLocation = latestGeoPhoto
      ? toAttachmentGeoLocation(latestGeoPhoto)!
      : { latitude: 0, longitude: 0, accuracy: 0, timestamp: now };

    const deviceInfo = await AuthService.getDeviceInfo();
    const backendFormType = toBackendFormTypeKey(
      taskFormType,
    ) as MobileFormSubmissionRequest['formType'];
    // Only send form field values — outcome and verificationType are sent as separate top-level fields
    const mergedFormData = { ...input.formData };
    const persistedFormData = {
      ...parseFormData(task.formDataJson),
      ...mergedFormData,
      __submission: {
        status: 'pending',
        error: null,
        updatedAt: now,
        submissionId,
      },
    };

    const submissionPayload: MobileFormSubmissionRequest &
      Record<string, unknown> = {
      submissionId,
      localTaskId: task.id,
      taskId: backendTaskId,
      visitId: backendTaskId,
      caseId: String(task.caseId),
      verificationTaskId: backendTaskId,
      formType: backendFormType,
      formData: mergedFormData,
      attachmentIds: attachments.map(attachment => attachment.id),
      geoLocation,
      photos,
      metadata: {
        submissionTimestamp: now,
        deviceInfo: {
          platform: deviceInfo.platform,
          model: deviceInfo.model,
          osVersion: deviceInfo.osVersion,
          appVersion: deviceInfo.appVersion,
        },
        networkInfo: { type: NetworkService.getConnectionType() },
        formVersion: '1.0',
        validationStatus: 'VALID',
        submissionAttempts: 1,
        isOfflineSubmission: true,
        totalImages: verificationPhotos.length,
        totalSelfies: selfiePhotos.length,
        verificationDate: now,
        formType: backendFormType,
      },
      verificationOutcome: input.verificationOutcome || undefined,
    };

    // Check storage quota BEFORE writing to DB to prevent orphaned forms
    const hasSpace = await StorageService.hasEnoughSpace(10);
    if (!hasSpace) {
      throw new Error(
        'Device storage is full. Please free up space before submitting the verification form.',
      );
    }

    // D7 (audit 2026-04-21 round 2): Pre-emptively run cleanup above
    // the transaction boundary. `SyncQueue.enqueue` (called inside the
    // transaction below) has its own `hasEnoughSpace(50)` check that
    // invokes `StorageService.cleanupSyncedData` when low — which
    // deletes both DB rows and disk files while the outer transaction
    // is open. If the outer transaction later fails, the DB row
    // DELETEs roll back but the RNFS.unlink calls don't, leaving
    // attachments rows pointing at non-existent files. Running the
    // cleanup first means by the time we enter the transaction,
    // `hasEnoughSpace(50)` is satisfied and the inner cleanup is a
    // no-op.
    const hasHeadroomForEnqueue = await StorageService.hasEnoughSpace(50);
    if (!hasHeadroomForEnqueue) {
      await StorageService.cleanupSyncedData(1);
    }

    // Wrap all DB writes + sync queue enqueue in a single transaction.
    // If any step fails, everything rolls back — no orphaned forms.
    await DatabaseService.transaction(async () => {
      await FormRepository.createSubmission({
        id: submissionId,
        taskId: task.id,
        caseId: String(task.caseId),
        formType: backendFormType,
        formData: mergedFormData,
        submittedAt: now,
      });

      await FormRepository.updateSubmissionPayload(
        submissionId,
        submissionPayload.metadata as unknown as Record<string, unknown>,
        submissionPayload.attachmentIds as string[],
        submissionPayload.photos as unknown[],
      );

      await TaskRepository.updateFormData(
        task.id,
        persistedFormData,
        task.status,
      );
      await TaskRepository.updateVerificationOutcome(
        task.id,
        input.verificationOutcome || null,
      );

      const pendingItems =
        await SyncQueueRepository.listPendingAttachmentQueueItems(
          task.id,
          backendTaskId,
        );
      for (const queueItem of pendingItems) {
        try {
          const payload = JSON.parse(queueItem.payloadJson) as Record<
            string,
            unknown
          >;
          const nextPayload = {
            ...payload,
            taskId: backendTaskId,
            localTaskId: task.id,
            submissionId,
            verificationType: payload.verificationType || backendFormType,
            photoType:
              payload.photoType ||
              ((payload.componentType as string | undefined) === 'selfie'
                ? 'selfie'
                : 'verification'),
          };
          await SyncQueueRepository.updatePayload(
            queueItem.id,
            JSON.stringify(nextPayload),
          );
        } catch {
          // best effort
        }
      }

      await SyncGateway.enqueueFormSubmission(submissionId, submissionPayload);
      // Don't delete autosave here — FormUploader deletes it only after successful backend sync
    });

    try {
      await SyncService.performSync();
    } catch {
      // local-first path already persisted
    }
  },
};
