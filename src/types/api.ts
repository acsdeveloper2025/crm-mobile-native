// API Types - Mirrors CRM-BACKEND/src/types/mobile.ts
// These types match the exact request/response formats of the backend API

export enum RevokeReason {
  NotMyArea = 'Not my area',
  WrongPincode = 'Wrong pincode',
  NotWorking = 'Not working',
  LeftArea = 'Left area',
  WrongAddress = 'Wrong/incomplete address',
}

export interface MobileDeviceInfo {
  deviceId: string;
  platform: 'IOS' | 'ANDROID';
  model: string;
  osVersion: string;
  appVersion: string;
  pushToken?: string;
  lastActiveAt?: string;
}

export interface MobileLoginRequest {
  username: string;
  password: string;
  deviceId: string;
  deviceInfo?: Partial<MobileDeviceInfo>;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  employeeId: string;
  // 2026-04-28 F1.1.2: nullable — derived from designations FK on backend.
  designation: string | null;
  // 2026-04-28 F1.1.3: nullable — derived from departments FK on backend.
  department: string | null;
  profilePhotoUrl?: string;
  assignedPincodes?: number[];
  assignedAreas?: number[];
}

export interface MobileLoginResponse {
  success: boolean;
  message: string;
  data?: {
    user: UserProfile;
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  };
}

export interface MobileCaseListRequest {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  assignedTo?: string;
  priority?: number;
  dateFrom?: string;
  dateTo?: string;
  lastSyncTimestamp?: string;
}

// ADR-0054 Phase 1 (2026-06-20): the down-sync task shape served by
// `/api/v2/sync/download` is now v2-native. Renames vs the old v1 shape:
//   verificationTaskId            -> id            (now the backend task UUID)
//   verificationTaskNumber, title -> taskNumber
//   caseId (number)               -> caseId (uuid string) + caseNumber (display)
//   addressStreet                 -> address
//   verificationType /
//     verificationTypeDetails     -> verificationUnit { id, name, code }
// REMOVED entirely (server no longer sends): description, addressCity,
//   addressState, isSaved, savedAt, syncStatus, attachments. These are
//   device-local concerns now and live only in SQLite with default values.
export interface MobileCaseResponse {
  id: string; // backend task UUID (case_tasks.id) — the row identity
  taskNumber?: string; // e.g. VT-000127 (was verificationTaskNumber/title)
  caseId: string; // case UUID
  caseNumber?: string | number; // user-facing case display number
  customerName: string;
  customerCallingCode?: string;
  customerPhone?: string;
  // v2 sync: targeted applicant's employer/company name. Only present
  // when the backend has one for the case — most cases omit it.
  companyName?: string;
  applicantType?: string;
  address?: string; // full single-line address (was addressStreet)
  addressPincode?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  priority: string;
  verificationUnit?: {
    id: string | number;
    name: string;
    code?: string;
  };
  notes?: string;
  assignedAt: string;
  updatedAt: string;
  inProgressAt?: string;
  submittedAt?: string;
  completedAt?: string;
  verificationOutcome?: string;
  formData?: Record<string, unknown>;
  backendContactNumber?: string;
  createdByBackendUser?: string;
  assignedToFieldUser?: string;
  // Revoke tracking
  isRevoked?: boolean;
  revokedAt?: string;
  revokeReason?: string;
  revokedByName?: string;
  attachmentCount?: number;
  client: {
    id: number;
    name: string;
    code: string;
  };
  product?: {
    id: number;
    name: string;
    code?: string;
  };
}

export interface MobileAttachmentResponse {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
  };
  base64Data?: string;
  checksum?: string;
}

export interface MobileFileUploadRequest {
  caseId: string;
  files: unknown[];
  geoLocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
  };
}

export type FormType =
  | 'RESIDENCE'
  | 'OFFICE'
  | 'BUSINESS'
  | 'BUILDER'
  | 'RESIDENCE_CUM_OFFICE'
  | 'DSA_CONNECTOR'
  | 'PROPERTY_INDIVIDUAL'
  | 'PROPERTY_APF'
  | 'NOC';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  address?: string;
}

export interface MobileFormSubmissionRequest {
  caseId: string;
  verificationTaskId: string;
  formType: FormType;
  formData: {
    [key: string]: unknown;
    outcome?: string;
    finalStatus?: string;
    verificationType?: string;
  };
  attachmentIds: string[];
  geoLocation: GeoLocation;
  photos: {
    attachmentId: string;
    type: 'verification' | 'selfie';
    geoLocation: GeoLocation;
    metadata?: {
      fileSize: number;
      dimensions?: { width: number; height: number };
      capturedAt: string;
    };
  }[];
  metadata: FormMetadata;
  images?: {
    dataUrl: string;
    type: 'verification' | 'selfie';
    geoLocation?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      timestamp?: string;
    };
  }[];
}

export interface FormMetadata {
  submissionTimestamp: string;
  deviceInfo: {
    platform: 'IOS' | 'ANDROID';
    model: string;
    osVersion: string;
    appVersion: string;
  };
  networkInfo: {
    type: 'WIFI' | 'CELLULAR' | 'OFFLINE';
    strength?: number;
  };
  formVersion: string;
  validationStatus?: 'VALID' | 'INVALID' | 'WARNING';
  validationErrors?: string[];
  submissionAttempts: number;
  isOfflineSubmission: boolean;
  syncedAt?: string;
  totalImages?: number;
  totalSelfies?: number;
  verificationDate?: string;
  formType?: string;
}

export interface MobileLocationCaptureRequest {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  source: 'GPS' | 'NETWORK' | 'PASSIVE' | 'TRACKING';
  caseId?: string;
  taskId?: string;
  activityType?: 'CASE_START' | 'CASE_PROGRESS' | 'CASE_COMPLETE' | 'TRAVEL';
}

export interface MobileSyncUploadRequest {
  localChanges: {
    cases: {
      id: string;
      action: 'CREATE' | 'UPDATE' | 'DELETE';
      data: Record<string, unknown>;
      timestamp: string;
    }[];
    attachments: {
      id: string;
      action: 'CREATE' | 'DELETE';
      data: Record<string, unknown>;
      timestamp: string;
    }[];
    locations: {
      id: string;
      data: MobileLocationCaptureRequest;
      timestamp: string;
    }[];
  };
  deviceInfo: MobileDeviceInfo;
  lastSyncTimestamp: string;
}

// ADR-0054 Phase 1 (2026-06-20): the down-sync response body is now BARE
// (no `{ success, message, data }` wrapper) and v2-native:
//   { tasks, revokedAssignmentIds, syncTimestamp, hasMore, nextCursor }
// The old `cases`/`changes` arrays and the `deletedTaskIds`/`deletedCaseIds`/
// `conflicts`/`attachmentChanges` fields are gone — server-side deletes now
// flow only through `revokedAssignmentIds`.
export interface MobileSyncDownloadResponse {
  tasks: MobileCaseResponse[];
  revokedAssignmentIds: string[];
  syncTimestamp: string;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface MobileAppConfigResponse {
  apiVersion: string;
  minSupportedVersion: string;
  forceUpdateVersion: string;
  features: {
    offlineMode: boolean;
    backgroundSync: boolean;
    // Phase E4: biometricAuth removed — never implemented on this
    // client. If re-added it must be behind a real
    // react-native-biometrics integration, not a config flag.
    darkMode: boolean;
    analytics: boolean;
  };
  limits: {
    maxFileSize: number;
    maxFilesPerCase: number;
    locationAccuracyThreshold: number;
    syncBatchSize: number;
  };
  /**
   * Phase E1: SSL pinning kill switch served by the backend. The
   * mobile app caches this and consults it on every request — when
   * `enabled` is false the native pinning layer (Android
   * network_security_config.xml / iOS ATS) falls through to stock
   * TLS so a rotated cert that slipped through the overlap window
   * does not brick the app in the field. `pinSha256s` is a set of
   * public-key SHA256 fingerprints; matching any one is a pass.
   */
  pinning?: {
    enabled: boolean;
    pinSha256s: string[];
  };
  endpoints: {
    apiBaseUrl: string;
    wsUrl: string;
  };
}

export interface MobileErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
  retryable?: boolean;
  retryAfter?: number;
}

export interface MobileVersionCheckRequest {
  currentVersion: string;
  platform: 'IOS' | 'ANDROID' | 'WEB';
  buildNumber?: string;
}

export interface MobileVersionCheckResponse {
  success: boolean;
  updateRequired: boolean;
  forceUpdate: boolean;
  urgent?: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  features: string[];
  bugFixes?: string[];
  size?: string;
  releaseDate?: string;
  buildNumber?: string;
  checkTimestamp: string;
}

// ------------------------------------------------------------------
// Dynamic Forms Template Types
// ------------------------------------------------------------------
export interface FormFieldCondition {
  field: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'greaterThan'
    | 'lessThan'
    | 'in'
    | 'notIn'
    | 'isTruthy'
    | 'isFalsy';
  value?: unknown;
}

export interface FormFieldTemplate {
  id: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'multiselect'
    | 'date'
    | 'boolean'
    | 'textarea'
    | 'checkbox'
    | 'radio'
    | 'file';
  name: string;
  order: number;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    custom?: string;
  };
  conditional?: FormFieldCondition | FormFieldCondition[];
  requiredWhen?: FormFieldCondition | FormFieldCondition[];
}

export interface FormSectionTemplate {
  id: string;
  title: string;
  description?: string;
  order: number;
  fields: FormFieldTemplate[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
  conditional?: FormFieldTemplate['conditional'];
}

export interface FormTemplate {
  id: string;
  formType: string;
  verificationType: string;
  outcome: string;
  name: string;
  description: string;
  sections: FormSectionTemplate[];
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
