// Zod schemas and sanitizers for Firebase Cloud Messaging payloads.
//
// M4/M5 (fresh medium audit): before this file, NotificationService
// trusted every field on `remoteMessage.data` — type, title, message,
// actionUrl, taskId — and piped them directly into SQLite + the UI.
// That's dangerous for three reasons:
//
//   1. FCM data payloads are strings-only by the FCM spec, but the
//      server can still ship surprising shapes during a contract drift
//      and the client has no shape check to catch it.
//   2. A compromised or intercepted push could set `actionUrl` to an
//      attacker-controlled https:// URL that subsequently drives
//      Linking.openURL / in-app webview navigation — an open redirect
//      leading straight to a phishing page pre-auth.
//   3. `type` and `priority` are unbounded strings → one typo on the
//      server (e.g. 'CASE_REASSIGN' vs 'CASE_REASSIGNED') flips the
//      client behavior without any runtime signal.
//
// The schema is deliberately strict on the few fields the notification
// handler actually reads and permissive about the rest (FCM includes
// metadata like google.c.* that we don't care about and shouldn't
// reject on). Unknown top-level keys are allowed via .passthrough();
// unknown ENUM VALUES on `type` fall back to SYSTEM_NOTIFICATION
// downstream, which is the correct safe default.

import { z } from 'zod';

/**
 * Allowed notification types. Anything else on the wire is coerced to
 * SYSTEM_NOTIFICATION by the handler so an unknown enum value never
 * drives unexpected navigation or sync behavior.
 */
export const FCM_NOTIFICATION_TYPES = [
  'CASE_ASSIGNED',
  'CASE_REASSIGNED',
  'CASE_REVOKED',
  'CASE_UPDATED',
  'CASE_COMPLETED',
  'SYSTEM_NOTIFICATION',
  'VERIFICATION_COMPLETED',
  'MESSAGE',
  'REMINDER',
] as const;

export const FCM_PRIORITIES = [
  'NORMAL',
  'HIGH',
  'URGENT',
  'MEDIUM',
  'LOW',
] as const;

/**
 * Data-payload schema. FCM guarantees strings on `data.*` but the
 * wrapper is JS so we tolerate undefined/null for missing keys.
 */
export const FcmDataSchema = z
  .object({
    type: z.string().optional(),
    notificationType: z.string().optional(),
    taskId: z.string().optional(),
    verificationTaskId: z.string().optional(),
    caseId: z.union([z.string(), z.number()]).optional(),
    caseNumber: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    message: z.string().optional(),
    body: z.string().optional(),
    priority: z.string().optional(),
    severity: z.string().optional(),
    actionUrl: z.string().optional(),
  })
  .passthrough();

/**
 * Notification-payload schema (the human-visible `notification` block
 * that FCM renders via the system tray when the app is backgrounded).
 */
export const FcmNotificationSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
  })
  .passthrough();

/**
 * Top-level RemoteMessage schema. Both data and notification are
 * optional because a push can carry one, the other, or both.
 */
export const FcmRemoteMessageSchema = z
  .object({
    data: FcmDataSchema.optional(),
    notification: FcmNotificationSchema.optional(),
    messageId: z.string().optional(),
    sentTime: z.number().optional(),
  })
  .passthrough();

export type FcmRemoteMessage = z.infer<typeof FcmRemoteMessageSchema>;
export type FcmData = z.infer<typeof FcmDataSchema>;

// --- actionUrl allowlist -------------------------------------------------
//
// Any URL that arrives via an FCM payload is untrusted. Before it can
// be persisted as a notification.actionUrl (and therefore before it
// can drive in-app navigation or Linking.openURL), it must match one
// of these patterns:
//
//   1. crmapp:// custom scheme (for deep links into our own app)
//   2. https://crm.allcheckservices.com/* (our production web host,
//      in case a notification wants to hand off to the web app)
//
// Everything else — raw http://, https:// to another host, app-to-app
// schemes like tel:/mailto:/javascript:, relative paths — is rejected
// by returning null, and the notification is still delivered with
// actionUrl omitted. Fail-open on the notification itself, fail-closed
// on the destination.

const ALLOWED_WEB_HOSTS = new Set<string>(['crm.allcheckservices.com']);
const ALLOWED_APP_SCHEMES = new Set<string>(['crmapp']);

/**
 * Return the input URL if it is on the allowlist; otherwise null.
 * Callers should treat null as "drop this field" rather than "fail
 * the notification".
 */
export function sanitizeFcmActionUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // Custom app scheme — match scheme only, ignore host.
  // URL parses `crmapp://task/123` with protocol `crmapp:`.
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (ALLOWED_APP_SCHEMES.has(scheme)) {
    return raw;
  }

  // Web URL — must be https and on the allowlist host.
  if (scheme === 'https' && ALLOWED_WEB_HOSTS.has(parsed.host.toLowerCase())) {
    return raw;
  }

  return null;
}

/**
 * Normalize a `type` field from FCM data. Returns one of the known
 * types if the input matches, otherwise `SYSTEM_NOTIFICATION` so
 * handler logic never branches on an attacker-supplied enum value.
 */
export function normalizeFcmType(
  raw: unknown,
): (typeof FCM_NOTIFICATION_TYPES)[number] {
  if (typeof raw !== 'string') {
    return 'SYSTEM_NOTIFICATION';
  }
  const upper = raw.toUpperCase();
  return (FCM_NOTIFICATION_TYPES as readonly string[]).includes(upper)
    ? (upper as (typeof FCM_NOTIFICATION_TYPES)[number])
    : 'SYSTEM_NOTIFICATION';
}
