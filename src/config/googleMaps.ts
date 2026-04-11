// Single source of truth for the Google Maps API key used by the
// mobile app for reverse geocoding.
//
// M7 (fresh medium audit): the key was previously embedded as a
// string literal inside LocationService.getAddressFromCoordinates
// — mixed into business logic, so every rotation required hunting
// through a 600-line service file and there was no single place to
// add telemetry, quota alerts, or a proxy migration shim.
//
// This module is the ONLY place the key should live client-side.
// Rotation steps:
//   1. Rotate the key in the Google Cloud console.
//   2. Update the value below.
//   3. Ship a release (staged rollout recommended — old builds stop
//      being able to reverse-geocode when the old key is revoked).
//
// Note on exposure: any key shipped inside a mobile binary is
// extractable via standard APK / IPA teardown. Google's Android/iOS
// key restrictions (package name + SHA-1 for Android, bundle id for
// iOS) are the only thing standing between a leaked key and
// quota-exhaustion abuse. Verify those restrictions are configured
// in the Google Cloud console before assuming this file is safe.
//
// TODO(M7): proxy the reverse-geocode call through the backend
// (POST /api/mobile/geocode/reverse { lat, lon }) so the key never
// leaves the server. That is the permanent fix; this module only
// centralizes the current state so the migration is a one-import
// swap.

export const GOOGLE_GEOCODING_API_KEY =
  'AIzaSyDjCfPbgYjzM8XyzJxQp9MVDdNj-i7FOTE';
