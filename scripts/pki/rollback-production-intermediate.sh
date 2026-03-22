#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDIT_SCRIPT="$REPO_ROOT/scripts/pki/audit-production-stepca-host.sh"
STACK_SCRIPT="$REPO_ROOT/docker/pki-stack.sh"

BACKUP_PATH="${BACKUP_PATH:-${1:-}}"
SERVER_ROOT="${SERVER_ROOT:-$REPO_ROOT}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
START_STACK="${START_STACK:-1}"
PKI_DIR="$SERVER_ROOT/.docker-pki/$PKI_USER"
CURRENT_LINK="$SERVER_ROOT/.docker-pki/current"

info() { printf '[rollback-prod-intermediate] %s\n' "$*"; }
die() { printf '[rollback-prod-intermediate][error] %s\n' "$*" >&2; exit 1; }
usage() { echo "Usage: bash scripts/pki/rollback-production-intermediate.sh /path/to/backup-dir"; }

[[ -n "$BACKUP_PATH" ]] || { usage; exit 1; }
[[ -d "$BACKUP_PATH" ]] || die "Backup dir not found: $BACKUP_PATH"
[[ -f "$BACKUP_PATH/index.txt" ]] || die "Backup dir does not look like a PKI dir: $BACKUP_PATH"

info "Restoring backup from $BACKUP_PATH to $PKI_DIR"
rm -rf "$PKI_DIR"
cp -R "$BACKUP_PATH" "$PKI_DIR"
ln -sfn "$PKI_USER" "$CURRENT_LINK"

SERVER_ROOT="$SERVER_ROOT" PKI_USER="$PKI_USER" bash "$AUDIT_SCRIPT"

if [[ "$START_STACK" == "1" ]]; then
  info "Restarting stack against restored PKI"
  (
    cd "$REPO_ROOT"
    PKI_USER="$PKI_USER" PKI_BACKEND=stepca "$STACK_SCRIPT" up
    PKI_USER="$PKI_USER" PKI_BACKEND=stepca "$STACK_SCRIPT" status
  )
else
  info "START_STACK=0, skipping docker restart"
fi

info "Rollback complete"

