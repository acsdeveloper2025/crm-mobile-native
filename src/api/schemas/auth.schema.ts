// Zod schemas for mobile auth endpoints.
//
// The mobile login response is the first thing the app touches after
// install — if the contract drifts here, every subsequent API call will
// fail in confusing ways. This schema is strict enough to catch a
// missing token field but lenient on user-profile fields that tend to
// grow over time (new role metadata, new territory columns, etc.).

import { z } from 'zod';

/** User profile as returned by `/auth/login` and `/auth/me`. */
export const MobileUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    username: z.string().min(1),
    email: z.string().optional().nullable(),
    role: z.string(),
    employeeId: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    profilePhotoUrl: z.string().optional().nullable(),
  })
  // Accept additional fields without warning — mobile only uses the
  // subset above and new fields from the backend (permissions,
  // assignedPincodes, etc.) are forwarded through downstream services.
  .passthrough();

export type MobileUserDto = z.infer<typeof MobileUserSchema>;

/** Login response envelope. */
export const MobileLoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z
    .object({
      user: MobileUserSchema,
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
      expiresIn: z.number().optional(),
    })
    .passthrough(),
});

export type MobileLoginResponseDto = z.infer<typeof MobileLoginResponseSchema>;
