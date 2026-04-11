# SSL pinning — operator runbook

Phase E1 ships the kill-switch infrastructure (`PinningConfigService`
on the client, `pinning` block on the `/auth/app-config` response).
This doc covers the platform-specific native configuration that
actually enforces pinning at the TLS layer.

## Rotation invariant

**Always keep at least two pins in every release.** The current
leaf cert's SPKI hash plus a backup. When rotating:

1. Ops mints the next cert (ideally reusing the private key so
   no pin change is needed).
2. If the private key rotates, publish a new app release that
   contains BOTH the old and new pins in `<pin-set>`.
3. Wait until rollout crosses 95% adoption of the new release.
4. Ship a follow-up release with the old pin removed.
5. If Step 2 is skipped, every phone below 95% bricks as soon as
   the server starts presenting the new cert.

## Computing a SPKI SHA-256 pin

Pin the public-key SPKI hash, **not** the cert fingerprint. Reusing
the same private key across renewals is then a no-op.

```bash
# Primary pin (current cert)
openssl s_client -connect crm.allcheckservices.com:443 -servername crm.allcheckservices.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# Backup pin (staging cert / next rotation)
openssl s_client -connect next.crm.allcheckservices.com:443 -servername next.crm.allcheckservices.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Copy the base64 output of each into:

- Android: `android/app/src/main/res/xml/network_security_config.xml`
  inside the `<pin-set>` for the production domain.
- iOS: see the TrustKit section below.
- Backend: `MOBILE_PIN_SHA256S` env var (same base64 values,
  comma-separated). This populates the kill-switch's
  `pinSha256s` array for the runtime relaxation channel.

## Android

Pin enforcement is built into Android via `network_security_config.xml`.
The file already contains placeholder pins. Replace them before
running `./gradlew assembleRelease`:

```bash
# Edit the file
$EDITOR android/app/src/main/res/xml/network_security_config.xml

# Confirm a release build sees the real pins
./gradlew assembleRelease
# Install the APK on a physical device with a real network and
# confirm the app can reach the backend. If you see TLS handshake
# failures in the system log (`adb logcat | grep -i 'trust anchor'`),
# at least one pin is wrong — recompute from the live cert.
```

### Pre-release check (M30)

`scripts/check-ssl-pins.sh` greps the config for the known
placeholder digests and exits non-zero if either is still present.
It is wired into `npm run prerelease` which also runs typecheck
and lint, so the recommended release sequence is:

```bash
npm run prerelease         # fails if placeholders are still in place
./gradlew assembleRelease  # only runs after prerelease succeeds
```

You can also run the check standalone:

```bash
npm run check:ssl-pins
```

Exit code 0 means the config contains no placeholder pins (safe).
Exit code 1 means at least one placeholder is still present
(abort release). Exit code 2 means the config file is missing
(something is structurally wrong — do not release).

The check does NOT verify the pins are correct — only that the
distinctive placeholder strings are gone. Verifying pin
correctness still requires a real TLS handshake against the
production cert; the logcat instructions above are the canonical
way to do that.

## iOS — TrustKit (not yet installed)

iOS has no built-in SPKI pinning equivalent to Android's
`network_security_config.xml`. The recommended library is
[TrustKit](https://github.com/datatheorem/TrustKit).

Install:

```bash
cd ios
pod init   # only if you don't have a Podfile yet
# Add to Podfile target:
#   pod 'TrustKit', '~> 3.0'
pod install
```

Configure in `ios/CrmMobileNative/AppDelegate.mm` (or `.swift`):

```objc
#import <TrustKit/TrustKit.h>

// Inside application:didFinishLaunchingWithOptions:
NSDictionary *trustKitConfig = @{
    kTSKSwizzleNetworkDelegates: @YES,
    kTSKPinnedDomains: @{
        @"crm.allcheckservices.com": @{
            kTSKEnforcePinning: @YES,
            kTSKIncludeSubdomains: @YES,
            kTSKPublicKeyHashes: @[
                @"REPLACE_WITH_PRIMARY_SPKI_SHA256_BASE64",
                @"REPLACE_WITH_BACKUP_SPKI_SHA256_BASE64",
            ],
            kTSKExpirationDate: @"2027-01-01",
        }
    }
};
[TrustKit initSharedInstanceWithConfiguration:trustKitConfig];
```

TrustKit swizzles `NSURLSession` globally, so axios (which bridges
through fetch → NSURLSession under react-native-fetch-blob) picks
up pinning without code changes.

## Runtime kill switch

The backend's `/auth/app-config` response carries a `pinning` block:

```json
{
  "pinning": {
    "enabled": true,
    "pinSha256s": ["<primary>", "<backup>"]
  }
}
```

`PinningConfigService` on the mobile client caches this. When
`enabled` is false, the client should route requests through a
non-pinned transport path. **This is a relaxation channel only** —
you can disable pinning remotely (e.g. if a rotated cert slipped
through the overlap window and phones are failing) but you
cannot enable it on a client that shipped without native pinning
support. The asymmetry prevents a compromised backend from
instructing the client to pin an attacker-controlled key.

Emergency bypass:

```bash
# 1. Set on the backend env and restart
export MOBILE_PINNING_ENABLED=false
pm2 restart crm-backend

# 2. Phones refresh their cached config on next /auth/app-config
#    call (or on next app launch). The native pinning layer stays
#    active, but PinningConfigService.isEnabled() now returns false
#    so request code that honors the flag routes around it.
# 3. Fix the cert issue, set MOBILE_PINNING_ENABLED=true, restart.
```

## Verification

After populating real pins:

1. Install a debug build on a device.
2. Proxy the device through Charles / mitmproxy with the proxy's
   root CA installed in the device's user trust store.
3. Launch the app. Every HTTPS request should FAIL with a TLS
   handshake error, because the proxy's cert has a different SPKI
   than the pinned one. If requests succeed, pinning is not
   actually enforced — check that the `android:networkSecurityConfig`
   attribute is present in `android/app/src/main/AndroidManifest.xml`
   and that TrustKit's `kTSKEnforcePinning` is `@YES`.
4. Remove the proxy and confirm normal traffic works.

## Known gotchas

- Android's pin-set only applies to the `base-config` / `domain-config`
  it's nested in. The current file scopes it to
  `crm.allcheckservices.com` with `includeSubdomains="true"`. Any
  API call to a different domain bypasses pinning — intentional for
  third-party SDK traffic, worth double-checking if you add a new
  API host.
- Certificate renewal with key reuse: no pin change needed. Key
  rotation: pin change REQUIRED.
- A pin hash is not the same thing as the cert fingerprint. If you
  compute the cert SHA-256 instead of the SPKI SHA-256, pinning
  will break on the very first cert renewal.
- `<pin-set expiration="…">` is a soft hint: Android stops enforcing
  the pins past that date and falls back to standard CA validation.
  Keep it a year or so in the future so you have a grace window.
