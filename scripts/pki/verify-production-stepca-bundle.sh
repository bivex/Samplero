#!/usr/bin/env bash
set -euo pipefail

BUNDLE_PATH="${BUNDLE_PATH:-${1:-}}"
WORK_DIR=""

info() { printf '[verify-stepca-bundle] %s\n' "$*"; }
die() { printf '[verify-stepca-bundle][error] %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then rm -rf "$WORK_DIR"; fi; }
trap cleanup EXIT

usage() {
  cat <<EOF
Usage:
  bash scripts/pki/verify-production-stepca-bundle.sh /path/to/stepca-prod-bundle[.tar.gz]
EOF
}

[[ -n "$BUNDLE_PATH" ]] || { usage; exit 1; }
if [[ -d "$BUNDLE_PATH" ]]; then
  BUNDLE_DIR="$BUNDLE_PATH"
elif [[ -f "$BUNDLE_PATH" ]]; then
  WORK_DIR="$(mktemp -d)"
  tar -C "$WORK_DIR" -xzf "$BUNDLE_PATH"
  BUNDLE_DIR="$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
else
  die "Bundle not found: $BUNDLE_PATH"
fi

[[ -n "${BUNDLE_DIR:-}" && -d "$BUNDLE_DIR" ]] || die "Не удалось определить bundle dir"

required=(
  config/ca.json
  certs/root_ca.crt
  certs/intermediate_ca.crt
  certs/ca-chain.crt
  secrets/intermediate_ca_key
  secrets/password
)
for path in "${required[@]}"; do
  [[ -f "$BUNDLE_DIR/$path" ]] || die "Missing required file: $path"
  [[ ! -L "$BUNDLE_DIR/$path" ]] || die "Symbolic links are not allowed in bundle: $path"
done

for forbidden in secrets/root_ca_key secrets/root-ca.key root/root-ca.key root/private/root-ca.key; do
  [[ ! -e "$BUNDLE_DIR/$forbidden" ]] || die "Forbidden root key found in bundle: $forbidden"
done

openssl verify -CAfile "$BUNDLE_DIR/certs/root_ca.crt" "$BUNDLE_DIR/certs/intermediate_ca.crt" >/dev/null
cat "$BUNDLE_DIR/certs/intermediate_ca.crt" "$BUNDLE_DIR/certs/root_ca.crt" > "$BUNDLE_DIR/.expected-chain.crt"
cmp -s "$BUNDLE_DIR/.expected-chain.crt" "$BUNDLE_DIR/certs/ca-chain.crt" || die "ca-chain.crt does not match intermediate+root concatenation"
rm -f "$BUNDLE_DIR/.expected-chain.crt"

info "Bundle structure OK"
info "SHA256 fingerprints:"
for path in certs/root_ca.crt certs/intermediate_ca.crt certs/ca-chain.crt config/ca.json; do
  hash=$(shasum -a 256 "$BUNDLE_DIR/$path" | awk '{print $1}')
  printf '  %s  %s\n' "$hash" "$path"
done
info "Bundle does not contain root key material"
info "Verification successful"

