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
  },

  // Sync
  SYNC: {
    ENTERPRISE: '/sync/enterprise',
    UPLOAD: '/sync/upload',
    DOWNLOAD: '/sync/download',
    STATUS: '/sync/status',
  },

  // Notifications — all paths relative to apiBaseUrl (which includes /mobile)
  NOTIFICATIONS: {
    REGISTER: '/auth/notifications/register',
    LIST: '/notifications',
    MARK_READ: (notificationId: string) =>
      `/notifications/${notificationId}/read`,
    MARK_ALL_READ: '/notifications/mark-all-read',
    CLEAR_ALL: '/notifications',
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
