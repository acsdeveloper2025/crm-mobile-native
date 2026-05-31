# Photo Capture — Device Validation Checklist

On-device validation for the photo-capture optimization (native hash, conditional
normalize, raw-photo + auto-save). Run on **physical devices** — emulators do not
reproduce real camera EXIF orientation, fused GPS, or low-RAM behavior.

Pairs with `PHOTO_CAPTURE_ARCHITECTURE.md`. Last updated 2026-05-31.

## How to read results
- A photo is "correct" when, on the **web** case view, it renders **upright, full-frame
  (not cropped), with the metadata/address overlay**, and `hash_verified = true` in
  `verification_attachments`.
- "No regression" = behaves the same as before this initiative.
- Capture timing: optionally enable a dev build with `performance.now()` markers around
  each `savePhoto` stage; otherwise judge "feels instant / acceptable / laggy".

## Devices (cover the matrix)
| Slot | Target | Why |
|---|---|---|
| D1 | 3GB-RAM Android (e.g. Galaxy A-series) | OOM / decode pressure, slow CPU |
| D2 | 4GB-RAM mid-tier Android | mainstream baseline |
| D3 | Different OEM than D1/D2 (OnePlus / Xiaomi / Samsung) | EXIF-orientation + fused-GPS variance |
| D4 | (optional) iOS device | platform parity (RNFS.hash, PhotoFile dims) |

---

## A. Camera + capture matrix

| # | Scenario | Steps | Expected |
|---|---|---|---|
| A1 | Rear camera, portrait | Open task → Add photo → hold portrait → shutter | Saves, returns to gallery, thumbnail upright; web upright + full-frame |
| A2 | Rear camera, landscape | Hold landscape → shutter | Web shows **full landscape frame, not cropped**; overlay aligned |
| A3 | Front camera (selfie), portrait | Add selfie → shutter | Saves as `selfie`; upright; not mirrored-wrong on web |
| A4 | Front camera, landscape | landscape selfie → shutter | Full frame, upright |
| A5 | Rapid multiple captures | Take 6 photos back-to-back | All 6 saved, 6 distinct thumbnails, no dup, no crash, counts correct |
| A6 | Per-task cap | Capture until 20 | 21st blocked with "Maximum 20 photos" message |
| A7 | Retake via delete | Capture → 🗑 a thumbnail → confirm → recapture | Photo removed (file+row), new one saved; min-count updates |

## B. GPS

| # | Scenario | Steps | Expected |
|---|---|---|---|
| B1 | GPS available (outdoor) | Capture with good signal | Photo has lat/lng; web overlay shows coords + resolved address |
| B2 | GPS warm (framing delay) | Open camera, wait ~3s framing, shutter | Save is instant (warm fix), no "acquiring GPS" stall |
| B3 | GPS unavailable / denied | Revoke location perm → capture | `GPS_REQUIRED` error surfaced; **no photo saved** (file rolled back); no empty row |
| B4 | GPS cold start indoors | Force-stop, reopen indoors, capture quickly | Either warm fix lands, or ≤2s fallback; if truly none → GPS_REQUIRED, not a silent GPS-less save |

## C. Image processing (the optimization)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| C1 | Conditional skip (landscape-upright) | Capture landscape-held photo | Saved upright; web full-frame; (dev log: "Normalize skipped") |
| C2 | Normalize path (portrait) | Capture portrait photo | Web upright (rotation baked); (dev log: normalize ran, no skip) |
| C3 | Oversized fallback | If any device captures > 1920px edge | Downscaled to ≤1920, aspect preserved, upright |
| C4 | Thumbnail | Inspect gallery + web | Thumbnail present, correct orientation, matches full image |
| C5 | Quality | Eyeball a doorplate/nameplate/document capture | Text legible at 1080p/q85 |

## D. Hash / evidence integrity

| # | Scenario | Steps | Expected |
|---|---|---|---|
| D1 | Hash present | Capture → upload → check `verification_attachments` row | `sha256_hash` (client) = 64 hex; `server_sha256_hash` set |
| D2 | hash_verified = true | Same row | `hash_verified = true` (client == server) for BOTH skip-path (C1) and normalize-path (C2) photos |
| D3 | Skip-path integrity (critical) | Upload a C1 (skipped) photo | `hash_verified = true` — confirms saved bytes == uploaded bytes after EXIF strip |
| D4 | Native hash sanity | Capture a photo, note client hash | Matches a `sha256sum` of the downloaded file (after server-side EXIF handling parity) |

## E. Offline-first

| # | Scenario | Steps | Expected |
|---|---|---|---|
| E1 | Offline capture | Airplane mode → capture 3 | All saved locally, queued, visible in gallery |
| E2 | Online drain | Restore network | Queue uploads all 3; no dup; `hash_verified=true` each |
| E3 | Kill mid-capture | Capture, force-stop app immediately after shutter | On relaunch: either the photo is present + queued, or absent (temp only) — **never** an orphan row or a half-written file shown |
| E4 | Low storage | Fill device < 50MB free → capture | "Device storage is full…" message; no partial/corrupt save |
| E5 | Retry idempotency | Toggle network during an upload | No duplicate server row (Idempotency-Key holds) |

## F. Regression guards (must NOT have changed)

| # | Check | Expected |
|---|---|---|
| F1 | No Save/Preview screen | Shutter → straight back to gallery (1 tap) |
| F2 | No watermark burned on image | Stored JPEG has no baked text; web overlay supplies metadata |
| F3 | Min-photo rule | Submit blocked until ≥5 photos + 1 selfie |
| F4 | Sync unchanged | Same `/verification-tasks/:id/attachments` endpoint, same queue behavior |
| F5 | Address freeze | Web address resolves once, stays frozen on reload |

---

## Sign-off
- [ ] A1–A7 pass on D1, D2, D3
- [ ] B1–B4 pass
- [ ] C1–C5 pass (esp. C1 landscape full-frame + C2 portrait upright)
- [ ] D1–D4 pass (esp. **D3** skip-path hash_verified)
- [ ] E1–E5 pass
- [ ] F1–F5 no regression
- [ ] (optional) capture timing recorded on D1 (3GB) before/after

**Blocking criteria:** any failure in **B3** (GPS-less save), **D2/D3** (hash_verified false),
**E3** (orphan/half-state), or **A2** (landscape crop) blocks release.
