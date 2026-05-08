// API Endpoint Constants
// Maps to CRM-BACKEND/src/routes/mobile.ts routes

/**
 * All mobile API endpoints.
 * Base URL is configured in src/config/index.ts
 */
export const ENDPOINTS = {
  // Health
  HEALTH: '/health',

  // Authentication
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
  },

  // Tasks
  TASKS: {
    LIST: '/tasks',
    DETAIL: (taskId: string) => `/verification-tasks/${taskId}`,
    START: (taskId: string) => `/verification-tasks/${taskId}/start`,
    COMPLETE: (taskId: string) => `/verification-tasks/${taskId}/complete`,
    REVOKE: (taskId: string) => `/verification-tasks/${taskId}/revoke`,
    PRIORITY: (taskId: string) => `/verification-tasks/${taskId}/priority`,
    FORMS: (taskId: string) => `/verification-tasks/${taskId}/forms`,
  },

  // Attachments
  ATTACHMENTS: {
    UPLOAD: (taskId: string) => `/verification-tasks/${taskId}/attachments`,
    LIST: (taskId: string) => `/verification-tasks/${taskId}/attachments`,
    IMAGES: (taskId: string) =>
      `/verification-tasks/${taskId}/verification-images`,
    BATCH: '/cases/batch/attachments',
  },

  // Auto-save
  AUTO_SAVE: {
    SAVE: (taskId: string) => `/verification-tasks/${taskId}/auto-save`,
    GET: (taskId: string, formType: string) =>
      `/verification-tasks/${taskId}/auto-save/${formType}`,
  },

  // Form Submissions
  FORMS: {
    TEMPLATE: (formType: string) => `/forms/${formType}/template`,
    RESIDENCE: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/residence`,
    OFFICE: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/office`,
    BUSINESS: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/business`,
    RESIDENCE_CUM_OFFICE: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/residence-cum-office`,
    DSA_CONNECTOR: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/dsa-connector`,
    BUILDER: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/builder`,
    PROPERTY_INDIVIDUAL: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/property-individual`,
    PROPERTY_APF: (taskId: string) =>
      `/verification-tasks/${taskId}/verification/property-apf`,
    NOC: (taskId: string) => `/verification-tasks/${taskId}/verification/noc`,
  },

  // Location
  LOCATION: {
    CAPTURE: '/location/capture',
    TRAIL: '/location/trail',
    REVERSE_GEOCODE: '/location/reverse-geocode',
  },

  // Sync
  SYNC: {
    UPLOAD: '/sync/upload',
    DOWNLOAD: '/sync/download',
    STATUS: '/sync/status',
  },

  // F2.7.1: reference data hydrated by SyncDownloadService
  REFERENCE: {
    VERIFICATION_TYPE_OUTCOMES: '/reference/verification-type-outcomes',
  },

  // Notifications — all paths relative to apiBaseUrl (which includes /mobile)
  NOTIFICATIONS: {
    REGISTER: '/auth/notifications/register',
    LIST: '/notifications',
    MARK_READ: (notificationId: string) =>
      `/notifications/${notificationId}/read`,
    MARK_ALL_READ: '/notifications/mark-all-read',
    CLEAR_ALL: '/notifications',
    // T1.3 (Phase 1, 2026-05-08): per-row delete for multi-select UI.
    DELETE_ONE: (notificationId: string) => `/notifications/${notificationId}`,
    // Phase 3 Trash UI (2026-05-08): list soft-deleted notifications +
    // restore single / batch (server flips `is_deleted=false`).
    TRASH: '/notifications/trash',
    RESTORE_ONE: (notificationId: string) =>
      `/notifications/${notificationId}/restore`,
    RESTORE_BATCH: '/notifications/restore',
    // Phase 2.3 (2026-05-04): backend mounts preferences GET/PUT on
    // both /api/notifications/preferences AND
    // /api/mobile/notifications/preferences (same controller methods,
    // same auth). Mobile apiBaseUrl = `/api/mobile`, so a plain relative
    // path works.
    PREFERENCES: '/notifications/preferences',
    // Phase 3.2 (2026-05-04): WhatsApp-style mute. Mobile only mutes
    // by taskId (UUID is available locally as verification_task_id).
    // Case-level mute is web-only because mobile stores case_id as
    // integer display number, not UUID.
    MUTE: '/notifications/mute',
    UNMUTE_TASK: (taskId: string) => `/notifications/mute/task/${taskId}`,
    LIST_MUTES: '/notifications/mutes',
  },

  // Profile photo (field agent self-upload).
  // Backend mirror: POST /api/mobile/users/me/photo →
  // ProfilePhotoController.uploadForSelf.
  PROFILE: {
    UPLOAD_PHOTO: '/users/me/photo',
  },

  // Version
  VERSION: {
    CHECK: '/auth/version-check',
    CONFIG: '/auth/config',
  },

  // Telemetry
  TELEMETRY: {
    INGEST: '/telemetry/mobile/ingest',
  },
} as const;
