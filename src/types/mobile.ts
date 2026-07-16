// Local database model types
// These represent data as stored in SQLite, not as sent/received over the API

export interface LocalTask {
  id: string; // UUID - primary key
  // ADR-0054 Phase 1: caseId now holds the case UUID (string). The
  // user-facing case display number moved to caseNumber. Typed as
  // string | number for back-compat with pre-upgrade rows whose case_id
  // column still held the numeric display value until the next sync.
  caseId: string | number; // case UUID (post-ADR-0054)
  caseNumber?: string; // user-facing case display number (was caseId)
  verificationTaskId: string; // Backend verification task UUID
  verificationTaskNumber: string; // e.g., VT-000127
  title: string;
  description: string;
  customerName: string;
  customerCallingCode?: string;
  customerPhone?: string;
  customerEmail?: string;
  companyName?: string; // Applicant's employer/company (v2 sync, optional)
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressPincode: string;
  latitude?: number;
  longitude?: number;
  status: string; // TaskStatus enum value
  priority: string;
  assignedAt: string; // ISO timestamp
  updatedAt: string;
  completedAt?: string;
  notes?: string;
  verificationType?: string;
  verificationOutcome?: string;
  applicantType?: string;
  backendContactNumber?: string;
  createdByBackendUser?: string;
  assignedToFieldUser?: string;

  // Denormalized client/product info
  clientId: number;
  clientName: string;
  clientCode: string;
  productId?: number;
  productName?: string;
  productCode?: string;
  verificationTypeId?: number;
  verificationTypeName?: string;
  verificationTypeCode?: string;

  formDataJson?: string; // JSON blob of form data

  // Revoke tracking
  isRevoked?: number; // 0 or 1
  revokedAt?: string;
  revokedByName?: string;
  revokeReason?: string;

  // Status timestamps
  inProgressAt?: string;
  savedAt?: string;
  isSaved?: number; // 0 or 1
  attachmentCount?: number;

  // Local sync tracking
  syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT';
  lastSyncedAt?: string;
  localUpdatedAt: string; // When this record was last modified locally
}

export interface LocalAttachment {
  id: string; // UUID
  taskId: string; // References LocalTask.id
  backendAttachmentId?: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  localPath: string; // Path on device filesystem
  remotePath?: string; // Server URL once synced
  thumbnailPath?: string;
  uploadedAt: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationTimestamp?: string;
  componentType: 'photo' | 'selfie';

  // Sync tracking.
  // 2026-07-17: this said 'PENDING' | 'UPLOADING' | 'SYNCED' | 'FAILED', which
  // was wrong at both ends — verified by enumerating every writer of
  // attachments.sync_status. UPLOADING and FAILED are NEVER written to an
  // attachment (FormRepository's FAILED is form_submissions, a different
  // table), and SKIPPED — the one status that means "not evidence", set by
  // AttachmentUploader when the file is missing from disk — was missing
  // entirely, so the type omitted the only value the countability rule turns
  // on. ABANDONED is legacy: SyncDownloadService now DELETEs pending children
  // on revoke instead of marking them, but old rows may still carry it.
  syncStatus: 'PENDING' | 'SYNCED' | 'SKIPPED' | 'ABANDONED';
  syncAttempts: number;
  lastSyncAttemptAt?: string;
  syncError?: string;
}

/**
 * Backend attachment type used by AttachmentService for remote attachments.
 * Previously in web_types.ts — consolidated here as the single source of truth.
 */
export interface Attachment {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  mimeType: string;
  size: number;
  url: string;
  localEncryptedPath?: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  taskId?: string;
  formSubmissionId?: string;
  localPath?: string;
  description?: string;
}

export interface LocalLocation {
  id: string; // UUID
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string; // ISO timestamp
  source: 'GPS' | 'NETWORK' | 'PASSIVE';
  taskId?: string;
  activityType?: 'CASE_START' | 'CASE_PROGRESS' | 'CASE_COMPLETE' | 'TRAVEL';

  // Sync tracking
  syncStatus: 'PENDING' | 'SYNCED';
  syncedAt?: string;
}

export interface LocalFormSubmission {
  id: string; // UUID
  taskId: string;
  caseId: string;
  formType: string;
  formDataJson: string; // JSON blob
  status: 'DRAFT' | 'SUBMITTED_LOCALLY' | 'SYNCED' | 'FAILED';
  submittedAt: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationTimestamp?: string;
  locationAddress?: string;
  metadataJson: string; // JSON blob of FormMetadata
  attachmentIdsJson: string; // JSON array of attachment IDs
  photoDataJson: string; // JSON array of photo metadata

  // Sync tracking
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  syncAttempts: number;
  lastSyncAttemptAt?: string;
  syncError?: string;
}

export interface SyncQueueItem {
  id: string; // UUID
  actionType: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType:
    | 'TASK'
    | 'TASK_STATUS'
    | 'ATTACHMENT'
    | 'VISIT_PHOTO'
    | 'LOCATION'
    | 'FORM_SUBMISSION'
    | 'NOTIFICATION_ACTION'
    | 'PROFILE_PHOTO';
  entityId: string;
  payloadJson: string; // JSON blob of the data to sync
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  priority: number; // Legacy queue priority; processor applies operation-based priority ordering
  createdAt: string;
  processedAt?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  nextRetryAt?: string;
}

export interface SyncMetadata {
  id: number; // Always 1 - singleton row
  lastDownloadSyncAt?: string;
  lastUploadSyncAt?: string;
  // `lastFullSyncAt` dropped with DB_VERSION 12 — no writer ever existed.
  syncInProgress: boolean;
  deviceId: string;
}
