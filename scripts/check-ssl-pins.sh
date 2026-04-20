#!/usr/bin/env bash
# M30: pre-release guard against placeholder SSL pins.
#
# network_security_config.xml ships fail-loud placeholder pin values
# (AAAA.../BBBB...) that exist on purpose — they are valid SHA-256
# digests that do NOT match the production cert, so a developer who
# forgets to swap them before cutting a release build notices
# immediately when every TLS handshake fails. That's the "fail
# loud" defense; this script is the "don't let it leave the
# laptop" defense.
#
# Exits non-zero when either placeholder is still present in the
# config. Wire into the release pipeline via npm run check-pins
# (see package.json) before ./gradlew assembleRelease.
#
# Exit codes:
#   0  config does not contain placeholder pins — safe to release
#   1  placeholder pins present — abort release
#   2  config file missing — abort release (something is wrong)

set -euo pipefail

CONFIG="android/app/src/main/res/xml/network_security_config.xml"

if [[ ! -f "$CONFIG" ]]; then
  echo "❌ $CONFIG not found"
  echo "   Run this script from the crm-mobile-native root."
  exit 2
fi

# The placeholder pins are distinctive base64 strings of repeated
# letters. Match both explicitly so a half-swap (e.g. only the
# primary rotated, backup forgotten) still fails the check.
PLACEHOLDER_PRIMARY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
PLACEHOLDER_BACKUP="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="

FOUND=0
if grep -qF "$PLACEHOLDER_PRIMARY" "$CONFIG"; then
  echo "❌ Placeholder primary pin still present in $CONFIG"
  echo "   Replace with the current cert's SPKI SHA-256."
  FOUND=1
fi
if grep -qF "$PLACEHOLDER_BACKUP" "$CONFIG"; then
  echo "❌ Placeholder backup pin still present in $CONFIG"
  echo "   Replace with the next rotation cert's SPKI SHA-256."
  FOUND=1
fi

# Go-live hardening: a <pin-set> element MUST be present for the production
# domain. The earlier check blocked only placeholder values, but a config
# with NO pin-set at all also passed — which is exactly the state the config
# is in today (see comment above crm.allcheckservices.com block). Require
# the element itself so disabled pinning cannot ship.
#
# XML comments in this file mention "<pin-set>" in prose, so we strip
# comments first with a perl one-liner (handles multi-line <!-- ... -->)
# and then grep for the real element opener.
STRIPPED=$(perl -0777 -pe 's/<!--.*?-->//gs' "$CONFIG")
if ! grep -q '<pin-set' <<<"$STRIPPED"; then
  echo "❌ No <pin-set> element found in $CONFIG (comments stripped)"
  echo "   Pinning is not enabled. Populate <pin-set> with real SPKI"
  echo "   SHA-256 digests for the current leaf cert plus a rotation backup."
  FOUND=1
fi

# Pin count: require AT LEAST TWO <pin> entries (primary + backup) so a
# single leaf rotation can't brick the app between releases.
PIN_COUNT=$(grep -o '<pin ' <<<"$STRIPPED" | wc -l | tr -d ' ')
if [[ "$PIN_COUNT" -lt 2 ]]; then
  echo "❌ Only $PIN_COUNT <pin> entries found — release policy requires at least 2"
  echo "   (current leaf + backup for rotation safety)."
  FOUND=1
fi

# Pin format: each pin must be a 44-character base64 SHA-256 digest.
# Extract everything between <pin ...>...</pin> (comments already stripped),
# then validate each on its own line.
#
# Valid SHA-256 pins are:
#   • exactly 44 chars
#   • characters A–Z, a–z, 0–9, '+', '/'
#   • end with exactly one '=' (SHA-256 = 32 bytes → 44 b64 chars with 1 pad)
PIN_RE='^[A-Za-z0-9+/]{43}=$'
# Pull each pin's text content (between > and </pin>).
PINS=$(perl -0777 -ne 'while (/<pin[^>]*>([^<]+)<\/pin>/gs) { print "$1\n"; }' <<<"$STRIPPED")
while IFS= read -r pin; do
  pin_trim=$(echo "$pin" | tr -d '[:space:]')
  [[ -z "$pin_trim" ]] && continue
  if ! [[ "$pin_trim" =~ $PIN_RE ]]; then
    echo "❌ Malformed SHA-256 pin: '$pin_trim'"
    echo "   Expected 43 base64 chars + '=' (44 total). Regenerate with"
    echo "   openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin"
    echo "     -outform DER | openssl dgst -sha256 -binary | openssl enc -base64"
    FOUND=1
  fi
done <<<"$PINS"

if [[ $FOUND -eq 1 ]]; then
  echo ""
  echo "See docs/ssl-pinning.md for the rotation procedure, including"
  echo "the openssl command to compute a real SPKI SHA-256 digest."
  exit 1
fi

echo "✅ SSL pin check passed — <pin-set> present (${PIN_COUNT} pins), no placeholders, all digests well-formed."
