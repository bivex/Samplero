#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PREPARE_SCRIPT="$REPO_ROOT/scripts/pki/prepare-production-stepca-host.sh"
INSTALL_SCRIPT="$REPO_ROOT/scripts/pki/install-production-stepca-bundle.sh"
STACK_SCRIPT="$REPO_ROOT/docker/pki-stack.sh"

BUNDLE_PATH="${BUNDLE_PATH:-${1:-}}"
SERVER_ROOT="${SERVER_ROOT:-$REPO_ROOT}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
APP_OWNER="${APP_OWNER:-samplero}"
APP_GROUP="${APP_GROUP:-$APP_OWNER}"
ENV_NAME="${ENV_NAME:-prod}"
FORCE_INSTALL="${FORCE_INSTALL:-0}"
START_STACK="${START_STACK:-1}"
SHOW_STATUS="${SHOW_STATUS:-1}"

info() { printf '[deploy-prod-stepca] %s\n' "$*"; }
die() { printf '[deploy-prod-stepca][error] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  APP_OWNER=samplero PKI_USER=prod \
    bash scripts/pki/deploy-production-stepca-server.sh /path/to/stepca-prod-bundle

Environment:
  SERVER_ROOT=<repo root on server>  default: current repo root
  APP_OWNER=<service user>           default: samplero
  APP_GROUP=<service group>          default: APP_OWNER
  PKI_USER=<pki folder name>         default: prod
  ENV_NAME=<env label>               default: prod
  FORCE_INSTALL=1                    overwrite existing step-ca files
  START_STACK=0                      only prepare + install, no docker start
  SHOW_STATUS=0                      skip final docker status
EOF
}

[[ "${1:-}" =~ ^(-h|--help|help)$ ]] && { usage; exit 0; }
[[ -n "$BUNDLE_PATH" ]] || { usage; exit 1; }
[[ -e "$BUNDLE_PATH" ]] || die "Bundle не найден: $BUNDLE_PATH"
[[ -x "$PREPARE_SCRIPT" || -f "$PREPARE_SCRIPT" ]] || die "Не найден $PREPARE_SCRIPT"
[[ -x "$INSTALL_SCRIPT" || -f "$INSTALL_SCRIPT" ]] || die "Не найден $INSTALL_SCRIPT"
[[ -x "$STACK_SCRIPT" || -f "$STACK_SCRIPT" ]] || die "Не найден $STACK_SCRIPT"

REPO_REAL="$(cd "$REPO_ROOT" && pwd -P)"
SERVER_REAL="$(mkdir -p "$SERVER_ROOT" && cd "$SERVER_ROOT" && pwd -P)"
[[ "$REPO_REAL" == "$SERVER_REAL" ]] || die "Этот скрипт ожидает, что SERVER_ROOT совпадает с каталогом репозитория рядом с docker-compose. Сейчас: REPO_ROOT=$REPO_REAL SERVER_ROOT=$SERVER_REAL"

run_prepare() {
  info "Готовлю серверный layout и права в $SERVER_ROOT"
  (
    cd "$REPO_ROOT"
    SERVER_ROOT="$SERVER_ROOT" APP_OWNER="$APP_OWNER" APP_GROUP="$APP_GROUP" \
    PKI_USER="$PKI_USER" ENV_NAME="$ENV_NAME" \
    bash "$PREPARE_SCRIPT"
  )
}

run_install() {
  info "Ставлю production step-ca bundle в .docker-pki/$PKI_USER"
  (
    cd "$REPO_ROOT"
    SERVER_ROOT="$SERVER_ROOT" APP_OWNER="$APP_OWNER" APP_GROUP="$APP_GROUP" \
    PKI_USER="$PKI_USER" ENV_NAME="$ENV_NAME" FORCE="$FORCE_INSTALL" \
    bash "$INSTALL_SCRIPT" "$BUNDLE_PATH"
  )
}

run_up() {
  [[ "$START_STACK" == "1" ]] || { info "START_STACK=0, пропускаю docker start"; return 0; }
  command -v docker >/dev/null 2>&1 || die "docker не найден в PATH"
  info "Поднимаю стек через docker/pki-stack.sh"
  (
    cd "$REPO_ROOT"
    PKI_USER="$PKI_USER" PKI_BACKEND=stepca "$STACK_SCRIPT" up
  )
}

run_status() {
  [[ "$SHOW_STATUS" == "1" && "$START_STACK" == "1" ]] || return 0
  info "Показываю статус контейнеров"
  (
    cd "$REPO_ROOT"
    PKI_USER="$PKI_USER" PKI_BACKEND=stepca "$STACK_SCRIPT" status
  )
}

run_prepare
run_install
run_up
run_status

info "Готово. Следующий шаг: проверить логи strapi / cert-signer / step-ca и прогнать живой smoke."

