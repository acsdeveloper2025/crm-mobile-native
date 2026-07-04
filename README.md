# CRM Mobile (Native)

React Native client for the CRM verification platform. Field executives use it to receive case assignments, capture geo-tagged + watermarked verification photos, fill verification forms offline, and sync back to the backend.

Pairs with the monorepo at <https://github.com/acsdeveloper2025/CRM-APP-MONOREPO-PROD> (backend + admin web). Staging backend lives at <https://crm.allcheckservices.com>.

## What's in here

- **React Native 0.84** + **React 19** + **TypeScript**
- **op-sqlite + SQLCipher** — encrypted local DB for offline-first case + form storage
- **vision-camera** — verification photo capture with native watermarking
- **@react-native-firebase/messaging** — FCM push notifications (background + foreground)
- **@react-native-community/geolocation** — GPS for photo metadata
- **react-native-keychain** — secure auth-token storage
- **SSL pinning** on the backend hostname (see `scripts/check-ssl-pins.sh`)
- **Sync queue** — BullMQ-driven retry on the backend; mobile-side queue with NetInfo gating

## Download releases

Android APK / AAB builds are published as GitHub Releases on every tag push.

1. Open the [Releases page](https://github.com/acsdeveloper2025/crm-mobile-native/releases).
2. Select the latest `v1.x.x` release.
3. Download the attached `crm-mobile-native-vX.X.X.apk` (sideload) or `crm-mobile-native-vX.X.X.aab` (Play Store internal track).
4. Verify the `.sha256` checksum before distribution if needed.

Publishing is automated via `.github/workflows/android-release.yml`.

iOS distribution is currently dev-only — paid Apple Developer enrollment is the gating step (see `docs/ios-distribution-options.md`).

## Release process

Tag-driven, fully automated:

1. Merge release-ready code to `main`.
2. Bump `version` in `package.json` and `versionCode` in `android/app/build.gradle`.
3. Create + push an annotated tag matching the package version:
   ```bash
   git tag -a v1.0.58 -m "v1.0.58 — release notes"
   git push origin v1.0.58
   ```
4. GitHub Actions runs:
   - `android-release.yml` — type-check, lint, debug smoke, release APK + AAB, publishes GitHub Release with `.apk` + `.aab` + `.sha256` assets.
   - `ios-build.yml` — type-check, lint, simulator-only smoke build, attaches `.app.zip` to the Release.

Manual `workflow_dispatch` is for rebuilds and recovery, not the normal release path.

## Local dev — prerequisites

- **Node 20 LTS** (matches monorepo) — pinned in `.nvmrc`
- **Java JDK 17** (Android)
- **Xcode 16+** + **CocoaPods** + **Ruby 3.4** (iOS, macOS only)
- **Android Studio** with SDK platform 34+ and an emulator OR a physical device with USB debugging

## Local dev — first run

```bash
nvm use                          # picks Node 20 from .nvmrc
npm install                      # native deps + auto-applies patches via patch-package
cd ios && bundle install         # one-time, macOS only
bundle exec pod install          # every time native deps change
cd ..

# Start Metro (separate terminal stays open)
npm start

# In another terminal — run on device/sim
npm run android                  # Android emulator or USB device
npm run ios                      # iOS simulator (macOS only)
```

Backend endpoint is configured per-build via `BASE_URL` in `src/config/`. Default points at staging; override for local dev pointing at your laptop's IP.

## Common commands

| Command | What |
|---|---|
| `npm start` | Metro JS bundler (keep this running) |
| `npm run android` | Build + install + launch on Android |
| `npm run ios` | Build + install + launch on iOS simulator |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run check:ssl-pins` | Verify pinned SPKI matches the backend cert |
| `npm run verify:ssl-pins-live` | Network-side check against the live backend |
| `npm run prerelease` | Run typecheck + lint + both SSL pin checks before tagging |

## Architecture highlights

- **Offline-first**: every user action queues locally in op-sqlite first, then syncs to backend via a retry queue. Network drop mid-form doesn't lose data.
- **Watermark pipeline**: photos captured via vision-camera get GPS + timestamp + agent ID + case ID baked into the JPEG client-side (`WatermarkReStamper`). The backend re-validates server-side.
- **Push notifications**: case assignments and revocations arrive via FCM (background) + foreground via Socket.IO when the app is open. Killed-app push delivery requires Firebase service account configured server-side.
- **SSL pinning**: backend cert SPKI is pinned in `src/config/sslPins.ts`. Pin rotation requires a coordinated mobile release before the server-side cert rotates. See the monorepo's `docs/aws-migration-notes.md` for the intermediate-CA migration plan.

## Troubleshooting

- **Metro fails to start**: kill any process on `:8081`. Re-run `npm start --reset-cache`.
- **Android build fails on native deps**: `cd android && ./gradlew clean && cd ..`. Make sure JDK 17 is active (`java -version`).
- **iOS build fails on pods**: `cd ios && rm -rf Pods Podfile.lock && bundle exec pod install`. Make sure Xcode CLI tools are installed (`xcode-select --install`).
- **FCM not receiving in dev**: ensure `google-services.json` is at `android/app/` (committed — public client config) and `GoogleService-Info.plist` is at `ios/CrmMobileNative/` (committed). The PRIVATE service account JSON is server-side only.
- **SSL pin mismatch**: backend cert was rotated. Update `src/config/sslPins.ts` with new SPKI, ship a new mobile release.

## Don't-regress notes

- Keep `google-services.json` + `GoogleService-Info.plist` committed (these are public client configs).
- NEVER commit a Firebase **service account JSON** or APNS `.p8` key — these are server-side secrets.
- `patch-package` runs in postinstall — don't bypass it; several native deps require local patches for RN 0.84 + Xcode 16 compatibility.
- `ENABLE_USER_SCRIPT_SANDBOXING` in iOS Xcode project must stay `NO` (Xcode 26 flips it `YES` automatically → Copy Pods Resources fails with sandbox: deny).

## Learn more

- [React Native docs](https://reactnative.dev/docs/getting-started)
- [Monorepo README](https://github.com/acsdeveloper2025/CRM-APP-MONOREPO-PROD#readme) — backend + admin web
- [iOS distribution options](./docs/ios-distribution-options.md) — paid Apple Developer enrollment path
