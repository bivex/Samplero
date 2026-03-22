#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERIFY_SCRIPT="$REPO_ROOT/scripts/pki/verify-production-stepca-bundle.sh"
DEPLOY_SCRIPT="$REPO_ROOT/scripts/pki/deploy-production-stepca-server.sh"
AUDIT_SCRIPT="$REPO_ROOT/scripts/pki/audit-production-stepca-host.sh"

BUNDLE_PATH="${BUNDLE_PATH:-${1:-}}"
SERVER_ROOT="${SERVER_ROOT:-$REPO_ROOT}"
PKI_USER_RAW="${PKI_USER:-prod}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-prod}"
APP_OWNER="${APP_OWNER:-samplero}"
APP_GROUP="${APP_GROUP:-$APP_OWNER}"
START_STACK="${START_STACK:-1}"
FORCE_INSTALL="${FORCE_INSTALL:-1}"
BACKUP_ROOT="${BACKUP_ROOT:-$SERVER_ROOT/.docker-pki-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PKI_DIR="$SERVER_ROOT/.docker-pki/$PKI_USER"
BACKUP_DIR="$BACKUP_ROOT/$STAMP-$PKI_USER"
EVIDENCE_FILE="$SERVER_ROOT/.docker-pki/$PKI_USER/rollout-$STAMP.txt"

info() { printf '[rollout-prod-intermediate] %s\n' "$*"; }
die() { printf '[rollout-prod-intermediate][error] %s\n' "$*" >&2; exit 1; }
usage() { echo "Usage: bash scripts/pki/rollout-production-intermediate.sh /path/to/bundle"; }

[[ -n "$BUNDLE_PATH" ]] || { usage; exit 1; }
[[ -e "$BUNDLE_PATH" ]] || die "Bundle not found: $BUNDLE_PATH"
mkdir -p "$BACKUP_ROOT"

info "Verifying bundle before rollout"
bash "$VERIFY_SCRIPT" "$BUNDLE_PATH"

if [[ -d "$PKI_DIR" ]]; then
  info "Backing up current PKI dir to $BACKUP_DIR"
  cp -R "$PKI_DIR" "$BACKUP_DIR"
else
  info "No existing PKI dir for $PKI_USER; skipping backup"
fi

info "Deploying new production intermediate bundle"
(
  cd "$REPO_ROOT"
  SERVER_ROOT="$SERVER_ROOT" APP_OWNER="$APP_OWNER" APP_GROUP="$APP_GROUP" \
  PKI_USER="$PKI_USER" FORCE_INSTALL="$FORCE_INSTALL" START_STACK="$START_STACK" \
  bash "$DEPLOY_SCRIPT" "$BUNDLE_PATH"
)

SERVER_ROOT="$SERVER_ROOT" PKI_USER="$PKI_USER" bash "$AUDIT_SCRIPT"

mkdir -p "$(dirname "$EVIDENCE_FILE")"
cat > "$EVIDENCE_FILE" <<EOF
rolled_out_at=$STAMP
bundle_path=$BUNDLE_PATH
backup_dir=${BACKUP_DIR:-none}
pki_user=$PKI_USER
start_stack=$START_STACK
root_ca_sha256=$(shasum -a 256 "$PKI_DIR/step-ca/certs/root_ca.crt" | awk '{print $1}')
intermediate_ca_sha256=$(shasum -a 256 "$PKI_DIR/step-ca/certs/intermediate_ca.crt" | awk '{print $1}')
ca_chain_sha256=$(shasum -a 256 "$PKI_DIR/step-ca/certs/ca-chain.crt" | awk '{print $1}')
trust_chain_sha256=$(shasum -a 256 "$PKI_DIR/trust/ca-chain.crt" | awk '{print $1}')
EOF

info "Rollout complete"
info "Evidence captured in $EVIDENCE_FILE"
info "Use scripts/pki/rollback-production-intermediate.sh $BACKUP_DIR for rollback if needed"

