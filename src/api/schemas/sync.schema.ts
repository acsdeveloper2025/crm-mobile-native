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
