#!/usr/bin/env bash
set -euo pipefail

PKI_USER_RAW="${PKI_USER:-${SUDO_USER:-${USER:-default}}}"
PKI_USER="$(printf '%s' "$PKI_USER_RAW" | tr -cs '[:alnum:]._-' '-')"
PKI_USER="${PKI_USER:-default}"
PKI_BASE_DIR="${PKI_BASE_DIR:-.docker-pki/$PKI_USER}"
PKI_PARENT_DIR="$(dirname "$PKI_BASE_DIR")"
PKI_CURRENT_LINK="$PKI_PARENT_DIR/current"
INDEX_FILE="$PKI_BASE_DIR/index.txt"
TRUST_DIR="$PKI_BASE_DIR/trust"
TRUST_CHAIN_PATH="$TRUST_DIR/ca-chain.crt"

STEP_DIR="${STEP_DIR:-$PKI_BASE_DIR/step-ca}"
CA_NAME="${STEP_CA_NAME:-Samplero Step CA}"
CA_DNS="${STEP_CA_DNS:-step-ca,localhost,127.0.0.1}"
CA_ADDR="${STEP_CA_ADDRESS:-:9000}"
PROVISIONER="${STEP_CA_PROVISIONER:-samplero-ra}"
PASSWORD="${STEP_CA_PASSWORD:-dev-step-password-change-me}"
FORCE="${FORCE:-0}"

if [[ "$FORCE" != "1" ]] && [[ -f "$STEP_DIR/config/ca.json" ]]; then
  echo "Refusing to overwrite existing step-ca state. Re-run with FORCE=1 if intentional." >&2
  exit 1
fi

rm -rf "$STEP_DIR"
mkdir -p "$PKI_BASE_DIR" "$STEP_DIR/secrets" "$TRUST_DIR"
chmod 700 "$STEP_DIR/secrets"
printf '%s\n' "$PASSWORD" > "$STEP_DIR/secrets/password"
chmod 600 "$STEP_DIR/secrets/password"
ln -sfn "$(basename "$PKI_BASE_DIR")" "$PKI_CURRENT_LINK"

docker run --rm \
  -v "$PWD/$STEP_DIR:/home/step" \
  -v "$PWD/$STEP_DIR/secrets/password:/password.txt:ro" \
  smallstep/step-cli step ca init \
  --name "$CA_NAME" \
  --dns "$CA_DNS" \
  --address "$CA_ADDR" \
  --provisioner "$PROVISIONER" \
  --password-file /password.txt \
  --provisioner-password-file /password.txt

cat "$STEP_DIR/certs/intermediate_ca.crt" "$STEP_DIR/certs/root_ca.crt" > "$STEP_DIR/certs/ca-chain.crt"
rm -f "$TRUST_CHAIN_PATH"
cp "$STEP_DIR/certs/ca-chain.crt" "$TRUST_CHAIN_PATH"

cat > "$INDEX_FILE" <<EOF
user=$PKI_USER
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
step_dir=$STEP_DIR
provisioner=$PROVISIONER
root_cert=$STEP_DIR/certs/root_ca.crt
intermediate_cert=$STEP_DIR/certs/intermediate_ca.crt
chain_cert=$STEP_DIR/certs/ca-chain.crt
trust_chain=$TRUST_CHAIN_PATH
password_file=$STEP_DIR/secrets/password
current_link=$PKI_CURRENT_LINK
EOF

echo "step-ca initialized in $STEP_DIR"
echo "Provisioner: $PROVISIONER"
echo "Chain bundle: $STEP_DIR/certs/ca-chain.crt"
echo "Per-user PKI index: $INDEX_FILE"
echo "Shared current link: $PKI_CURRENT_LINK"

