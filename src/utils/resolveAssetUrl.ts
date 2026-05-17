import { config } from '../config';

// Mirrors CRM-FRONTEND/src/utils/assetUrl.ts but for mobile.
// Backend serves uploaded files at <origin>/uploads/... (where <origin> is
// the host without the /api or /api/mobile path suffix). DB columns like
// users.profile_photo_url store these as RELATIVE URLs starting with
// /uploads/, so they must be absolutized before React Native's <Image>
// can load them as network images.
//
// After the T0-2 audit fix (2026-05-17), /uploads/ requires Authorization
// header — see AuthedImage for the consumer that attaches it.
export function resolveAssetUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('file://')) return url;

  // Compute origin by stripping trailing /api[/...] from configured base
  const base = config.apiBaseUrl || '';
  let origin = base;
  const apiIndex = origin.lastIndexOf('/api');
  if (apiIndex > 0) {
    origin = origin.substring(0, apiIndex);
  }
  // Strip trailing slash on origin, ensure leading slash on path
  origin = origin.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${origin}${path}`;
}
