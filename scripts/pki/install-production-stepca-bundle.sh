#!/usr/bin/env bash
set -euo pipefail

BUNDLE_PATH="${BUNDLE_PATH:-${1:-}}"
SERVER_ROOT="${SERVER_ROOT:-/srv/samplero-license-server}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
APP_OWNER="${APP_OWNER:-samplero}"
APP_GROUP="${APP_GROUP:-$APP_OWNER}"
ENV_NAME="${ENV_NAME:-prod}"
FORCE="${FORCE:-0}"

PKI_DIR="$SERVER_ROOT/.docker-pki/$PKI_USER"
CURRENT_LINK="$SERVER_ROOT/.docker-pki/current"
STEP_DIR="$PKI_DIR/step-ca"
TRUST_DIR="$PKI_DIR/trust"
INDEX_FILE="$PKI_DIR/index.txt"
WORK_DIR=""

info() { printf '[install-stepca-bundle] %s\n' "$*"; }
die() { printf '[install-stepca-bundle][error] %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<EOF
Usage:
  SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero PKI_USER=prod \
    bash scripts/pki/install-production-stepca-bundle.sh /path/to/stepca-prod-bundle
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
  die "Bundle не найден: $BUNDLE_PATH"
fi

for required in \
  config/ca.json \
  certs/root_ca.crt \
  certs/intermediate_ca.crt \
  secrets/intermediate_ca_key \
  secrets/password; do
  [[ -f "$BUNDLE_DIR/$required" ]] || die "Не найден обязательный файл в bundle: $required"
done
[[ ! -e "$BUNDLE_DIR/secrets/root_ca_key" && ! -e "$BUNDLE_DIR/secrets/root-ca.key" ]] || die "Bundle содержит root key. Такое на сервер ставить нельзя."

if [[ -e "$STEP_DIR/config/ca.json" && "$FORCE" != "1" ]]; then
  die "Production step-ca уже установлен в $STEP_DIR. Используй FORCE=1 только если точно хочешь перезаписать."
fi

rm -rf "$STEP_DIR" "$TRUST_DIR"
mkdir -p "$STEP_DIR/config" "$STEP_DIR/certs" "$STEP_DIR/secrets" "$STEP_DIR/db" "$TRUST_DIR"
ln -sfn "$PKI_USER" "$CURRENT_LINK"

cp "$BUNDLE_DIR/config/ca.json" "$STEP_DIR/config/ca.json"
[[ -f "$BUNDLE_DIR/config/defaults.json" ]] && cp "$BUNDLE_DIR/config/defaults.json" "$STEP_DIR/config/defaults.json"
cp "$BUNDLE_DIR/certs/root_ca.crt" "$STEP_DIR/certs/root_ca.crt"
cp "$BUNDLE_DIR/certs/intermediate_ca.crt" "$STEP_DIR/certs/intermediate_ca.crt"
cp "$BUNDLE_DIR/secrets/intermediate_ca_key" "$STEP_DIR/secrets/intermediate_ca_key"
cp "$BUNDLE_DIR/secrets/password" "$STEP_DIR/secrets/password"
cat "$STEP_DIR/certs/intermediate_ca.crt" "$STEP_DIR/certs/root_ca.crt" > "$STEP_DIR/certs/ca-chain.crt"
cp "$STEP_DIR/certs/ca-chain.crt" "$TRUST_DIR/ca-chain.crt"

openssl verify -CAfile "$STEP_DIR/certs/root_ca.crt" "$STEP_DIR/certs/intermediate_ca.crt"

cat > "$INDEX_FILE" <<EOF
env=$ENV_NAME
pki_user=$PKI_USER
owner=$APP_OWNER
group=$APP_GROUP
server_root=$SERVER_ROOT
root_key_location=offline
bundle_source=$BUNDLE_PATH
step_dir=$STEP_DIR
root_cert=$STEP_DIR/certs/root_ca.crt
intermediate_cert=$STEP_DIR/certs/intermediate_ca.crt
intermediate_key=$STEP_DIR/secrets/intermediate_ca_key
chain_cert=$STEP_DIR/certs/ca-chain.crt
trust_chain=$TRUST_DIR/ca-chain.crt
current_link=$CURRENT_LINK
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
notes=production step-ca bundle installed
EOF

find "$PKI_DIR" -type d -exec chmod 700 {} +
chmod 644 "$STEP_DIR"/certs/*.crt "$TRUST_DIR/ca-chain.crt"
chmod 600 "$STEP_DIR"/secrets/* "$INDEX_FILE"
[[ -f "$STEP_DIR/config/defaults.json" ]] && chmod 644 "$STEP_DIR/config/defaults.json"
chmod 644 "$STEP_DIR/config/ca.json"

if [[ "$EUID" -eq 0 ]]; then
  chown -hR "$APP_OWNER:$APP_GROUP" "$SERVER_ROOT/.docker-pki"
elif [[ "$(id -un)" != "$APP_OWNER" ]]; then
  info "Не root и текущий пользователь не совпадает с APP_OWNER=$APP_OWNER. chown пропущен."
fi

info "Bundle установлен в $PKI_DIR"
info "Теперь можно запускать: PKI_USER=$PKI_USER PKI_BACKEND=stepca ./docker/pki-stack.sh up"

