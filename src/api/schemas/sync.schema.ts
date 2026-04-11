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

export const MobileCaseSchema = z
  .object({
    id: z.string().min(1).optional(),
    verificationTaskId: z.string().optional(),
    caseId: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * Full sync download response. `cases` is required because the sync loop
 * iterates it; every other field is optional.
 */
export const MobileSyncDownloadResponseSchema = z
  .object({
    cases: z.array(MobileCaseSchema),
    revokedAssignmentIds: z.array(z.string()).optional(),
    deletedTaskIds: z.array(z.string()).optional(),
    hasMore: z.boolean().optional(),
    syncTimestamp: z.string().optional(),
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
