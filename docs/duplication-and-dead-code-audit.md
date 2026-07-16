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

Baseline: knip reported **6 unused files, 42 unused exports, 108 unused types**. After this pass:
**1 unused file** (held for an owner decision), 35 unused exports (mostly redundant `export default`
lines beside a named export, plus knip false-positives on in-file-only symbols).

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
| **strict** | `isCountableAttachment` — only `PENDING`/`UPLOADING`/`SYNCED` | form screen, self-heal, `FormSubmissionService` |
| **loose** | `listForSubmission` — `component_type IN ('photo','selfie')`, **no status filter** | `SubmitVerificationUseCase` |

5 photos with one `SKIPPED` was **incomplete** to the screen and **submittable** to the use case — and
the `SKIPPED` id still shipped in `attachmentIds`, pointing at a file that can never upload. The screen
path masked it (`FormSubmissionService` rejects first); **auto-submit calls the use case directly**.

**Fix:** `SubmitVerificationUseCase` filters through the same `isCountableAttachment`. Chosen over
adding `AND sync_status IN (...)` to the SQL, which would re-type the status set in a second language —
the exact disease.

**Safety, established by enumerating every writer** (not by reading types): attachments are only ever
written `PENDING` (insert default), `SYNCED`, or `SKIPPED`.
`UPLOADING`/`FAILED` are **never** written to an attachment (`FormRepository`'s `FAILED` is
`form_submissions`). So there is no retryable-`FAILED` photo to lose.

**Check:** new `npm run contract:attachment-countable` — 7 checks. Revert-verified: letting `SKIPPED`
count fails 3 of them. The predicate was split into `utils/attachmentCountable.ts` (dependency-free)
because `attachmentCount.ts` imports the repository → op-sqlite → **cannot load in the contract
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
caller.

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

⚠️ **Coverage gap, stated honestly:** the agent auditing crm2's `case_attachments` **`kind`-filter surface
died on an API error**. The `attachmentsForDeviceTask` result above came via another finder. **The
exhaustive "every reader filters `kind`" sweep did not complete** and should be re-run before anyone
treats that surface as fully audited.

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

Deliberately **not** renamed: the physical `attachments` table (honest name: `captures`) — ~35 raw-SQL
sites across 10 files over a live SQLCipher DB holding real agent evidence. The honest name is recorded in
the schema comment instead. Recommended next, cheap and mechanical: `AttachmentRepository` →
`CaptureRepository` (11 call sites, 5 files) — it already leaks the truth by naming its own rows `photos`.

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

## OPEN — needs an owner decision

1. **`services/PinningConfigService.ts` (142 LOC) — born dead, and its runbook is fiction.**
   The commit that added it ("consumes backend pinning kill switch") wired nothing; `git log -S` finds no
   commit that ever did. Actual pinning is enforced natively (`network_security_config.xml`,
   `NSPinnedDomains`). But `docs/ssl-pinning.md` gives operators an emergency cert-rotation bypass
   (`export MOBILE_PINNING_ENABLED=false` + `pm2 restart crm-backend`) where **every link is absent**:
   nothing in crm2 reads that env var, `/auth/app-config` does not exist server-side, the app never calls
   it, and `pm2 restart` is v1-era ops (crm2 is Docker blue-green on AWS). **An operator following that
   runbook mid-outage would change nothing and believe they had.**
   → Either **wire it** (build the endpoint, consult it before requests) or **delete the service + the
   orphan `pinning?` field in `types/api.ts:321` + the bypass section of the doc together**. Deleting the
   file alone leaves the misleading runbook standing. *Not actioned — this is a security kill switch.*

2. **`clearAutoSave` is dead and its comment lies (DPDP retention).**
   Zero callers. `SubmitVerificationUseCase.ts:373` claims *"FormUploader deletes it only after successful
   backend sync"* — `FormUploader` contains **no** autosave deletion (`grep` over `src/sync/` finds none).
   → **My earlier "PII persists indefinitely" claim was WRONG and is retracted**: a 45-day auto-reap does
   exist (`DataCleanupRepository.ts:38` via `AuthContext` → `initializeAutoCleanup`). Retention is
   genuinely unbounded **only for tasks that never reach a terminal SYNCED state** (an abandoned
   ASSIGNED/IN_PROGRESS task keeps its autosaved names/family/employment/GPS forever).
   → Decide: wire deletion into FormUploader's ack path (one line, where the comment already claims it),
   or delete the dead function and own retention elsewhere.

3. **Version numbers: `package.json` + `gradle.properties` say `1.0.73`; last release was `v1.0.81`.**
   No runtime bug on the normal path — CI derives the version from the git tag. **But**
   `VERSION_NAME="${RELEASE_TAG#v}"` is a no-op on a tag without the `v` prefix, so CI falls back to
   `package.json` → a tag like `1.0.82` would ship bytes **labelled 1.0.73**.
   Also `gradle.properties:51` documents a *"10000+minor scheme (1.0.73 → 10073)"* that CI ignores —
   it sets `VERSION_CODE="$(date +%s)"`. The comment and the checked-in `versionCode=10073` are both
   fiction.
   → Reconcile both files to the real version and delete the dead scheme comment.

4. **`FCM_PRIORITIES` — dead constant, 10 live hand-typed copies.**
   The `as const` tuple (`fcm.schema.ts:45`) is unreferenced while the same 5-member set is re-typed
   inline across `MobileSocketService` (incl. a full second tuple, `ALLOWED_PRIORITIES` at `:322`),
   `NotificationRepository` and `NotificationService`. **Values agree today — no drift yet.**
   → Either delete the tuple, or export `type FcmPriority = (typeof FCM_PRIORITIES)[number]` and replace
   the copies. Deferred: it is the only finding here with real duplication cost but zero current drift.

5. **`CURRENT_PRIVACY_POLICY_VERSION = 2` has a hand-typed prose twin.**
   `constants/fieldExecutiveAcknowledgement.ts:11` renders *"Policy version: 2"* to the user.
   Currently agree; coupling is a comment, not a constraint. A consent-version mismatch already caused a
   production logout loop (mig 0117).

6. **`crm2/docs/plans/2026-07-16-mobile-save-button-validation-kickoff.md:44,99-101` still points the next
   implementer at the trap** — it suggests sourcing the photo bar from `requiredAttachments`. The impact is
   the **opposite** of what was assumed: all 9 FIELD verification units have `required_attachments='[]'`, so
   `requiredDocs = 0` — following the doc makes the gate a **no-op**, reinstating the original
   incomplete-form bug *with template-read legitimacy*. `requiredAttachments` has zero mobile consumers.
   → Amend the doc.

7. **Device submit has no server-side evidence gate.** `verification-tasks/service.ts:202` (`submitForm`,
   the path the app uses) evaluates zero requirements; `submitTaskByDevice` guards status only. The 5+1
   rule is **client-enforced** — a stale APK or a direct HTTP call submits with zero photos. This is *why*
   the owner's rule is structurally safe, but it means the DB-CHECKed `required_photos >= 5` invariant is
   enforced by nothing on the server. Related: `verification_units.required_photos` is **decoration** —
   zero runtime readers, and its floor of 5 agrees with mobile's `MIN_VERIFICATION_PHOTOS = 5` **by
   coincidence**; nothing links them.

8. **Known-open, verified, not yet fixed** (each real, each a separate diff):
   - **`SaveDraftUseCase` reads the async projection** (`getTaskById` → `task_detail_projection`) — the
     staleness `AutoSubmitSavedTasksUseCase` explicitly bypasses for bugs 37/39. It writes `task.status`
     back unconditionally, so a remote revoke landing during a pending 300 ms autosave can **resurrect a
     REVOKED task as IN_PROGRESS**.
   - **The autosave pair**: `useFormAutosave` awaits the DB write *then* the store write, so a DB failure
     writes **neither** (only on the debounce/`flushNow` paths — unmount/background fire both
     independently). And `getAutoSavedForm` **strips the timestamp**, so the "use whichever draft is
     newer" branch is unreachable — the DB copy always wins. *Do not simply delete the store copy: it is
     the real fallback when the DB copy is missing.*
   - **`TaskDetailScreen` tests `task.status === 'COMPLETED'`** (`:105`, `:715`) — a status **the device
     never writes**. So the sync banner **and the Resubmit button** are unreachable for a SUBMITTED task,
     while `TaskCard` correctly shows red "Pending Upload" and tells the agent to *"tap into
     TaskDetailScreen"*. The documented escape hatch for a DLQ'd submission is a dead end. `TaskCard` is
     right.
   - **Dashboard "Saved" count vs the Saved-tab badge** disagree on a reachable row (revoked + saved):
     the dashboard SQL lacks the `is_revoked` guard and the SUBMITTED exclusion the JS copy has. Dashboard
     says *Saved: 1*, badge says *0*, tab is empty.
   - **`SyncDownloadService` answers "is this revoked?" two ways 25 lines apart** (`:633` payload flag vs
     `:657` merged status) — the disagreeing row is invisible **and** unreapable, so its photos and drafts
     stay on disk forever.
   - **`DataCleanupManager.tsx:35-41`** describes the retention rule *"NO status filter … every case"* —
     the filter was **added the same day** (`5f515d6`). The destructive-confirm dialog now documents
     behaviour that no longer exists.
   - **`TaskTimeline.tsx:105-113`** renders a literal **"Completed"** row to the agent, bypassing
     `toFieldStatus` — whose stated owner rule is that COMPLETED "must never reach their eyes."

---

## Retractions (claims that did not survive verification)

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
