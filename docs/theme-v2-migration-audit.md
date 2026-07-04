# Theme v1 → v2 migration audit (crm-mobile-native)

**Date:** 2026-07-04 · **Scope:** color/theme migration from the v1 ACS-green palette to the v2 blue design-token system (matching the web app, `crm2/packages/ui-theme/tokens.css`). **Status:** audit-only — no code changed.

**Method:** multi-agent sweep — 52 source files fanned out over 11 catalog batches, each independently re-verified adversarially, then a completeness critic looped until dry. It went dry on round 1 (no files missed), so coverage is the full styled surface. 23 agents, 1,191 raw findings.

---

## 1. Headline

Mobile's brand is still ACS **green** (`#00A950`); v2 is **blue** (`#2563EB`, blue-600). The good news: the migration is **highly concentrated**, because the app has a real theme system (`src/theme/Theme.ts` → `useTheme()`).

- **1,191 findings** total, but **669 are `already-correct`** (components correctly reading `theme.colors.*`) and **203 are `legit-keep`** (scrims `rgba(0,0,0,x)`, the new logo blue). Those need no edit.
- **Actionable: 319.** Of those, **232 are P3 typography/spacing/radius** literals that bypass the theme's numeric scales — real hygiene debt, but **not color** and **out of scope** for this migration (see §7).
- **The actual color migration is ~80 findings**, and **half of them are one file** (`Theme.ts`).

### The brand change is one file

92 findings are P0 "brand-critical" surfaces (tab-bar tint, primary buttons, spinners, headers, focus rings). **Only 11 are green literals you edit** — the other **81 auto-flip** the instant `Theme.ts` changes, because they route through `theme.colors.primary`. Fixing `Theme.ts` is ~90% of the visible migration.

| | count | note |
|---|---|---|
| Total findings | 1191 | full styled surface, 52 files |
| — already correct (token-routed) | 669 | no action |
| — legit-keep (scrims, logo blue) | 203 | no action |
| — **actionable** | **319** | |
| &nbsp;&nbsp;• color (hex/rgb/named) | **80** | the migration |
| &nbsp;&nbsp;• P3 typography/spacing/radius | 232 | out of scope (§7) |
| &nbsp;&nbsp;• nav-theme / other | 7 | §6.4 |

---

## 2. The 6 architectural findings (the backbone)

These are whole-app concerns a per-line audit alone would miss. In priority order:

1. **[P0] `Theme.ts` brand tokens are still ACS green — light and dark.** `primary #00A950 / primaryLight #00C75F / primaryDark #008A42`, identical in both modes. This is invisible to a literal scan because every caller uses the token *name*. Fixing this flips the brand everywhere.
2. **[P1] `Theme.ts` semantic tokens drift from v2** (both modes): `success #10B981→#16A34A`, `danger #EF4444→#DC2626`, `info/assigned #3B82F6→#2563EB`, etc. Feeds every status chip/badge via tokens.
3. **[P2] `Theme.ts` surfaces/text/borders use Tailwind `gray-*`; v2 is `slate-*` (light) / charcoal-222 (dark).** One coherent ramp swap, not scattered one-offs. No v2 slate/charcoal value exists in the repo yet.
4. **[P1] `submitted` status is violet (`#8B5CF6` / dark `#A78BFA`) with no v2 equivalent.** Cannot be resolved mechanically — **owner decision** (§5).
5. **[P2] `RootNavigator` `NavigationContainer` has no `theme` prop.** react-navigation falls back to its built-in white/`#007aff` DefaultTheme and **never goes dark** — the container shell shows during transitions/overscroll. Pure config, no literal.
6. **[P1] `App.tsx` bootstrap is theme-blind:** a hardcoded green spinner (`#00a950`) and an unconditional dark-content `StatusBar` that render *before* `ThemeContext` mounts.

---

## 3. Migration plan (ordered, concentrated)

| Step | File(s) | Findings | Effect | Priority |
|---|---|---|---|---|
| 1 | `src/theme/Theme.ts` | 37 color | Flips brand + semantic + surfaces across the whole app (all 664 token refs + 81 P0 surfaces auto-update) | **P0** |
| 2 | `App.tsx` | 5 color | Bootstrap spinner green→blue; drive `StatusBar` from `useColorScheme()` | P0/P1 |
| 3 | `src/navigation/RootNavigator.tsx` | 2 nav | Add a `NavigationContainer theme` built from `Theme.ts` (container bg + dark shell) | P2 |
| 4 | `ErrorBoundary.tsx` + `ScreenErrorBoundary.tsx` | 28 color | Hardcoded palettes → v2 values (these render *outside* ThemeContext, see §6.2) | P1/P2 |
| 5 | `CameraCaptureScreen`, `PhotoGallery`, `TaskTimeline`, `LoginScreen` | ~10 color | Tokenize scattered literals | P2 |
| — | *owner decision* | 1 | `submitted` violet: keep or remap (§5) | blocks step 1 |

Steps 1–5 are the color theme migration. Realistically ~7 files change materially. Step 1 is the bulk of the visible result.

---

## 4. `Theme.ts` — the central token table

Apply to **both** `lightTheme` and `darkTheme`. `L` = light value, `D` = dark value.

| token | v1 L → v2 L | v1 D → v2 D |
|---|---|---|
| **primary** | `#00A950` → **`#2563EB`** | `#00A950` → **`#3B82F6`** |
| **primaryLight** | `#00C75F` → `#3B82F6` | `#00C75F` → `#60A5FA` |
| **primaryDark** | `#008A42` → `#1D4ED8` | `#008A42` → `#2563EB` |
| background | `#FFFFFF` → `#FFFFFF` | `#111827` → `#101722` |
| surface | `#F9FAFB` → `#F8FAFC` | `#1F2937` → `#171C26` |
| surfaceAlt | `#F3F4F6` → `#F1F5F9` | `#374151` → `#2A2F3B` |
| text | `#111827` → `#1E293B` | `#F9FAFB` → `#E6EAF1` |
| textSecondary | `#374151` → `#334155` | `#D1D5DB` → `#C2CAD6` |
| textMuted | `#6B7280` → `#64748B` | `#6B7280` → `#8A94A6` |
| success | `#10B981` → `#16A34A` | `#34D399` → `#2FB56B` |
| warning | `#F59E0B` → `#F59E0B` *(same)* | `#FBBF24` → `#FBB024` |
| danger | `#EF4444` → `#DC2626` | `#F87171` → `#D33A3A` |
| info / assigned | `#3B82F6` → `#2563EB` | `#60A5FA` → `#3B82F6` |
| inProgress | `#F59E0B` *(same)* | `#FBBF24` → `#FBB024` |
| completed | `#10B981` → `#16A34A` | `#34D399` → `#2FB56B` |
| saved / revoked | `#EF4444` → `#DC2626` | `#F87171` → `#D33A3A` |
| **submitted** | `#8B5CF6` → **owner decision** | `#A78BFA` → **owner decision** |
| border | `#E5E7EB` → `#E2E8F0` | `#374151` → `#2E3440` |
| borderLight | `#F3F4F6` → `#F1F5F9` | `#1F2937` → `#232833` |

Dark values derive from the v2 web dark tokens (`packages/ui-theme/src/tokens.css` `.dark` block, hsl→hex).

---

## 5. Owner decision (blocks step 1)

**`submitted` status color has no v2 equivalent** — v2's palette has no violet token. Options:
- **(a) Keep violet** (`#8B5CF6` / `#A78BFA`) as the distinct SUBMITTED color — recommended, it stays visually separate from the green COMPLETED and blue ASSIGNED/INFO.
- **(b) Remap** to a v2 hue (e.g. indigo/blue-tint) — makes the palette fully v2 but risks SUBMITTED and ASSIGNED/INFO looking alike.

Do **not** auto-remap. Hold until the owner picks.

---

## 6. Concrete findings by area

### 6.1 The 11 green (`#00A950`) literals to remove
- `src/theme/Theme.ts:104-106` (light brand tokens) + `:144-146` (dark) — the 6 token defs (step 1).
- `App.tsx:364` — bootstrap `<ActivityIndicator color="#00a950" />`.
- `src/components/ScreenErrorBoundary.tsx:174` — retry-button `backgroundColor: '#00A950'`.
- `src/screens/auth/LoginScreen.tsx:430` — Sign-In button `backgroundColor: '#00a950'` (+ update the 2 brand comments at `:32`, `:341`).

### 6.2 Error boundaries — 28 findings, special case
`ErrorBoundary.tsx` (18) and `ScreenErrorBoundary.tsx` (10) hardcode entire light+dark palettes because they render **outside/before `ThemeContext`** (they catch render errors; a context hook can't be relied on). Note: `ErrorBoundary` already hardcodes *blue* (`#3B82F6`/`#2563EB`), not green — so it partially pre-empted v2, but its shades drift (`warning #D97706` vs v2 `#F59E0B`, `danger #EF4444` vs `#DC2626`). **Recommendation:** either import the `lightTheme`/`darkTheme` constants directly (not via the hook) + `useColorScheme()`, or hardcode the v2 hex from §4. Do not force `useTheme()` here.

### 6.3 Scattered literals — ~10 findings
- `CameraCaptureScreen.tsx`: `#9CA3AF` (→textMuted), `#2563EB`×2 (→primary), `#fff` (→onPrimary), `rgba(234,179,8,.95)` (→warning).
- `PhotoGallery.tsx`: `#0ea5e9` (→info), `rgba(239,68,68,.85)` (→danger).
- `TaskTimeline.tsx:127-128`: fallback `|| '#f59e0b'` / `|| '#3b82f6'` — drop the literal, rely on the token.

### 6.4 App / navigation shells
- `App.tsx:424` `color: '#dc2626'` (→danger token) + the bootstrap spinner/StatusBar (§2.6).
- `RootNavigator.tsx`: build `theme` from `Theme.ts` and pass to both `NavigationContainer`s (lines ~491, ~525). Screens already route tabBar/header colors correctly; only the container shell is unthemed.

---

## 7. Out of scope / deferred

- **232 typography/spacing/radius literals** (104 fontSize/fontWeight, 68 padding/margin, 60 borderRadius) across 20 files bypass the theme's numeric scales (`theme.spacing`, `theme.typography`, `theme.roundness`). This is **design-token hygiene, not the color migration.** Track as a separate P3 pass; do not bundle it here.
- **App icon / splash / login logo** — already rebranded to the v2 shield (commit `0072f51`), excluded from this audit.
- **Legal/employer strings** (field-exec contract, ID badge, ethics recipient) — intentionally left; not theme.

---

## 8. Appendix

- **Coverage confidence:** completeness critic returned "dry" on round 1 — the initial 52-file list was the complete styled surface; no files missed.
- **Authoritative v2 source:** `crm2/packages/ui-theme/src/tokens.css` (`:root` light, `.dark` dark) + `crm2/apps/web/tailwind.config.js`.
- **Raw findings** (1,191, machine-readable) preserved in the session workflow output; actionable subset (319) and color-only (80) exported during synthesis.
