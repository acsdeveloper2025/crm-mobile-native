# Photo Capture Architecture (Reference)

Reference architecture for the FI/RCU field-verification photo capture pipeline.
Use this as the baseline for future audits. Last updated 2026-05-31.

> Scope: verification photos + selfies (same code path; selfie = front camera +
> `componentType='selfie'`). KYC photos reuse the verification path. Profile
> photos are a separate flow (no GPS/watermark/evidence) and are out of scope.

---

## 1. Components

| Layer | File | Role |
|---|---|---|
| Capture UI | `src/components/media/CameraCaptureScreen.tsx` | vision-camera preview, shutter, **warm GPS watch**, auto-save, return |
| Save pipeline | `src/services/CameraService.ts` | validate → normalize/skip → thumbnail → hash → DB+queue (atomic) |
| Hash | `src/utils/fileHash.ts` | native `RNFS.hash(path,'sha256')` |
| Local store | `src/repositories/AttachmentRepository.ts` + SQLite `attachments` (SQLCipher) | row + paths + `client_sha256` |
| Sync | `src/services/SyncGateway.ts` → `sync_queue` → `src/sync/uploaders/AttachmentUploader.ts` | EXIF strip → multipart upload, idempotent |
| Gallery | `src/components/media/PhotoGallery.tsx` | thumbnails, per-photo delete (= retake) |
| Backend ingest | `CRM-BACKEND/src/controllers/verificationAttachmentController.ts` | server SHA-256 (primary, §65B), `hash_verified`, `verification_attachments` row, object storage |
| Web display | `CRM-FRONTEND/src/components/verification-tasks/VerificationImages.tsx` | metadata/address overlay from stored GPS at view time |

**Invariants (do not regress):**
- GPS is mandatory on every photo (`savePhoto` throws `GPS_REQUIRED`, rolls back the file).
- Auto-save only — no Save button, no preview/confirm screen.
- No on-device watermark; no Google key in the APK; address overlay is web-side.
- Photo file + DB row + sync-queue entry are written in one atomic transaction **before** returning.
- Saved bytes == uploaded bytes (so the client capture-time hash matches the server re-hash).

---

## 2. Current workflow (end to end)

```
Field Executive
  │  taps "Add photo" / "Add selfie" on VerificationFormScreen
  ▼
CameraCaptureScreen  ── on focus: request camera perm → start WARM GPS watch
  │                     (Geolocation.watchPosition, high-accuracy, keeps best fix)
  │  taps shutter
  ▼
takePhoto (1080p, qualityPrioritization:'balanced')  → temp JPEG (+ width/height)
  ▼
CameraService.savePhoto(path, taskId, type, {captureWidth, captureHeight, locationOverride})
  │
  ├─ GPS VALIDATION   warm fix (instant) else getCurrentLocation (≤2s) ; null → throw GPS_REQUIRED + rollback
  ├─ disk-space check (≥50MB) ; per-task cap (≤20)
  ├─ moveFile temp → /photos
  ├─ IMAGE PROCESSING  normalizeCapturedImage():
  │      in-bound (≤1920) AND upright (EXIF orient 1/none) AND jpeg?
  │         → trySkipNormalize(): strip EXIF in place (1 read+write, NO DECODE)   [Phase 3]
  │      else → normalizeWithResizer(): decode + bake orientation + downscale (aspect kept)
  ├─ THUMBNAIL  createThumbnail(finalFile) 240px  (from normalized output)        [Phase 2]
  ├─ SHA256  sha256OfFile() = native RNFS.hash(path,'sha256')                      [Phase 1]
  ├─ SQLite + SYNC QUEUE  one DatabaseService.transaction:
  │      AttachmentRepository.create (attachments row, client_sha256)
  │      SyncGateway.enqueueAttachment (sync_queue, SYNC_PRIORITY.HIGH)
  ▼
navigation.goBack()  → PhotoGallery useFocusEffect reloads → thumbnail appears
  │  (retake = tap 🗑 on a thumbnail → confirm → delete)
  ▼
─────────────────────────  later, when online  ─────────────────────────
AttachmentUploader.upload():
  stripExifMetadata (piexif.remove, idempotent) → FormData(file, geoLocation, clientSha256, operationId)
  → POST /api/mobile/verification-tasks/:taskId/attachments  (Idempotency-Key)
  ▼
verificationAttachmentController.uploadVerificationImages:
  server_sha256_hash = sha256(uploaded bytes)   ← PRIMARY evidence hash (IT Act §65B)
  hash_verified = (client_sha256 === server_sha256_hash)   ← transit check, logged
  INSERT verification_attachments  → objectStorage.put (local FS / S3)
  ▼
Web (VerificationImages): overlay address + GPS + time from stored coords at view time
```

### Sequence (capture → saved, the perceived path)

```
User      CaptureScreen     CameraService          LocationSvc   SQLite/Queue
 │  shutter →│                                                        
 │           │ takePhoto ──────────────────────────────────────────► (temp jpeg + w/h)
 │           │ savePhoto(warmFix, w/h) ─►│                                  
 │           │                           │ warm fix? ─► (instant)           
 │           │                           │ normalize OR skip(strip EXIF)    
 │           │                           │ thumbnail(final)                 
 │           │                           │ RNFS.hash (native)               
 │           │                           │ tx: create + enqueue ──────────►│ (atomic)
 │           │◄── saved ─────────────────│                                  
 │◄ goBack ──│                                                              
 │  gallery reloads (useFocusEffect) → thumbnail                            
```

---

## 3. Before vs after optimization (this initiative)

| Stage | Before | After |
|---|---|---|
| Hash | crypto-js over `RNFS.readFile(base64)` — JS thread, ~1.33× heap, ~300ms | native `RNFS.hash` — no JS string, off-thread |
| Normalize | always full decode + re-encode | **skip** when upright + in-bound (strip EXIF only); else normalize (fail-safe) |
| Thumbnail | from the final saved (normalized) file | unchanged — still from final file (no duplicate raw decode) |
| Watermark | burned-in via ViewShot screenshot (capped ~720p, cropped landscape) | **removed** — raw photo; web overlays metadata |
| Confirm step | Preview + Save button screen | **removed** — single-tap auto-save |
| Reads/decodes per photo | up to 4 reads / 2 decodes | 1–2 reads / 0–1 decodes |

Commits (mobile repo): `0e88068` (raw photo + watermark removal), `4e7db75` (native hash + conditional normalize),
`471fac1` (skip-path read-once), `770a0ab` (drop direct crypto-js).

---

## 4. Evidence-chain contract (must hold)

1. **Client hash** (`client_sha256`) is computed at capture over the **final saved bytes**.
2. **Saved bytes == uploaded bytes**: the upload path strips EXIF; on the Phase-3 skip path
   capture *also* strips EXIF first; `piexif.remove()` is byte-idempotent → both produce the
   same bytes the server hashes.
3. **Server hash** (`server_sha256_hash`) is the PRIMARY evidence hash (IT Act §65B admissibility).
4. **`hash_verified`** = client === server. Today logged-only (not a rejection) for rollout safety.
5. **Reverse-geocoded address** on the attachment is write-once / read-forever (DB trigger
   `trg_verification_attachments_freeze_address`).

If you change capture-side byte handling, re-verify (2): a mismatch makes `hash_verified=false`.

---

## 5. Offline-first guarantees

- File + row + queue entry written atomically before `goBack` → no lost photo, no orphan row.
- GPS-missing → throw + rollback → never a GPS-less attachment.
- Upload is idempotent (Idempotency-Key / `operation_id`) → no server duplicates on retry.
- Crash mid-capture → at most a temp file (swept by retention); a committed row simply re-uploads.
- 45-day retention (tier-2) + 15-day file-unlink (tier-1); per-task 2000-location cap.

---

## 6. Key tunables

| Constant | Value | File |
|---|---|---|
| `NORMALIZE_MAX_EDGE` | 1920 | CameraService.ts |
| `NORMALIZE_QUALITY` | 85 | CameraService.ts |
| `GPS_SAVE_TIMEOUT_MS` | 2000 | CameraService.ts |
| thumbnail size / quality | 240 / 60 | CameraService.ts |
| `maxFilesPerTask` / `maxFileSize` | 20 / 50MB | config |
| capture format | 1920×1080, balanced | CameraCaptureScreen.tsx |

---

## 7. Known limits / future work

- Phase-3 skip fires only for **upright (landscape-held)** captures; portrait shots carry an
  EXIF rotation tag (orient 6/8) and correctly fall through to a full normalize. Net CPU win is
  device/habit dependent — Phase 1 (native hash) is the reliable, every-photo win.
- Perceived-time figures are **estimates** until on-device `performance.now()` instrumentation is run.
- A true single-pass native module (one decode → resize + thumbnail + hash) is the next-tier
  optimization; deferred (new native surface, higher risk).
