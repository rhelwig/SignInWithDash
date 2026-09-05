#!/usr/bin/env bash
# Sign already-built APKs. The release key lives outside the repository.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNING_DIR="${SIWD_SIGNING_DIR:-$ROOT/../.secrets/siwd-release}"
ANDROID_TOOLS="${SIWD_ANDROID_BUILD_TOOLS:-$HOME/Android/Sdk/build-tools/35.0.0}"
OUT="$ROOT/apps/android-authenticator/app/build/outputs/signed"
umask 077
mkdir -p "$SIGNING_DIR" "$OUT"
if [ ! -f "$SIGNING_DIR/release.p12" ]; then
  if [ -f "$SIGNING_DIR/password" ]; then
    echo "Signing password exists without a key; inspect before generating a replacement." >&2
    exit 1
  fi
  openssl rand -base64 48 > "$SIGNING_DIR/password"
  keytool -genkeypair -keystore "$SIGNING_DIR/release.p12" -storetype PKCS12 \
    -storepass:file "$SIGNING_DIR/password" -keypass:file "$SIGNING_DIR/password" \
    -alias siwd-release -keyalg RSA -keysize 4096 -validity 10000 \
    -dname 'CN=SIWD Authenticator Release, O=Sign in with Dash'
fi
for network in Mainnet Testnet; do
  source="$ROOT/apps/android-authenticator/app/build/outputs/apk/dash$network/release/app-dash$network-release-unsigned.apk"
  target="$OUT/siwd-authenticator-${network,,}-release.apk"
  "$ANDROID_TOOLS/zipalign" -f -p 4 "$source" "$OUT/aligned.apk"
  "$ANDROID_TOOLS/apksigner" sign --ks "$SIGNING_DIR/release.p12" --ks-key-alias siwd-release \
    --ks-pass "file:$SIGNING_DIR/password" \
    --out "$target" "$OUT/aligned.apk"
  "$ANDROID_TOOLS/apksigner" verify --verbose --print-certs "$target"
  sha256sum "$target" > "$target.sha256"
done
