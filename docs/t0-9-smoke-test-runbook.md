# T0-9 iOS pinning — smoke test runbook

**Goal:** prove the `NSPinnedDomains` entry added in commit `c2a7261` actually rejects a MITM attempt against `crm.allcheckservices.com`. Once verified, tag `v1.0.56` and ship.

**Status entering this runbook:**
- Code committed on `crm-mobile-native` main as `c2a7261` (4 files: Info.plist, docs/ssl-pinning.md, src/api/apiClient.ts, package.json).
- Android pinning was already proven in production via Phase E1 (2026-04-19) — same two SPKI hashes are reused on iOS.
- Pin values verified against the live cert via `openssl s_client` on 2026-05-18.
- `package.json` already bumped 1.0.55 → 1.0.56. **Not yet tagged.**

This runbook should take ~15-25 minutes of your time.

---

## Pre-flight (one-time setup, may already be done)

### 1. mitmproxy installed
```bash
which mitmproxy
# Expected: /opt/homebrew/bin/mitmproxy (or /usr/local/bin/mitmproxy on Intel)
```
If missing, install:
```bash
brew install mitmproxy
```

### 2. iOS 26.5 device support files installed
The download was kicked off via `xcodebuild -downloadPlatform iOS` on 2026-05-18 ~15:21 (PID 8654). Confirm:
```bash
ls ~/Library/Developer/Xcode/iOS\ DeviceSupport/ | grep 26.5
# Expected: iPhone15,5 26.5 (some build number)
```
If not yet there, the download is still running or stalled. Restart it:
```bash
xcodebuild -downloadPlatform iOS
```
This is multi-GB; on a 100 Mbps connection it takes 5-15 minutes.

### 3. iPhone paired + unlocked + trusted
```bash
xcrun devicectl list devices
# Expected: "Mayur iphone" with state "available (paired)"
```
If state is `available (busy)` or `connecting`: unlock the phone screen, plug it in via cable (or restart Settings > General > VPN & Device Management to clear). If you get a "Trust This Computer?" dialog, tap Trust + enter passcode.

---

## Step 1 — Build the app (5-10 min cold, <1 min incremental)

```bash
cd ~/Downloads/CRM-APP-MONOREPO-PROD/crm-mobile-native

xcodebuild \
  -workspace ios/CrmMobileNative.xcworkspace \
  -scheme CrmMobileNative \
  -configuration Debug \
  -destination 'platform=iOS,id=9779E688-6826-5580-AE40-7356E7563ECA' \
  -allowProvisioningUpdates \
  -derivedDataPath /tmp/crm-ios-build \
  CODE_SIGN_STYLE=Automatic \
  build
```

The device id `9779E688-…3ECA` is your "Mayur iphone" CoreDevice id (from `xcrun devicectl list devices`).

**Build success** = no "BUILD FAILED" line and `xcodebuild exit 0`. The `.app` lands at `/tmp/crm-ios-build/Build/Products/Debug-iphoneos/CrmMobileNative.app`.

**Common failure** = "iOS 26.5 is not installed" → Pre-flight step 2 didn't complete.

---

## Step 2 — Install on iPhone (10 sec)

```bash
xcrun devicectl device install app \
  --device 9779E688-6826-5580-AE40-7356E7563ECA \
  /tmp/crm-ios-build/Build/Products/Debug-iphoneos/CrmMobileNative.app
```

You should see CrmMobileNative app icon appear on the iPhone home screen.

First launch may fail with "Untrusted Developer" — on iPhone:
1. Settings → General → VPN & Device Management
2. Find your Apple ID under "Developer App"
3. Tap "Trust [your email]"
4. Re-launch CrmMobileNative

---

## Step 3 — Start Metro bundler (Debug mode needs it)

In a separate terminal:
```bash
cd ~/Downloads/CRM-APP-MONOREPO-PROD/crm-mobile-native
npx react-native start
```

Leave this running for the rest of the runbook. The iPhone connects to your Mac's Metro on port 8081 — both must be on the same WiFi.

---

## Step 4 — Baseline: app works without MITM (sanity check)

1. Launch the app on iPhone
2. Login with any test user (e.g. `pradnya.mohite`)
3. Dashboard should load tasks/cases normally
4. **Result expected:** login succeeds, data loads. This proves pinning isn't breaking legitimate traffic.

If the app stalls at "Connecting..." or shows TLS errors → the pin is wrong / SPKI changed since 2026-05-18. Stop here and re-grep the cert:
```bash
echo | openssl s_client -servername crm.allcheckservices.com \
    -connect crm.allcheckservices.com:443 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | base64
```
Compare against `NSPinnedDomains` in Info.plist.

---

## Step 5 — The actual pinning test: MITM proxy attempt

### 5a. Start mitmproxy on Mac

```bash
mitmproxy --listen-port 8080
```

This starts mitmproxy on `localhost:8080`. It generates its own CA on first run at `~/.mitmproxy/mitmproxy-ca-cert.pem`.

### 5b. Install mitmproxy CA on iPhone

1. On iPhone, **temporarily switch to WiFi that routes through your Mac** — OR just use your phone's WiFi normally for the CA-install step.
2. Open Safari → navigate to `http://mitm.it` (this site only serves while mitmproxy is running)
3. Tap "Apple" — Safari downloads the `mitmproxy-ca-cert.pem` profile
4. Settings → General → VPN & Device Management → Downloaded Profile → tap "mitmproxy" → Install (enter passcode) → Install again
5. Settings → General → About → Certificate Trust Settings → **Enable Full Trust for "mitmproxy"** ← THIS IS THE STEP THAT MAKES THE PROXY ACTUALLY DECRYPT

### 5c. Route iPhone WiFi through mitmproxy

1. Settings → WiFi → tap ⓘ next to your WiFi network
2. Scroll down → "Configure Proxy" → Manual
3. Server: `192.168.0.6` (your Mac LAN IP — already confirmed at runbook-write time)
4. Port: `8080`
5. Save

If your Mac IP has changed since this runbook was written, run:
```bash
ipconfig getifaddr en0
```

### 5d. Launch the app and observe

1. Force-quit CrmMobileNative on iPhone (swipe up from app switcher)
2. Re-launch CrmMobileNative
3. Try to login

**Two possible outcomes:**

| Outcome | Pinning state | T0-9 status |
|---|---|---|
| Login **fails** with TLS handshake error / "Network request failed" / "Cannot connect to server" | ✅ Pinning is enforcing. The mitmproxy CA was trusted on the device, so iOS's normal TLS chain validation passes — but `NSPinnedDomains` rejects because the SPKI hash of the mitmproxy cert doesn't match the pin. | **PASS — T0-9 closed** |
| Login **succeeds** + mitmproxy console shows decrypted JSON traffic | ❌ Pinning is NOT enforcing. Either `NSPinnedDomains` has a typo, the domain key doesn't match, or iOS silently ignored the block. | **FAIL — investigate** |

**On PASS:** also check the mitmproxy console — you should see `crm.allcheckservices.com:443 client connection error: tls handshake closed` or similar.

**On FAIL:** Apple silently ignores misconfigured `NSPinnedDomains` blocks (no error log). Check:
- Domain key spelling exactly matches `crm.allcheckservices.com`
- `NSIncludesSubdomains` is `<true/>` not `<string>true</string>`
- `SPKI-SHA256-BASE64` keys (case-sensitive) inside `NSPinnedCAIdentities`
- `NSPinnedDomains` is nested INSIDE the `NSAppTransportSecurity` dict, not at top level

---

## Step 6 — Cleanup (important!)

After verification:

1. Remove the WiFi proxy: Settings → WiFi → ⓘ → Configure Proxy → Off
2. Remove the mitmproxy CA trust: Settings → General → About → Certificate Trust Settings → disable mitmproxy
3. Remove the mitmproxy profile: Settings → General → VPN & Device Management → mitmproxy → Remove Profile
4. Kill mitmproxy on Mac: `q` then `y` inside the mitmproxy TUI
5. Stop Metro: Ctrl+C in the metro terminal

---

## Step 7 — Tag the release (PASS case only)

If Step 5 returned the PASS outcome:

```bash
cd ~/Downloads/CRM-APP-MONOREPO-PROD/crm-mobile-native
git tag -a v1.0.56 -m "iOS NSPinnedDomains pinning (T0-9)"
git push origin v1.0.56
```

This triggers the existing `android-release.yml` GH Actions workflow to produce a signed APK published to GH Releases.

For iOS distribution, you handle that via your normal channel (TestFlight / direct IPA).

---

## On Apple silently ignoring pin block

This is the only failure mode that's not loud. If Step 5 fails (login succeeds with MITM active), it's almost always one of:

1. **Typo in domain key.** Must be exact lowercase `crm.allcheckservices.com`.
2. **Wrong nesting.** `NSPinnedDomains` MUST be inside the `NSAppTransportSecurity` dict.
3. **Wrong CA key array name.** Apple expects `NSPinnedCAIdentities` (not `NSPinnedLeafIdentities` which exists but for a different purpose).
4. **Wrong SPKI base64 key.** Each cert dict must use the exact key `SPKI-SHA256-BASE64` (case sensitive).
5. **App was launched before profile was trusted.** Force-quit and re-launch after every trust change.

Reference: <https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nspinneddomains>

---

## On AWS cutover (future)

When prod moves from `49.50.119.155` (staging) to AWS:

| If AWS uses | Pin impact | Action |
|---|---|---|
| Let's Encrypt (Certbot on EC2) | None — LE R13 intermediate pin still validates | No app change |
| ACM (Amazon Cert Manager) | Pin breaks | Ship v1.0.57 ~1-2 weeks BEFORE DNS cutover, adding Amazon Root CA 1 SPKI as a THIRD pin in BOTH Info.plist + network_security_config.xml. After cutover stable, ship v1.0.58 dropping the LE intermediate. |
| Cloudflare proxy | Pin to Cloudflare's intermediate | Same triple-release dance as ACM |

See `docs/ssl-pinning.md` for the full rotation procedure.
