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

# Live SPKI match against the VERIFIED chain — the 2026-07-04 AWS ACM cutover
# lesson. Every check above passes for a well-formed pin that no longer matches
# the live cert, which is exactly how a stale pin shipped in v1.0.76/v1.0.77 and
# bricked prod against AWS. Here we fetch the served chain for prod + staging,
# reconstruct the VERIFIED chain (served certs + the trust-store anchor root, so
# durable ROOT pins are covered even when the server doesn't send the root), and
# require at least one pinned SPKI to appear in it.
#
# Robustness: an unreachable host WARNs (network/CI blip is not a failure); an
# unresolvable anchor (no CA bundle) with no served-chain match WARNs (can't be
# sure); only a fully-resolved chain that matches NO pin FAILS. Set
# SKIP_SSL_PIN_LIVE=1 to skip entirely (offline dev).
if [[ "${SKIP_SSL_PIN_LIVE:-0}" != "1" ]]; then
  PINS_CSV=$(tr -s '[:space:]' '\n' <<<"$PINS" | grep -E '.' | paste -sd, -)
  if ! python3 - "$PINS_CSV" <<'PY'
import sys, subprocess, base64, hashlib, re, os
pinned = {p for p in sys.argv[1].split(',') if p}
HOSTS = ['crm.allcheckservices.com', 'staging.crm.allcheckservices.com']
CA_CANDIDATES = [
    '/etc/ssl/certs/ca-certificates.crt',        # Debian/Ubuntu (CI)
    '/etc/pki/tls/certs/ca-bundle.crt',          # RHEL/Fedora
    '/usr/local/etc/ca-certificates/cert.pem',   # Homebrew (Intel mac)
    '/opt/homebrew/etc/ca-certificates/cert.pem',# Homebrew (Apple silicon)
]
ca_bundle = next((p for p in CA_CANDIDATES if os.path.exists(p)), None)

def _run(args, inp):
    return subprocess.run(args, input=inp, capture_output=True).stdout

def spki(pem):  # pem: bytes -> base64 SPKI SHA-256
    pub = _run(['openssl', 'x509', '-pubkey', '-noout'], pem)
    der = _run(['openssl', 'pkey', '-pubin', '-outform', 'der'], pub)
    return base64.b64encode(hashlib.sha256(der).digest()).decode()

def field(pem, flag):  # -subject / -issuer -> normalized DN string
    out = _run(['openssl', 'x509', '-noout', flag], pem).decode()
    return out.split('=', 1)[1].strip() if '=' in out else out.strip()

def served(host):
    try:
        out = subprocess.run(
            ['openssl', 's_client', '-connect', f'{host}:443',
             '-servername', host, '-showcerts'],
            input=b'', capture_output=True, timeout=15,
        ).stdout.decode('utf-8', 'ignore')
    except Exception:
        return None
    return re.findall(
        r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', out, re.S) or None

def anchor(top_issuer):  # SPKI of the trust-store root that issued the top served cert
    if not ca_bundle:
        return None
    data = open(ca_bundle, 'rb').read().decode('utf-8', 'ignore')
    for c in re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', data, re.S):
        cb = c.encode()
        if field(cb, '-subject') == top_issuer:
            return spki(cb)
    return None

fail = False
for h in HOSTS:
    certs = served(h)
    if certs is None:
        print(f"   ⚠️  {h}: unreachable — skipped (not a failure)")
        continue
    verified = {spki(c.encode()) for c in certs}
    top = certs[-1].encode()
    top_issuer, top_subject = field(top, '-issuer'), field(top, '-subject')
    a = None
    if top_issuer != top_subject:            # root not self-sent -> resolve anchor
        a = anchor(top_issuer)
        if a:
            verified.add(a)
    if pinned & verified:
        print(f"   ✅ {h}: a pinned SPKI is in the verified chain")
    elif a is None and top_issuer != top_subject:
        print(f"   ⚠️  {h}: no pin in the served chain and anchor unresolved "
              f"(no CA bundle?) — can't confirm; served SPKIs: {sorted(verified)}")
    else:
        print(f"   ❌ {h}: NONE of the pinned SPKIs match the verified chain")
        print(f"      verified chain SPKIs: {sorted(verified)}")
        fail = True
sys.exit(1 if fail else 0)
PY
  then
    echo "❌ Live pin match FAILED — a pinned SPKI no longer matches the served cert."
    echo "   The cert rotated to a chain none of the pins cover (an infra/CA move,"
    echo "   e.g. the 2026-07-04 AWS ACM cutover). Repin <pin-set> to the new"
    echo "   durable root SPKI — see docs/ssl-pinning.md."
    FOUND=1
  fi
fi

if [[ $FOUND -eq 1 ]]; then
  echo ""
  echo "See docs/ssl-pinning.md for the rotation procedure, including"
  echo "the openssl command to compute a real SPKI SHA-256 digest."
  exit 1
fi

echo "✅ SSL pin check passed — <pin-set> present (${PIN_COUNT} pins), no placeholders, all digests well-formed, live verified-chain match OK."
