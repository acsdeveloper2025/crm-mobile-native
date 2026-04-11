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

if [[ $FOUND -eq 1 ]]; then
  echo ""
  echo "See docs/ssl-pinning.md for the rotation procedure, including"
  echo "the openssl command to compute a real SPKI SHA-256 digest."
  exit 1
fi

echo "✅ SSL pin check passed — no placeholders in $CONFIG"
