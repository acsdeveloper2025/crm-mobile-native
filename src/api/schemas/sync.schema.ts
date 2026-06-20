// Zod schemas for mobile sync payloads.
//
// Sync download is the single most dangerous contract drift point in the
// mobile app: bad rows flow straight into SQLite and corrupt the offline
// store for hours until the UI surfaces them as crashes. Validating the
// payload at the api-client boundary catches a rename or a new enum
// value the moment the backend ships it.
//
// Schemas are permissive-with-.passthrough(): only the stable identity/
// status fields are required, everything else optional, unknown keys
// accepted. The point is to catch hard breaks (id missing, cases not an
// array, etc.), not to mirror the MobileCaseResponse TS interface.

import { z } from 'zod';

// ADR-0054 Phase 1 (2026-06-20): the down-sync now ships the v2-native
// task shape. `id` (= case_tasks.id, the backend task UUID) and `caseId`
// (the case UUID) are the identity fields the downstream uses to key rows
// and foreign-join into the sync pipeline — a null or renamed value here
// is a hard-break that must be surfaced, not swallowed. Both are required;
// everything else is optional because the server omits fields it has no
// value for (status/updatedAt have safe downstream defaults). Running
// under non-strict `validateResponse`, so drift triggers a `Logger.warn`
// into telemetry without breaking a field agent mid-shift.
//
// The v1-only fields (verificationTaskId, verificationTaskNumber, title,
// description, addressStreet/City/State, isSaved, savedAt, syncStatus,
// attachments, verificationType, verificationTypeDetails) are GONE from
// the server payload and are intentionally NOT declared here — if the
// server ever re-sends one, `.passthrough()` lets it pass through silently
// (these are device-local concepts now). The new identity/display fields
// the app keys/renders on (taskNumber, caseNumber, verificationUnit,
// address, addressPincode) are declared so a rename fires the drift warn.
export const MobileCaseSchema = z
  .object({
    id: z.string().min(1),
    caseId: z.string().min(1),
    taskNumber: z.string().optional(),
    caseNumber: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    updatedAt: z.string().optional(),
    verificationUnit: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        name: z.string().optional(),
        code: z.string().optional(),
      })
      .passthrough()
      .optional(),
    address: z.string().optional(),
    addressPincode: z.string().optional(),
  })
  .passthrough();

/**
 * Full sync download response (ADR-0054 Phase 1, v2-native bare body —
 * NO `{ success, data }` wrapper). `tasks` is required because the sync
 * loop iterates it; every other field is optional.
 */
export const MobileSyncDownloadResponseSchema = z
  .object({
    tasks: z.array(MobileCaseSchema),
    revokedAssignmentIds: z.array(z.string()).optional(),
    syncTimestamp: z.string().optional(),
    hasMore: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
  })
  .passthrough();

export type MobileCaseDto = z.infer<typeof MobileCaseSchema>;
export type MobileSyncDownloadResponseDto = z.infer<
  typeof MobileSyncDownloadResponseSchema
>;

// --- Notifications -------------------------------------------------------
//
// The mobile notification list is small and iterated directly into SQLite
// via NotificationRepository.upsertBatch. A rename of `taskId` or the
// priority enum would silently null-out the UI badge. Keep the schema
// permissive — we only guard the fields SQLite-persists.

export const MobileNotificationSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    title: z.string().optional(),
    message: z.string().optional(),
    priority: z.string().optional(),
    isRead: z.boolean().optional(),
    taskId: z.string().nullable().optional(),
    // Phase 1.2e (2026-05-04): camelCase mirror of `task_number`. Backend
    // adds it via `camelizeRow` in CRM-BACKEND/src/utils/rowTransform.ts.
    taskNumber: z.string().nullable().optional(),
    caseNumber: z.union([z.string(), z.number()]).nullable().optional(),
    actionUrl: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const MobileNotificationListSchema = z.array(MobileNotificationSchema);

// --- Form templates ------------------------------------------------------
//
// The form template drives the entire data-capture UX. A drift in
// `sections` or `fields` corrupts the renderer for every verification
// started offline until the next fresh download. Only the outer shape is
// validated — field-level schemas vary by verification type.

export const MobileFormTemplateSchema = z
  .object({
    formType: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    sections: z.array(z.record(z.string(), z.unknown())).optional(),
    version: z.string().optional(),
  })
  .passthrough();

export type MobileNotificationDto = z.infer<typeof MobileNotificationSchema>;
export type MobileFormTemplateDto = z.infer<typeof MobileFormTemplateSchema>;

// --- Remote attachments --------------------------------------------------
//
// /verification-tasks/:id/attachments powers the "server-side uploads"
// list on the task detail screen. Drift here would break the attachment
// viewer without any user-facing error.

export const MobileAttachmentSchema = z
  .object({
    id: z.string(),
    filename: z.string().optional(),
    originalName: z.string().optional(),
    mimeType: z.string().optional(),
    size: z.union([z.number(), z.string()]).optional(),
    url: z.string().optional(),
    uploadedAt: z.string().optional(),
  })
  .passthrough();

export const MobileAttachmentListSchema = z.array(MobileAttachmentSchema);

// --- Auth refresh --------------------------------------------------------
//
// /auth/refresh is called silently in the 401 interceptor. A silent
// rename of accessToken would log the field agent out every five
// minutes, so we validate non-strict and let the shape warn in
// telemetry before it becomes a support ticket.

export const MobileRefreshResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    data: z
      .object({
        accessToken: z.string().min(1),
        refreshToken: z.string().optional(),
        expiresIn: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// --- Version check -------------------------------------------------------
//
// POST /mobile/version-check gates the whole app on force-update. If
// the backend renames forceUpdate the client silently drops to the
// default update policy (= no prompt), which is dangerous. Permissive
// shape, but the top-level success + forceUpdate are required.

export const MobileVersionCheckResponseSchema = z
  .object({
    success: z.boolean(),
    forceUpdate: z.boolean().optional(),
    updateRequired: z.boolean().optional(),
    latestVersion: z.string().optional(),
    releaseDate: z.string().optional(),
    urgent: z.boolean().optional(),
    size: z.string().optional(),
    releaseNotes: z.union([z.string(), z.array(z.string())]).optional(),
    features: z.array(z.string()).optional(),
    bugFixes: z.array(z.string()).optional(),
    downloadUrl: z.string().optional(),
  })
  .passthrough();

export type MobileAttachmentDto = z.infer<typeof MobileAttachmentSchema>;
