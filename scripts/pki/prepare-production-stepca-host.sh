#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT="${SERVER_ROOT:-/srv/samplero-license-server}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
APP_OWNER="${APP_OWNER:-samplero}"
APP_GROUP="${APP_GROUP:-$APP_OWNER}"
ENV_NAME="${ENV_NAME:-prod}"
CREATE_OWNER="${CREATE_OWNER:-0}"

PKI_DIR="$SERVER_ROOT/.docker-pki/$PKI_USER"
CURRENT_LINK="$SERVER_ROOT/.docker-pki/current"
STEP_DIR="$PKI_DIR/step-ca"
INDEX_FILE="$PKI_DIR/index.txt"

info() { printf '[prepare-prod-pki] %s\n' "$*"; }
die() { printf '[prepare-prod-pki][error] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero PKI_USER=prod \
    bash scripts/pki/prepare-production-stepca-host.sh

Optional:
  APP_GROUP=samplero
  ENV_NAME=prod
  CREATE_OWNER=1   # Linux + root only
EOF
}

ensure_owner() {
  if id "$APP_OWNER" >/dev/null 2>&1; then
    return
  fi

  [[ "$CREATE_OWNER" == "1" ]] || die "Пользователь $APP_OWNER не найден. Либо создай его заранее, либо запусти с CREATE_OWNER=1"
  [[ "$(uname -s)" == "Linux" ]] || die "Автосоздание пользователя поддержано только на Linux"
  [[ "$EUID" -eq 0 ]] || die "Для CREATE_OWNER=1 нужен root"

  getent group "$APP_GROUP" >/dev/null 2>&1 || groupadd --system "$APP_GROUP"
  useradd --system --create-home --home-dir "$SERVER_ROOT" --gid "$APP_GROUP" --shell /usr/sbin/nologin "$APP_OWNER"
}

apply_owner() {
  if [[ "$EUID" -eq 0 ]]; then
    chown -hR "$APP_OWNER:$APP_GROUP" "$SERVER_ROOT/.docker-pki"
  elif [[ "$(id -un)" != "$APP_OWNER" ]]; then
    info "Не root и текущий пользователь не совпадает с APP_OWNER=$APP_OWNER. chown пропущен."
  fi
}

[[ "${1:-}" =~ ^(-h|--help|help)$ ]] && { usage; exit 0; }

ensure_owner
mkdir -p "$STEP_DIR/certs" "$STEP_DIR/secrets" "$STEP_DIR/db" "$PKI_DIR/trust"
ln -sfn "$PKI_USER" "$CURRENT_LINK"

touch "$INDEX_FILE"
cat > "$INDEX_FILE" <<EOF
env=$ENV_NAME
pki_user=$PKI_USER
owner=$APP_OWNER
group=$APP_GROUP
server_root=$SERVER_ROOT
root_key_location=offline
step_dir=$STEP_DIR
step_certs_dir=$STEP_DIR/certs
step_secrets_dir=$STEP_DIR/secrets
trust_dir=$PKI_DIR/trust
current_link=$CURRENT_LINK
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
notes=production step-ca host layout prepared
EOF

find "$SERVER_ROOT/.docker-pki" -type d -exec chmod 700 {} +
chmod 600 "$INDEX_FILE"
apply_owner

info "Готово: $PKI_DIR"
info "Текущая активная PKI-папка: $CURRENT_LINK -> $PKI_USER"
info "Дальше установи production bundle через scripts/pki/install-production-stepca-bundle.sh"

