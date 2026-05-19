# iOS Distribution Options

Reference for upgrading the iOS pipeline beyond Stage 1 (CI smoke test only).

## Current state (Stage 1)

- `.github/workflows/ios-build.yml` runs on every push/tag/PR-touching-iOS.
- Builds an **unsigned simulator `.app`** — NOT installable on physical iPhones.
- Uploads the `.app.zip` as a GitHub Actions artifact for download/inspection.
- Zero secrets, zero Apple-account dependency.
- Catches build regressions in CI (same role as the Android workflow).

For installing on real iPhones today, use local Xcode builds with the Personal
Team (signed by `mayurkulkarni786@gmail.com` / team `T44FDJ4UAW`).
Limitations: only registered UDIDs, 7-day provisioning profile expiry.

---

## Stage 2: Signed IPA in CI

Pick the distribution model first; the CI setup follows from that choice.

### Decision matrix

| Option | Annual cost | Setup time | How field agents install | When to pick |
|---|---|---|---|---|
| **A. Apple Developer Individual + TestFlight** | $99 | 1-3 days | Install TestFlight app → tap invite email → tap Install. Needs free Apple ID per agent | **Default choice for <100 internal users.** Standard enterprise pattern |
| **B. Apple Developer Individual + Ad Hoc IPA** | $99 | Days + per-device | You collect each iPhone's UDID, add in Apple portal, rebuild IPA, share link | Only if TestFlight is for some reason blocked. Operationally painful |
| **C. Apple Developer Enterprise + In-House IPA** | $299 + D-U-N-S | 2-6 weeks (Apple verifies the company) | Tap IPA link → install → trust certificate in Settings → VPN & Device Management. No Apple ID, no UDID registration | Large teams, no TestFlight willing. Apple denies most applications now — be ready for that |
| **D. Personal Team + AltStore weekly resign** | $0 | Days + ongoing burden | Each agent installs AltStore + their Apple ID; AltStore re-signs every 7 days | Don't pick. Operational nightmare at >2 devices |

### Recommended: Option A (Individual + TestFlight)

#### One-time enrollment

1. https://developer.apple.com/enroll → pick **Individual** (not Organization)
2. Sign in with your existing Apple ID `mayurkulkarni786@gmail.com`
3. Pay $99 (annual auto-renew)
4. Apple approves usually within 24-48 hours

After enrollment your team identifier changes from Personal Team
`T44FDJ4UAW` to a paid `XXXXXXXXXX` (10-char team ID). Bundle id
`com.crmmobilenative` re-registers automatically when you build.

#### Apple side: register the app

1. App Store Connect → My Apps → "+" → New App → iOS
2. Bundle ID: `com.crmmobilenative` (must match Xcode `PRODUCT_BUNDLE_IDENTIFIER`)
3. Set SKU + Display name "CRM Mobile" + Primary language
4. TestFlight tab → Internal Testing → Create group "Field Agents"
5. Invite team email addresses (each needs a free Apple ID to redeem)

#### CI signing material (GitHub Secrets)

You'll need 3 secrets uploaded to the repo:

1. **`IOS_CERTIFICATE_P12_BASE64`** — your Apple Distribution `.p12` file, base64-encoded.
   ```bash
   # On the Mac that holds the cert in Keychain:
   security export -k login.keychain -t identities -f pkcs12 \
     -P 'YOUR_P12_PASSWORD' -o ~/Desktop/AppleDistribution.p12
   base64 -i ~/Desktop/AppleDistribution.p12 | pbcopy
   # Paste into the GitHub Secret value
   ```

2. **`IOS_CERTIFICATE_P12_PASSWORD`** — the password you typed for the export.

3. **`IOS_PROVISIONING_PROFILE_BASE64`** — the App Store distribution profile,
   downloaded from Apple Developer Portal → Profiles → "iOS App Store" profile
   for `com.crmmobilenative`.
   ```bash
   base64 -i ~/Downloads/CRM_Mobile_AppStore.mobileprovision | pbcopy
   ```

4. **`APPSTORE_CONNECT_API_KEY_BASE64`** — for TestFlight upload (avoids 2FA prompts).
   - Apple Developer → Users and Access → Keys → "+" → Role: App Manager → Download `.p8`
   - Note the Key ID + Issuer ID from the same page
   - `base64 -i ~/Downloads/AuthKey_XXXXXX.p8 | pbcopy`

5. **`APPSTORE_CONNECT_API_KEY_ID`** — the Key ID shown after creation.

6. **`APPSTORE_CONNECT_ISSUER_ID`** — the Issuer ID (long UUID).

#### CI workflow extension

When ready, replace the `build-simulator-app` job in
`.github/workflows/ios-build.yml` with this signed-build pattern (sketch — not
yet active):

```yaml
build-ipa:
  runs-on: macos-15
  if: ${{ github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v') }}
  steps:
    - uses: actions/checkout@v4
    # ... node + ruby setup as in Stage 1 ...

    - name: Import signing certificate
      env:
        P12_BASE64: ${{ secrets.IOS_CERTIFICATE_P12_BASE64 }}
        P12_PASSWORD: ${{ secrets.IOS_CERTIFICATE_P12_PASSWORD }}
      run: |
        echo "$P12_BASE64" | base64 --decode > /tmp/cert.p12
        security create-keychain -p ci ci.keychain
        security default-keychain -s ci.keychain
        security unlock-keychain -p ci ci.keychain
        security import /tmp/cert.p12 -k ci.keychain -P "$P12_PASSWORD" -T /usr/bin/codesign
        security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k ci ci.keychain
        rm /tmp/cert.p12

    - name: Install provisioning profile
      env:
        PROFILE_BASE64: ${{ secrets.IOS_PROVISIONING_PROFILE_BASE64 }}
      run: |
        mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
        echo "$PROFILE_BASE64" | base64 --decode > ~/Library/MobileDevice/Provisioning\ Profiles/CRM_Mobile_AppStore.mobileprovision

    - name: Archive
      working-directory: ios
      run: |
        xcodebuild -workspace CrmMobileNative.xcworkspace \
          -scheme CrmMobileNative \
          -configuration Release \
          -archivePath build/CrmMobileNative.xcarchive \
          archive

    - name: Export IPA
      working-directory: ios
      run: |
        cat > build/ExportOptions.plist <<EOF
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>method</key><string>app-store</string>
          <key>teamID</key><string>YOUR_TEAM_ID</string>
          <key>signingStyle</key><string>manual</string>
        </dict></plist>
        EOF
        xcodebuild -exportArchive \
          -archivePath build/CrmMobileNative.xcarchive \
          -exportOptionsPlist build/ExportOptions.plist \
          -exportPath build/ipa

    - name: Upload to TestFlight
      env:
        API_KEY_BASE64: ${{ secrets.APPSTORE_CONNECT_API_KEY_BASE64 }}
        API_KEY_ID: ${{ secrets.APPSTORE_CONNECT_API_KEY_ID }}
        ISSUER_ID: ${{ secrets.APPSTORE_CONNECT_ISSUER_ID }}
      working-directory: ios/build/ipa
      run: |
        mkdir -p ~/private_keys
        echo "$API_KEY_BASE64" | base64 --decode > ~/private_keys/AuthKey_$API_KEY_ID.p8
        xcrun altool --upload-app -f CrmMobileNative.ipa \
          --type ios \
          --apiKey "$API_KEY_ID" \
          --apiIssuer "$ISSUER_ID"

    - name: Clean keychain
      if: always()
      run: security delete-keychain ci.keychain || true
```

#### Approximate effort

- Enrollment: 1 day waiting for Apple
- Cert/profile/API key setup + secrets upload: 2-3 hours
- CI workflow extension: 1-2 hours (most copy-paste from above)
- TestFlight beta review (first upload only): 24 hours

---

## Stage 3 (much later): App Store release

If/when public distribution is needed, the same TestFlight pipeline extends to
App Store submission via `xcrun altool --upload-app ... --type ios` followed
by App Store Connect manual review (~1-3 days). Most enterprise apps never
need this — TestFlight is the permanent distribution channel.

---

## Don't go here

- **Apple Developer Enterprise Program** — only if you have a registered company
  with D-U-N-S, 100+ employees, and willingness to wait 2-6 weeks for Apple to
  verify your business. Apple now denies most Enterprise applications due to
  past abuse. The "install IPA → trust cert → run" UX you described is what
  Enterprise gives you, but for a small internal team it's overkill and
  carries real revocation risk if Apple decides you misused the program.

- **AltStore / Sideloadly for production use** — fine for personal tinkering,
  unworkable for a team. The 7-day re-sign requirement falls on each user.
