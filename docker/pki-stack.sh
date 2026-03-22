#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_BASE="$SCRIPT_DIR/docker-compose.yml"
COMPOSE_STEPCA="$SCRIPT_DIR/docker-compose.stepca.yml"
BOOTSTRAP_INTERMEDIATE="$REPO_ROOT/scripts/pki/bootstrap-intermediate-ca.sh"
BOOTSTRAP_STEPCA="$REPO_ROOT/scripts/pki/bootstrap-step-ca.sh"
ACTION="${1:-help}"
shift || true
EXTRA_ARGS=("$@")
PKI_BACKEND="${PKI_BACKEND:-stepca}"
PKI_USER_RAW="${PKI_USER:-${SUDO_USER:-${USER:-default}}}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-default}"
PKI_BASE_DIR="$REPO_ROOT/.docker-pki/$PKI_USER"
PKI_CURRENT_LINK="$REPO_ROOT/.docker-pki/current"
PKI_TRUST_DIR="$PKI_BASE_DIR/trust"
PKI_TRUST_CHAIN="$PKI_TRUST_DIR/ca-chain.crt"
info() {
  printf '[pki-stack] %s\n' "$*"
}
die() {
  printf '[pki-stack][error] %s\n' "$*" >&2
  exit 1
}
usage() {
  cat <<EOF
Usage:
  docker/pki-stack.sh init-intermediate
  docker/pki-stack.sh init-stepca
  docker/pki-stack.sh up
  docker/pki-stack.sh down
  docker/pki-stack.sh restart
  docker/pki-stack.sh status
  docker/pki-stack.sh logs [service]

Environment:
  PKI_BACKEND=stepca|local   (default: stepca)
  PKI_USER=<name>            (default: current shell user)
EOF
}
require_docker() {
  command -v docker >/dev/null 2>&1 || die 'docker не найден в PATH'
}
set_current_link() {
  mkdir -p "$REPO_ROOT/.docker-pki" "$PKI_BASE_DIR"
  ln -sfn "$(basename "$PKI_BASE_DIR")" "$PKI_CURRENT_LINK"
  info "Активная PKI-папка: $PKI_CURRENT_LINK -> $(basename "$PKI_BASE_DIR")"
}
init_intermediate() {
  set_current_link
  if [[ -f "$PKI_BASE_DIR/intermediate/ca-chain.crt" ]]; then
    info "Промежуточный сертификат уже есть: $PKI_BASE_DIR/intermediate"
    return
  fi

  info "Генерирую локальный root + intermediate рядом с docker-compose"
  (
    cd "$REPO_ROOT"
    PKI_USER="$PKI_USER" PKI_BASE_DIR=".docker-pki/$PKI_USER" bash "$BOOTSTRAP_INTERMEDIATE"
  )
}

init_stepca() {
  set_current_link
  if [[ -f "$PKI_BASE_DIR/step-ca/config/ca.json" ]]; then
    ensure_trust_chain
    info "Состояние step-ca уже есть: $PKI_BASE_DIR/step-ca"
    return
  fi

  info "Инициализирую step-ca рядом с docker-compose"
  (
    cd "$REPO_ROOT"
    PKI_USER="$PKI_USER" PKI_BASE_DIR=".docker-pki/$PKI_USER" bash "$BOOTSTRAP_STEPCA"
  )
}

ensure_trust_chain() {
  mkdir -p "$PKI_TRUST_DIR"

  if [[ "$PKI_BACKEND" == "stepca" ]]; then
    local source_chain="$PKI_BASE_DIR/step-ca/certs/ca-chain.crt"
  else
    local source_chain="$PKI_BASE_DIR/intermediate/ca-chain.crt"
  fi

  if [[ ! -f "$source_chain" ]]; then
    die "Не найден trust chain source: $source_chain"
  fi

  rm -f "$PKI_TRUST_CHAIN"
  cp "$source_chain" "$PKI_TRUST_CHAIN"
}

compose_args() {
  if [[ "$PKI_BACKEND" == "stepca" ]]; then
    printf '%s\n' "-f" "$COMPOSE_BASE" "-f" "$COMPOSE_STEPCA"
  elif [[ "$PKI_BACKEND" == "local" ]]; then
    printf '%s\n' "-f" "$COMPOSE_BASE"
  else
    die "Неизвестный PKI_BACKEND: $PKI_BACKEND"
  fi
}

compose_cmd() {
  mapfile -t args < <(compose_args)
  (
    cd "$SCRIPT_DIR"
    export PKI_USER
    export PKI_BACKEND
    docker compose "${args[@]}" "$@"
  )
}

ensure_assets() {
  if [[ "$PKI_BACKEND" == "stepca" ]]; then
    init_stepca
  else
    init_intermediate
  fi

  ensure_trust_chain
}

case "$ACTION" in
  init-intermediate)
    init_intermediate
    ;;
  init-stepca)
    init_stepca
    ;;
  up)
    require_docker
    ensure_assets
    info "Поднимаю стек через docker compose"
    compose_cmd up -d --build "${EXTRA_ARGS[@]}"
    ;;
  down)
    require_docker
    set_current_link
    info "Останавливаю стек"
    compose_cmd down "${EXTRA_ARGS[@]}"
    ;;
  restart)
    require_docker
    ensure_assets
    info "Перезапускаю стек"
    compose_cmd restart "${EXTRA_ARGS[@]}" || compose_cmd up -d --build
    ;;
  status)
    require_docker
    set_current_link
    compose_cmd ps
    ;;
  logs)
    require_docker
    set_current_link
    compose_cmd logs -f "${EXTRA_ARGS[@]}"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    die "Неизвестная команда: $ACTION"
    ;;
esac

