# Duplicated Logic & Dead Code — Audit (2026-07-17)

Audit of `crm-mobile-native` for duplicated rules and dead code. Every candidate ends
**DEAD** (delete) · **UNIFIED** (one definition, imported) · **DIFFERENT-ON-PURPOSE** (documented,
left alone) · **OPEN** (needs an owner decision). Nothing is silently dropped.

**Why this was worth a session:** every item in the 2026-07-15/16 sessions was found *by accident*
while fixing something else, and each had already produced a real defect or a wasted debug cycle.
The pattern is always the same: **a rule hand-typed into N places drifts, and the copy nobody tests
is the one that lies.**

Method: `knip` (module-graph aware — a hand-rolled "exported but appears once" grep produced garbage
and was discarded), then per-candidate proof via `grep -rn` across `.ts`/`.tsx` **plus** `android/`,
`ios/`, `scripts/`, `package.json`. Extract & unify first (green), delete second (green) — never both
blind in one step.

Baseline: knip reported **6 unused files, 42 unused exports, 108 unused types**.
After this pass: **0 unused files** · **52 types** · 34 exports — and every survivor is triaged below
(§15), not silently dropped. The survivors are almost entirely knip flagging a redundant `export`
keyword on symbols used **within their own file**, plus `export default` lines beside a named export
every caller already uses. **A tool's verdict is a starting point, not a finding** — ~30 of the original
42 "unused exports" were false positives (schemas nested in a parent schema, `AuthContext` behind
`useAuth`, side-effect imports from `index.js`).

---

## 1. UNIFIED — the form's visibility & required rules (the headline find)

`DynamicFormBuilder.tsx` carried a **private copy** of `isEmptyFieldValue` + a condition evaluator +
`isSectionVisible`/`isFieldVisible`/`isFieldRequired`. It survived the 2026-07-16 `evaluateFormCompleteness`
unification because it is file-local — nothing flags a private duplicate.

This is the worst possible split: **`DynamicFormBuilder` renders the form; `FormValidationEngine` gates
Save/Submit.** Any disagreement is a form the agent can see but never finish.

**They had already drifted, in both directions:**

| Rule | `DynamicFormBuilder` (renders) | `FormValidationEngine` (gates Save/Submit) |
|---|---|---|
| empty `requiredWhen: []` | had the **M1 guard** → NOT required | `[].every()` → **true** → field **required** |
| array `conditional` on a **section** | not supported → section always visible | AND-combined → section can hide |

The `requiredWhen: []` case is the dangerous one: the UI draws **no asterisk** while Save/Submit
demand the field — a form that looks finished and can never be saved. Proved by execution, not by
reading:

```
empty requiredWhen[] + required:false, value empty:
  isValid      : false
  missingFields: ["Optional Field"]
  => ENGINE: field REQUIRED — DIVERGES from the UI, form cannot be completed
```

**Severity: LATENT, not live.** No bundled template can produce either shape:
- Templates are built **on the device** (`LegacyFormTemplateBuilders.ts`); every `requiredWhen` is a
  populated `legacyCondition(...)`, never `[]`.
- No bundled section carries a `conditional` at all (one section per template, no gating).
- `FormTemplateService.ts:496-499` tries the bundled template **first and returns**; the backend path
  is documented dead (`:537-540` — "the v2 backend has no server-side form-template engine and always
  returns null").

A backend-authored template *could* carry either shape — which is exactly why it is fixed rather than
excused.

**Fix:** two exported rules in `FormValidationEngine.ts`, imported by both layers:
- `conditionsMet(cond, values)` — visibility (single or array; absent/empty → visible)
- `isFieldRequired(field, values)` — required (`field.required` or a fully-met `requiredWhen`)

`DynamicFormBuilder` lost ~90 lines and now imports both.

> **The asymmetry — do not "simplify" these into one helper.** An empty `conditional: []` means
> *"no gating → VISIBLE"*; an empty `requiredWhen: []` means *"NOT required"*. Same shape, **opposite
> default**. `[].every()` is `true`, so sharing one helper silently marks every such field mandatory.
> That is precisely the M1 bug.

**Check:** `npm run contract:form-completeness` — 9 → **16 checks**.
Revert-verified: removing the M1 guard **fails** the suite.

> ⚠️ Honest note: the *empty-`conditional`* check does **not** fail on revert — `[].every()` already
> returns `true`, so that guard is documentation, not logic. Only the `requiredWhen` side is
> load-bearing. Kept for symmetry; recorded here rather than claimed as a passing gate.

## 2. UNIFIED — evidence counting was two predicates

"Does this capture count as evidence?" had two answers:

| | rule | used by |
|---|---|---|
| **strict** | `isCountableEvidence` — only `PENDING`/`UPLOADING`/`SYNCED` | form screen, self-heal, `FormSubmissionService` |
| **loose** | `listForSubmission` — `component_type IN ('photo','selfie')`, **no status filter** | `SubmitVerificationUseCase` |

5 photos with one `SKIPPED` was **incomplete** to the screen and **submittable** to the use case — and
the `SKIPPED` id still shipped in `attachmentIds`, pointing at a file that can never upload. The screen
path masked it (`FormSubmissionService` rejects first); **auto-submit calls the use case directly**.

**Fix:** `SubmitVerificationUseCase` filters through the same `isCountableEvidence`. Chosen over
adding `AND sync_status IN (...)` to the SQL, which would re-type the status set in a second language —
the exact disease.

**Safety, established by enumerating every writer** (not by reading types): attachments are only ever
written `PENDING` (insert default), `SYNCED`, or `SKIPPED`.
`UPLOADING`/`FAILED` are **never** written to an attachment (`FormRepository`'s `FAILED` is
`form_submissions`). So there is no retryable-`FAILED` photo to lose.

**Check:** new `npm run contract:evidence-countable` — 7 checks. Revert-verified: letting `SKIPPED`
count fails 3 of them. The predicate was split into `utils/evidenceCountable.ts` (dependency-free)
because `evidenceCount.ts` imports the repository → op-sqlite → **cannot load in the contract
harness**. Pure logic must be extractable to be testable.

## 3. UNIFIED — two attachment reapers; the laxer one deleted evidence rows (**was live**)

Same question ("which synced captures can I reclaim?"), two answers:

| | `DataCleanupService` tier-1 | `StorageService.cleanupSyncedData` |
|---|---|---|
| guard | `SYNCED` **AND `backend_attachment_id IS NOT NULL`** | `SYNCED` only — **guard dropped** |
| action | unlink file, **keep row**, blank paths | unlink file **+ DELETE the row** |
| window | 15 days | **1 day** as called |

The guard is the entire safety argument: the local file is dispensable *because the backend holds the
copy*. The laxer copy kept neither the file nor the row, and skipped the check that justified it.

**Reachable:** free disk < 50 MB → **any** `SyncQueue.enqueue` (fires on every photo capture and form
save) → `cleanupSyncedData(1)`. Photos go `SYNCED` at upload, **before** form submit. So a task still
in progress whose photos synced over a day ago lost its evidence **rows** → `countCapturedPhotos`
drops → the 5-photo/1-selfie gate **permanently blocks a form the agent had already finished**, while
the photos sit safe on the server.

**Fix:** `cleanupSyncedData` now calls `DataCleanupService.cleanupOldAttachmentFiles(daysOld)` — the one
reaper. Unlinking the **files** is what frees the disk; the rows are bytes.
`MaintenanceRepository.listSyncedAttachmentsOlderThan` + `deleteAttachmentById` deleted with their only
caller. (A THIRD copy of this same rule — `deleteSyncedForTask`, dead and drifted the same way — is in
§14.)

Note the narrowing is deliberate: a row can be `SYNCED` with `backend_attachment_id` NULL
(`backend_attachment_id = COALESCE(?, backend_attachment_id)` — the upload response may carry no id).
For those the local file is the **only** copy, so refusing to unlink is correct; a failed enqueue is the
right failure.

## 4. DEAD — 5 files deleted (289 lines)

All proven callerless by knip **and** an independent `grep` across `src`/`android`/`ios`/`scripts`/
`package.json`/`app.json`. Each had a **live twin that superseded it** — abandoned duplicates, not merely
unused code:

| File | LOC | Superseded by |
|---|---|---|
| `components/Modal.tsx` | 99 | callers use React Native's `Modal` directly |
| `components/ProfilePhotoCapture.tsx` | 47 | `screens/main/ProfilePhotoCaptureScreen.tsx` (this was a stub: *"not enabled in this build"*) |
| `components/SafeAreaProvider.tsx` | 125 | `react-native-safe-area-context` itself |
| `components/TaskCardHelpers.ts` | 6 | `utils/formTypeKey.ts` + `utils/fieldStatus.ts` |
| `usecases/CapturePhotoUseCase.ts` | 12 | `CameraCaptureScreen` calls `CameraService.savePhoto` directly |

`TaskCardHelpers.ts` also declared `export type FormType = string`, colliding by name with the real
9-member union in `types/api.ts:166` — a stringly-typed decoy for anyone auto-importing.

## 5. DEAD — zero-caller repository twins (the `listOldTerminalTaskIds` shape)

**The worst kind: dead but *armed*.** Each reads as the rule, so an edit there looks correct and changes
nothing — the trap that already burned a full debug cycle.

- `AttachmentRepository.updateUploadResult` / `markMissingAsSynced` / `getBackendAttachmentIds` — 0
  callers; stale twins of the SQL the uploaders run inline (`AttachmentUploader.ts:210-223`,
  `FormUploader.ts:95-99`).
- `TaskRepository.updateSubmissionMeta(…, markCompleted)` — the `markCompleted=true` branch wrote
  **device-side `status='COMPLETED'`**, which ADR-0047 forbids (COMPLETED is the office's sign-off and
  only arrives via down-sync). `FormUploader` was corrected to write `SUBMITTED`; this copy never was.
  Its one caller always omitted the flag → dead, but passing `true` would silently resurrect
  device-side COMPLETED. Parameter and branch removed.

## 6. DEAD — unused exports

- `utils/platform.ts`: `isIOS`, `isAndroid`, `platformValue`, `getScreenDimensions`, `normalize` — all 5
  dead. **File kept**: `CURRENT_PLATFORM`/`getOSVersion`/`getDeviceModel` are live (`AuthService.ts:526-528`).
- `Skeleton.tsx`: `DashboardCardSkeleton` — dead (DashboardScreen uses `ActivityIndicator`). Its
  `dashboardCard` StyleSheet key was orphaned by the deletion — **neither lint nor knip can see an unused
  StyleSheet key**, a real blind spot worth knowing.
- `utils/formTypeKey.ts`: `FORM_TYPE_KEYS_IN_ORDER` — dead, and a second hand-typed listing of the same 9
  keys the `FormTypeKey` union already defines. No re-typed ordering exists elsewhere; nobody needs an
  order.

## 7. DIFFERENT-ON-PURPOSE — do not "fix" these

Similar ≠ same. Each was checked and the **contracts genuinely differ**:

- **`formatRelative` ×2** (`utils/relativeTime.ts` vs `NotificationCenter.tsx`) — notifications are
  always-past and want *"just now"*; diagnostics needs a **signed** direction (*"14m from now"*).
  Merging breaks one.
- **`MAX_ACCEPTABLE_SKEW_MS` (1h) vs `CLOCK_SKEW_TOLERANCE_MS` (5min)** — *not* a duplicated constant.
  Different rules: an "untrustworthy clock" ceiling vs an RTT tie-break window. **No third hard-coded
  skew value exists**; `SyncConflictResolver` correctly delegates to `TimeService`. Suspected as
  duplication, **retracted on evidence**.
- **Jitter ×2** — `syncJitter.jitterDelayMs` is uniform `[0,max)` startup dispersion;
  `SyncRetryPolicy` is symmetric ±50% on exponential backoff. Two legitimate kinds.
  `LoginScreen`'s auth-lockout backoff deliberately has **no** jitter.
- **Byte formatters ×2** — bytes→KB/MB vs MB→GB. Different input units.
- **`FILTER_TABS`** (`TaskListScreen`) — looks dead (its "Completed" chip never renders) but is a live
  lookup resolving the active tab from route params. **Verify callers before deleting.**
- **`schema.ts:596-608`** — a dashboard INSERT inside **migration v8**: a historical snapshot, correctly
  frozen. Not a live copy.

---

## 8. ATTACHMENT vs PHOTO — the rule holds; the **names** are the risk

Audited on the owner's instruction (2026-07-17), across both repos, adversarially verified
(29 findings raised, 8 refuted).

> **ATTACHMENT** = an admin-uploaded reference **doc** (crm2 `case_attachments`, `kind='OFFICE_REF'`)
> pushed backend → device for the agent to **read**. Read-only on the device; the agent can never
> create one, so **it can never gate the agent finishing their work.**
> **PHOTO / SELFIE** = the agent's own camera **captures** — the **evidence** the 5-photo + 1-selfie
> rule counts.

### Verdict: **UPHELD. No admin attachment can gate a field agent anywhere.**

Not by luck — by construction. Four independent proofs, any one sufficient:

1. **The gate predicate cannot see one.** `evaluateFormCompleteness(template, values, photoCount,
   selfieCount)` takes four params — no attachment, no task, no repository import.
2. **Admin docs never enter the counted table.** `AttachmentService` performs **zero** DB writes (docs
   go HTTP → render). The only writer of the local `attachments` table is `AttachmentRepository.create`,
   whose sole caller is `CameraService`, with `componentType` typed `'photo' | 'selfie'`.
3. **The admin count is render-only.** Every `.attachmentCount` use is badge JSX, a memo compare, or the
   sync write. Zero in any gate.
4. **`requiredAttachments` does not exist in mobile** — zero hits repo-wide. The rule is the global
   `MIN_VERIFICATION_PHOTOS = 5` / `MIN_SELFIE_PHOTOS = 1`.

Server-side both directions are closed: `attachmentsForDeviceTask` now carries `AND ca.kind = 'OFFICE_REF'`,
and the only `requiredAttachments` gate (`cases/service.ts:504`) is reachable **only** via
`field_review.complete` — a permission FIELD_AGENT never holds. Reverse direction is clean too: no agent
evidence is excluded by admin-doc confusion.

### The crm2 `kind`-filter sweep (re-run — the first attempt died on an API error)

Now complete. **Every reader of `case_attachments` filters `kind` except one**, and that one is a real
hole. ~25 call sites checked across repositories, services, MIS, KYC, exports, the report snapshot and
the migrations. The CASE-000024 fix is confirmed present (`attachmentsForDeviceTask` carries
`AND ca.kind = 'OFFICE_REF'`), and every `photo_type` read sits inside a `kind='FIELD_PHOTO'` query.

> 🔴 **`DELETE /api/v2/cases/:id/attachments/:attachmentId` can destroy frozen field evidence.**
> `cases/repository.ts:1870` (`attachmentForAccess`) has **no kind predicate** and serves **two**
> callers: the presigned-URL route (kind-blind **by design** — the web Field Photos card fetches images
> through it) and the **soft-delete** route. So a `case.create` holder can enumerate photo ids from
> `GET /cases/:id/field-photos` and delete them through the *docs* endpoint — **bypassing the SUBMITTED
> freeze** the device path enforces (`deletableFieldPhotoForDeviceTask` requires
> `ct.status IN ('ASSIGNED','IN_PROGRESS')`). The photo vanishes from the Field Photos card, the zip and
> the case report. Not UI-reachable (no delete button is rendered for a photo) — an **API-level** hole,
> with **zero test coverage** for a FIELD_PHOTO id on that route. Same path also orphans the photo's
> `thumbnail_key` (it selects only `storage_key`).
> **UNCERTAIN on intent, not behaviour:** `service.ts:331` calls the device delete *"DPDP-erasure parity
> with the admin path"*, which may mean an admin is *meant* to erase a photo. **Owner call:** if yes, the
> path still needs its own status/permission gate + thumbnail purge (it has neither); if no, add
> `AND ca.kind = 'OFFICE_REF'` to `attachmentForAccess` and split a separate reader for the URL route.

> **MIS "Field Photos" counts soft-deleted photos.** `mis/reportTypes.ts:326` filters `kind` but omits
> `AND a.deleted_at IS NULL`, which every other reader carries — so MIS over-reports whenever an agent
> dropped a bad capture pre-submit, and disagrees with both the report's own `totals.photoCount` and the
> Field Photos card.

Both are **crm2**, not mobile, and land on a frozen surface — recorded here, not actioned.

### Fixed — names that lied

- **`isCountableAttachment` → `isCountableEvidence`**; `attachmentCountable.ts` → `evidenceCountable.ts`;
  `attachmentCount.ts` → `evidenceCount.ts`. These count **captures**, never attachments — the new module
  added earlier in this very session repeated the trap it was written to prevent. `tasks.attachment_count`
  keeps its name: it genuinely *is* the admin-doc count. The two concepts now have **different words**.
- **`schema.ts`**: `tasks.attachment_count` (admin docs) and the `attachments` table (agent captures) sit
  ~7 lines apart, and the table's comment (`-- Attachments (photos, documents)`) **asserted the lie**. Both
  now carry explicit terminology blocks. The trap they defuse is concrete: a dev notices the two never
  match and writes the "obvious" fix — `UPDATE tasks SET attachment_count = (SELECT COUNT(*) FROM
  attachments…)` — which typechecks, reads as a bugfix, and makes the badge advertise the agent's own
  photos as admin docs.
- **`componentType: 'photo' | 'selfie' | 'document'`** → `'photo' | 'selfie'`. `'document'` **never had a
  writer** — a dead third value that made the table look like it stores documents.

`AttachmentRepository` → **`CaptureRepository`** (done — see §15). Deliberately **not** renamed: the
physical `attachments` table (honest name: `captures`) — ~35 raw-SQL sites across 10 files over a live
SQLCipher DB holding real agent evidence. That one needs a migration; the honest name is recorded in the
schema comment instead.

## 9. LIVE — `DB_VERSION` trailed the last migration; **fresh installs broke**

`DB_VERSION = 22` while `MIGRATIONS` ended at **v23**. Not cosmetic, and it breaks **fresh installs only**
— which is exactly why every on-device test passed (they were all upgrades):

- **Upgrade:** the device's older `task_list_projection` genuinely lacks `sync_status`, so v23's
  `ALTER TABLE … ADD COLUMN` succeeds. ✅
- **Fresh install:** `runMigrations` sees `user_version = 0`, stamps `user_version = DB_VERSION` and
  **returns without running migrations** — correct, since `SCHEMA_SQL`'s `CREATE TABLE` already declares
  `sync_status`. With `DB_VERSION = 22` that stamps **22**, so on the **second launch** v23 is "pending"
  and runs `ADD COLUMN sync_status` against a column that already exists → **`duplicate column name`**.
  The migration runs inside `db.transaction(...)` **together with its `PRAGMA user_version = 23`**, so the
  rollback means the version never advances — it **re-runs and re-fails on every launch**, rejecting
  `migrationsReady` each time.

Proved against real SQLite, not by reading: the duplicate-column error reproduces, and a simulated
fresh-install boot with `DB_VERSION = 22` fails at launch 2 while `DB_VERSION = 23` is clean across three
launches with the column present.

**Fix:** `DB_VERSION = 23`.
**Check:** new `npm run contract:schema-version` (5 checks) asserts `DB_VERSION === max(MIGRATIONS.version)`,
plus uniqueness, contiguity, and — generalising the trap — that **no pending migration ADDs a column the
`CREATE TABLE` already declares**. Revert-verified: dropping back to 22 fails it with the exact diagnosis.

> This also corrects the 2026-07-17 kickoff, which stated mig 23 "self-applies on app upgrade". It does —
> and that is precisely what hid the fresh-install break.

---

## 10. UNIFIED — SUBMITTED is the field executive's final status

**Owner rule (2026-07-17):** *the field agent does not complete tasks — that is the back-office
executive's work. They only submit, and neither see nor act on completion.* So **SUBMITTED is their
final status**, and any UI gated on `status === 'COMPLETED'` is gated on **a status the device never
writes** (it only arrives via down-sync at sign-off). `TaskCard` was corrected for ADR-0047; nothing
else was, and each copy drifted its own way:

- **`TaskDetailScreen`** — the sync banner **and the Resubmit button** both sat behind
  `task.status === 'COMPLETED'`, so they were unreachable for the entire submit→sign-off window,
  i.e. **exactly when a DLQ'd submission needs resubmitting**. By the time COMPLETED arrives the
  submission has obviously reached the server, so the banner could only ever say "synced". Meanwhile
  `TaskCard` shows the red "Pending Upload" badge and its comment says the agent sees the failure
  *"unless they tap into TaskDetailScreen"* — **the documented escape hatch was a dead end.**
- **`TaskTimeline`** (rendered to the agent) showed a green **"Completed"** row. Deleted — the agent's
  timeline ends at Submitted. Its "Submitted" row also tested `status === 'SUBMITTED'`, so it
  **blanked when the office signed off**: the agent watched their own entry vanish and a completion
  they had no part in light up instead. "In Progress" tested `IN_PROGRESS || COMPLETED || SAVED` —
  omitting SUBMITTED (so it blanked too) and testing `SAVED`, which is **never written to
  `tasks.status`**; it now reads the `inProgressAt` stamp. **Total Duration** read `completedAt || now`,
  so it **ticked upward while the agent waited on the office** — inflating their number with
  back-office turnaround — then froze at sign-off; it now stops when they submit.
- **A "Completed" tab** in `FILTER_TABS` + a "Completed Tasks" copy block. Invisible (all four
  wrappers lock the filter, nothing passes `filter='COMPLETED'`) but **armed**: unlock the bar and it
  appears.

**Fix:** one `isFieldSubmitted` predicate in `utils/fieldStatus.ts` (true for SUBMITTED *and* the
office's COMPLETED), imported by `TaskCard`, `TaskDetailScreen`, `TaskTimeline` and `TaskListScreen`
(which held two more re-typed copies). All dead `COMPLETED` arms removed — including two
`fieldStatus !== 'COMPLETED'` guards that were **always true and hid nothing** (the `!isReadOnly`
wrapper already enforced what they claimed to).
**Check:** `contract:field-status` 5 → **9 checks**; reverting to the old `=== 'COMPLETED'` test fails it.

## 11. UNIFIED — the dashboard "Saved" count vs the tab badge

`saved_count` read `is_saved = 1 AND status != 'COMPLETED'`; the JS copy feeding the badge
(`TaskListProjection.getCounts`) skips revoked rows **and** excludes SUBMITTED. **Reachable:** save a
draft → office revokes → down-sync binds `is_revoked=1` while the resolver preserves the local status
⇒ `is_revoked=1, is_saved=1, status=IN_PROGRESS`. Dashboard said **"Saved: 1"**, badge said **0**, tab
was **empty** — the agent tapping a card that leads nowhere. The JS copy was right.

SQL and JS cannot share an implementation, so both sides now point at each other, and the SQL moved to
`projections/dashboardCountsSql.ts` (dependency-free) so it can be tested.
**Check:** new `contract:dashboard-counts` runs the **real query against real SQLite** over the **real**
`CREATE TABLE`, via the actual `dashboard_projection` INSERT (so positional column order is exercised).
Nothing re-types the rule. Reverting `saved_count` fails 2 checks with the production symptom.

## 12. UNIFIED — "is this revoked?" answered two ways (**was live**)

`SyncDownloadService` bound `is_revoked` from `task.isRevoked`, but read `justRevoked` — which gates
the B-148 wipe of local photos/drafts — off the **conflict-resolved status**. The resolver preserves the
local status whenever anything is queued, so an office revoke arriving with queued work wrote
`is_revoked=1` **and** `status='IN_PROGRESS'`. That row is **invisible** to every list (they filter
`is_revoked`) **and unreapable** by retention (which needs a terminal status) — its photos and drafts
stay on the device **forever**, defeating B-145's "a reassign forces fresh re-capture" — and the wipe
never fired.

On the wire these are **one fact**: crm2 derives `isRevoked` from `status === 'REVOKED'`. New
`sync/taskRevoked.ts` is the single predicate, called by both readers; the resolver now lets a server
revoke through (its own PENDING branch already treated REVOKED as authoritative — the drift was *inside
one file*). **Check:** `contract:task-revoked`, 6 checks, revert-verified.

## 13. FIXED — the autosave path (two bugs, both pre-existing)

`SaveDraftUseCase` is the write path behind **every** autosave debounce, unmount and background flush:
- it read through the **async projection**, so the merge could fold the patch into a stale/empty blob
  and **silently drop the agent's earlier answers** (bug 37/39, which `AutoSubmitSavedTasksUseCase`
  explicitly bypasses — this path never got it);
- it read `task.status` and passed it to `updateFormData`, which writes `status = ?` unconditionally, so
  **a revoke landing mid-save was overwritten with a stale IN_PROGRESS**, resurrecting a REVOKED task —
  precisely the hazard `unsaveIncompleteDraft` was built to dodge.

New `TaskRepository.saveDraftFormData` takes **no status**: the only legal transition
(ASSIGNED → IN_PROGRESS) is decided **inside the UPDATE**. Verified against real SQLite over the real
schema: ASSIGNED → IN_PROGRESS (stamping `in_progress_at`), while IN_PROGRESS / REVOKED / SUBMITTED /
COMPLETED are all preserved and the data still saves.

`useFormAutosave` awaited the task write **then** the backup in one `try`, so a task-write failure
skipped the backup — it failed to exist in the exact case it exists for. Both hot paths now use
`Promise.allSettled`. The unreachable "use whichever draft is newer" branch is deleted: `savedDraft`
**is** `formData`, and `persistAutoSave` stores the timestamp on the **envelope** that
`getAutoSavedForm` throws away; both sides also read `__autosave.timestamp`, **a key nothing ever
writes**. Not worth reviving — both copies go through the **same SQLite connection**, so the backup can
never meaningfully be the newer one. **The store copy is KEPT**: it is the real fallback when the task
blob is absent (one earlier recommendation to delete it was wrong).

## 14. DEAD — more armed twins

- **`AttachmentRepository.deleteSyncedForTask` + `listSyncedForTask`** — 0 callers, and a **drifted**
  twin of the live rule: filtered `SYNCED` alone (no `backend_attachment_id` guard) and **hard-deleted
  the row**. Wiring it up would have destroyed evidence the server never confirmed.
- **`CameraService.getPhotosForTask`** — 0 callers.
- **`utils/mapSqliteTask`** — claimed to map snake_case → camelCase; its body reassigned 8 fields **to
  themselves** (`isRevoked: isRevoked`) — an **identity function**, and all 5 call sites cast `as never`
  so the type boundary checked nothing either. Deleted, with the explanation moved to
  `DatabaseService.normalizeRow`, where camelization actually happens.

## 15. DEAD — the form-option enum catalog (468 → 45 lines)

The **108 unused exported types** were the last untriaged bucket. **56 of them were enums in one
file**: `src/types/enums.ts` held 57 enums and **exactly one — `TaskStatus` — was ever imported**.

The other 56 were a parallel catalog of every form's option values, and **already drifted from the
forms they claimed to describe**:

| Enum | says | the form (source of truth) says |
|---|---|---|
| `HouseStatus` | `Opened = 'Opened'` | `houseStatus: ['Open', 'Closed']` — every live condition tests `'Open'` |
| `WorkingStatus` | 8 values (Retired, Unemployed, Student, House Person…) | residence offers **3**; **OFFICE offers a different set** (`'Company Payroll'`…) one enum can't hold |
| `RevokeReason` | 5 members | a **straight duplicate** of the live enum of the same name in `types/api.ts` |

`'Opened'`, `'Retired'`, `'Unemployed'`, `'Student'`, `'House Person'` — **zero references anywhere
outside that file**. Phantom options.

**The most dangerous kind of dead code: it *read* as the domain catalog.** Writing
`HouseStatus.Opened` into a new condition would typecheck and then **silently never match**, because the
form emits `'Open'`. It also competed with the invariant that the **device form templates are the source
of truth** for option values.

Also removed: **`TaskStatus.Saved`** and **`TaskStatus.SubmittedPendingSync`** — phantom *statuses*.
Nothing writes either to `tasks.status`: "saved" is the `is_saved` **column** plus a filter/tab id, and
`'SUBMITTED_PENDING_SYNC'` appears nowhere at all. `Pending`/`Revoked` stay — real statuses written as
literals.

**Deleted `MobileAppConfigResponse`** too: a response type for `GET /auth/app-config`, **an endpoint
that does not exist**. It is the worked example of why an unused DTO isn't harmless — *a contract
nothing binds is a contract nothing checks*, so it drifts into fiction. By deletion it had accumulated
the impossible `pinning` kill-switch block, a `biometricAuth` flag for a feature never implemented, and
`limits`/`features` nothing reads.

**The remaining ~52 unused types are ACCEPTED, not dead logic** — knip is flagging the redundant
`export` keyword on types used *within their own file* (component `Props`, a use-case's `Result`, a
service's option bags). Removing the keyword is churn with no runtime effect. The one sub-group worth
naming: `types/api.ts`'s request DTOs (`MobileLoginRequest`, `MobileSyncUploadRequest`, …) describe
**real** endpoints but nothing binds them — zod schemas in `src/api/schemas/` are what actually validate
the wire. They are drift-prone for the same reason `MobileAppConfigResponse` became fiction; left in
place, recorded here.

## 16. Names that lie — fixed

- **`AttachmentRepository` → `CaptureRepository`** (19 refs, 7 files). It holds **zero attachments**;
  every method handles the agent's captures. It leaked the truth itself — `deleteSyncedForTask` named
  its own rows `photos`; `CameraService` wrapped `listForTask` as `getPhotosForTask`.
- **`LocalAttachment.syncStatus`** said `'PENDING' | 'UPLOADING' | 'SYNCED' | 'FAILED'`. Verified
  against every writer: **UPLOADING and FAILED are never written to an attachment**, while **SKIPPED**
  — the one status meaning "not evidence" — **was missing entirely**. Typing it honestly immediately
  found dead UI: `PhotoGallery` disabled its delete button on `syncStatus === 'UPLOADING'`, a guard
  that was **always false**.
- Still **not** renamed: the physical `attachments` table (honest name `captures`) — needs a migration
  over live SQLCipher evidence.

---

## OPEN — needs an owner decision

> **RESOLVED since first draft** — kept here as the record of what was decided and why.
>
> 1. ~~**SSL-pinning kill switch**~~ → **DELETED, deliberately not wired.** A remote kill switch is not
>    possible: pinning is enforced by the **OS network stack** from build-time config (Android
>    `<pin-set>`, iOS `NSPinnedDomains`) — the handshake fails **before any JS runs**, so no flag can
>    override it (`apiClient.ts`: *"App-level code requires no changes"*). The old doc conceded the
>    contradiction itself — *"the native pinning layer stays active, but ... request code routes around
>    it"* — and there is nothing to route around it with. Wiring it would mean moving enforcement **into
>    JS**: a permanent downgrade buying a **remotely-controlled TLS downgrade** for anyone who compromised
>    the backend or DNS. It also solved a problem that no longer exists — both platforms now pin the
>    **ROOT CA** (Amazon Root CA 1 → 2038, ISRG Root X1 → 2035), which survives leaf rotation with no new
>    release (the 2026-07-05 change made after a *leaf* pin bricked prod on 2026-07-04). The two-pin
>    overlap is the real safety mechanism. Service + orphan `pinning?` type + the doc's bypass section all
>    removed together; `check:ssl-pins` still passes and verifies the **live** chain.
> 2. ~~**`clearAutoSave`**~~ → **deleted** (zero consumers) and its comment corrected. It claimed
>    "FormUploader deletes it only after successful backend sync"; FormUploader deletes nothing and says
>    the opposite — the autosave is deliberately **kept** so a rejected submission can be resubmitted. The
>    retention gap is recorded below, not silently changed.
> 3. ~~**Version drift**~~ → `package.json` + `gradle.properties` reconciled to **1.0.81**, and the dead
>    *"10000+minor scheme"* comment deleted (CI uses `date +%s`).
> 4. ~~**`FCM_PRIORITIES`**~~ → **unified.** `FcmPriority` is exported from the tuple and replaces all ten
>    hand-typed copies (including the second tuple, `ALLOWED_PRIORITIES`). The socket's raw field is now
>    plain `string` — it was written as the union `| string`, which TypeScript collapses to `string`
>    anyway: a constraint that documented itself and enforced nothing.

1. **Auto-save retention is unbounded for non-terminal tasks (DPDP).**
   What actually reaps an auto-save blob: `deleteTaskGraph` (auto, daily) — but only once the **task** is
   terminal + synced and past **45 days**; or the **7-day** `key_value_store` purge, which **no scheduler
   calls** (it needs a manual "Erase Details" tap). So a task that never reaches a terminal synced state
   — an abandoned ASSIGNED/IN_PROGRESS one — keeps its autosaved names, family, employment and GPS
   **forever**. *(My earlier "PII persists indefinitely" claim in general was **wrong and is retracted**:
   for terminal tasks the 45-day reap does exist.)*
   → Owner call: schedule the 7-day purge, or accept and document.

2. **`CURRENT_PRIVACY_POLICY_VERSION = 2` has a hand-typed prose twin.**
   `constants/fieldExecutiveAcknowledgement.ts:11` renders *"Policy version: 2"* to the user.
   Currently agree; coupling is a comment, not a constraint. A consent-version mismatch already caused a
   production logout loop (mig 0117).

3. **`crm2/docs/plans/2026-07-16-mobile-save-button-validation-kickoff.md:44,99-101` still points the next
   implementer at the trap** — it suggests sourcing the photo bar from `requiredAttachments`. The impact is
   the **opposite** of what was assumed: all 9 FIELD verification units have `required_attachments='[]'`, so
   `requiredDocs = 0` — following the doc makes the gate a **no-op**, reinstating the original
   incomplete-form bug *with template-read legitimacy*. `requiredAttachments` has zero mobile consumers.
   → Amend the doc.

4. **Device submit has no server-side evidence gate.** `verification-tasks/service.ts:202` (`submitForm`,
   the path the app uses) evaluates zero requirements; `submitTaskByDevice` guards status only. The 5+1
   rule is **client-enforced** — a stale APK or a direct HTTP call submits with zero photos. This is *why*
   the owner's rule is structurally safe, but it means the DB-CHECKed `required_photos >= 5` invariant is
   enforced by nothing on the server. Related: `verification_units.required_photos` is **decoration** —
   zero runtime readers, and its floor of 5 agrees with mobile's `MIN_VERIFICATION_PHOTOS = 5` **by
   coincidence**; nothing links them.

5. **The auto-save envelope is write-only.** `persistAutoSave` stores a `timestamp` that
   `getAutoSavedForm` throws away (it returns `local.formData`). Harmless now — the "newer wins" branch
   that read it is deleted, and the rule is simply "the DB copy, else the backup" — but the write is
   still pointless. Left as-is: removing it changes a stored shape for no gain.

6. **`TaskListCounts.COMPLETED` is now unread.** The projection still tallies the office-signed-off
   subset correctly and documents it; nothing consumes it since the Completed tab went. Repository data,
   not agent UI — left alone rather than rippling the interface.

---

## Retractions (claims that did not survive verification)

Also retracted, from later in the audit:

- ~~"gate vs payload are different contracts, leave `listForSubmission` alone"~~ — **two agents
  contradicted each other** on this. Settled by enumerating **every writer** of
  `attachments.sync_status` rather than picking a side: only PENDING / SYNCED / SKIPPED are ever
  written, so there is no retryable-`FAILED` photo the filter could drop, and a SKIPPED row's file is
  gone from disk — shipping its id is a dangling reference. Filtering is correct.
- ~~"delete the auto-save store copy entirely"~~ — **wrong**: it is the real fallback when the task blob
  is absent. Only the unreachable "newer wins" branch was dead.
- ~~"`FILTER_TABS`'s Completed chip never renders, so the array is dead"~~ — the *chip* never renders
  (all four wrappers lock the filter), but `FILTER_TABS` is **also** the lookup resolving the active tab
  from route params. Only the COMPLETED **entry** was removed.
- ~~"the `DataCleanupManager` note contradicts itself about 45 days"~~ — it conflated **two** windows:
  45 days for TASKS, 7 days for auto-save BACKUPS. The user-facing claim was true of tasks; only the
  code comment was wrong.

Recorded deliberately — each was believed at some point in this audit and proved false:

- ~~"auto-save PII persists indefinitely"~~ — a 45-day terminal-state reap exists. Unbounded **only** for
  non-terminal tasks.
- ~~"`MAX_ACCEPTABLE_SKEW_MS` / `CLOCK_SKEW_TOLERANCE_MS` are a duplicated constant"~~ — two different
  rules, correctly different values, both live, no third copy.
- ~~"`APP_VERSION` is a hand-typed copy that drifted"~~ — it resolves from the native build at runtime and
  is honest. The drift is in `package.json`/`gradle.properties`, not here.
- ~~"the `greaterThan`/`lessThan` NaN guard is a drift between the two condition evaluators"~~ — both
  return `false` for a NaN operand. Identical behaviour; the guard is documentation.
- ~~"`shallowEqual` / `jitterDelayMs` are dead utils that were re-implemented inline"~~ — both are live
  in-file; no re-implementation exists.

**Most of the 42 "unused exports" are knip false-positives**: 17 are redundant `export default` lines
beside a named export every caller already uses, and ~13 are in-file-only symbols (schemas nested in a
parent schema, `AuthContext` behind `useAuth`, `SkeletonBox` used by its siblings). `installUppercaseDefaults`
and `installGeolocationConfig` are **side-effect imports from `index.js`** — alive. A tool's verdict is a
starting point, not a finding.
</content>
