#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT="${SERVER_ROOT:-/srv/samplero-license-server}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
PKI_DIR="$SERVER_ROOT/.docker-pki/$PKI_USER"
STEP_DIR="$PKI_DIR/step-ca"
TRUST_DIR="$PKI_DIR/trust"
INDEX_FILE="$PKI_DIR/index.txt"
CURRENT_LINK="$SERVER_ROOT/.docker-pki/current"

info() { printf '[audit-prod-pki] %s\n' "$*"; }
die() { printf '[audit-prod-pki][error] %s\n' "$*" >&2; exit 1; }
perm_of() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }
assert_mode_le() { local path="$1" max="$2" mode; mode=$(perm_of "$path"); ((10#$mode <= 10#$max)) || die "Permissions too open on $path: $mode > $max"; }

required=(
  "$STEP_DIR/config/ca.json"
  "$STEP_DIR/certs/root_ca.crt"
  "$STEP_DIR/certs/intermediate_ca.crt"
  "$STEP_DIR/certs/ca-chain.crt"
  "$STEP_DIR/secrets/intermediate_ca_key"
  "$STEP_DIR/secrets/password"
  "$TRUST_DIR/ca-chain.crt"
  "$INDEX_FILE"
)
for path in "${required[@]}"; do
  [[ -f "$path" ]] || die "Missing required file: $path"
done

find "$PKI_DIR" -type f \( -name '*root*key*' -o -name 'root_ca_key' -o -name 'root-ca.key' \) | grep . && die "Root key material found under $PKI_DIR" || true
[[ -L "$TRUST_DIR/ca-chain.crt" ]] && die "trust/ca-chain.crt must be a real file, not a symlink"
[[ -L "$CURRENT_LINK" ]] || die "Missing current symlink: $CURRENT_LINK"
[[ "$(readlink "$CURRENT_LINK")" == "$PKI_USER" ]] || die "current symlink does not point to $PKI_USER"

openssl verify -CAfile "$STEP_DIR/certs/root_ca.crt" "$STEP_DIR/certs/intermediate_ca.crt" >/dev/null
cmp -s "$STEP_DIR/certs/ca-chain.crt" "$TRUST_DIR/ca-chain.crt" || die "trust chain mismatch between step-ca and trust dirs"

while IFS= read -r dir; do assert_mode_le "$dir" 700; done < <(find "$PKI_DIR" -type d)
assert_mode_le "$STEP_DIR/secrets/intermediate_ca_key" 600
assert_mode_le "$STEP_DIR/secrets/password" 600
assert_mode_le "$INDEX_FILE" 600
assert_mode_le "$STEP_DIR/certs/root_ca.crt" 644
assert_mode_le "$STEP_DIR/certs/intermediate_ca.crt" 644
assert_mode_le "$STEP_DIR/certs/ca-chain.crt" 644
assert_mode_le "$TRUST_DIR/ca-chain.crt" 644
assert_mode_le "$STEP_DIR/config/ca.json" 644

info "Host PKI layout OK: $PKI_DIR"
for path in "$STEP_DIR/certs/root_ca.crt" "$STEP_DIR/certs/intermediate_ca.crt" "$STEP_DIR/certs/ca-chain.crt" "$TRUST_DIR/ca-chain.crt"; do
  hash=$(shasum -a 256 "$path" | awk '{print $1}')
  printf '  %s  %s\n' "$hash" "${path#$SERVER_ROOT/}"
done
info "Audit successful"

