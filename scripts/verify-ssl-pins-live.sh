#!/usr/bin/env bash
# Verify the SPKI SHA-256 pins in network_security_config.xml against the
# CURRENT live cert chain served by crm.allcheckservices.com.
#
# Guard usage:
#   • Run as part of CI pre-release (after check-ssl-pins.sh passes).
#   • Exits 0 if the primary pin matches the live leaf SPKI digest.
#   • Exits 1 if the leaf cert has rotated and the app config is stale.
#   • Also warns (non-fatal) if the backup pin no longer matches the
#     live intermediate — rotation of LE intermediates is slow but
#     does happen.
#
# Run from crm-mobile-native root.
set -euo pipefail

CONFIG="android/app/src/main/res/xml/network_security_config.xml"
HOST="crm.allcheckservices.com"
PORT=443

if [[ ! -f "$CONFIG" ]]; then
  echo "❌ $CONFIG not found — run from crm-mobile-native root."
  exit 2
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 1. Pull live chain.
openssl s_client -connect "$HOST:$PORT" -servername "$HOST" -showcerts </dev/null \
  2>/dev/null > "$WORK/chain.txt"

# 2. Split into leaf + intermediate + ...
awk 'BEGIN{n=0}
     /-----BEGIN CERTIFICATE-----/{n++; f="'"$WORK"'/cert"n".pem"}
     /-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/{print > f}' \
     "$WORK/chain.txt"

if [[ ! -f "$WORK/cert1.pem" ]]; then
  echo "❌ Could not fetch leaf cert from $HOST:$PORT"
  exit 2
fi

compute_pin() {
  openssl x509 -in "$1" -pubkey -noout \
    | openssl pkey -pubin -outform DER \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
}

LIVE_LEAF=$(compute_pin "$WORK/cert1.pem")
LIVE_INT=""
if [[ -f "$WORK/cert2.pem" ]]; then
  LIVE_INT=$(compute_pin "$WORK/cert2.pem")
fi

# 3. Extract pins from config (strip comments to avoid matching prose).
STRIPPED=$(perl -0777 -pe 's/<!--.*?-->//gs' "$CONFIG")
CONFIG_PINS=$(perl -0777 -ne \
  'while (/<pin[^>]*>([^<]+)<\/pin>/gs) { $p=$1; $p=~s/\s//g; print "$p\n"; }' \
  <<<"$STRIPPED")

echo "=== Live leaf SPKI      : $LIVE_LEAF"
echo "=== Live intermediate   : ${LIVE_INT:-<none>}"
echo "=== Pins in config      :"
echo "$CONFIG_PINS" | sed 's/^/    /'
echo ""

PRIMARY_OK=0
BACKUP_OK=0
while IFS= read -r pin; do
  [[ -z "$pin" ]] && continue
  if [[ "$pin" == "$LIVE_LEAF" ]]; then PRIMARY_OK=1; fi
  if [[ -n "$LIVE_INT" && "$pin" == "$LIVE_INT" ]]; then BACKUP_OK=1; fi
done <<<"$CONFIG_PINS"

EXIT=0
if [[ "$PRIMARY_OK" -eq 1 ]]; then
  echo "✅ Primary match — configured pin covers current live leaf."
else
  echo "❌ NO configured pin matches the live leaf. The leaf has rotated OR the config is wrong."
  echo "   Replace the primary <pin> with:"
  echo "       $LIVE_LEAF"
  EXIT=1
fi

if [[ -n "$LIVE_INT" ]]; then
  if [[ "$BACKUP_OK" -eq 1 ]]; then
    echo "✅ Backup match — configured pin covers current live intermediate."
  else
    echo "⚠️  WARN: no configured pin matches the live intermediate."
    echo "   LE intermediate may have rotated. Update backup pin to:"
    echo "       $LIVE_INT"
    # Non-fatal — backup drift is a warning, not a release blocker.
  fi
fi

exit $EXIT
