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

ROOT_DIR="${ROOT_DIR:-$PKI_BASE_DIR/root}"
INT_DIR="${INT_DIR:-$PKI_BASE_DIR/intermediate}"
ROOT_DAYS="${ROOT_DAYS:-3650}"
INTERMEDIATE_DAYS="${INTERMEDIATE_DAYS:-1825}"
ROOT_CN="${ROOT_CN:-Samplero Offline Root CA}"
INT_CN="${INT_CN:-Samplero Runtime Intermediate CA}"
FORCE="${FORCE:-0}"

ROOT_CERT="$ROOT_DIR/root-ca.crt"
ROOT_KEY="$ROOT_DIR/private/root-ca.key"
INT_CERT="$INT_DIR/intermediate-ca.crt"
INT_KEY="$INT_DIR/private/intermediate-ca.key"
INT_CSR="$INT_DIR/intermediate-ca.csr"
CHAIN_CERT="$INT_DIR/ca-chain.crt"
ROOT_SERIAL="$ROOT_DIR/root-ca.srl"

if [[ "$FORCE" != "1" ]] && [[ -f "$ROOT_CERT" || -f "$INT_CERT" ]]; then
  echo "Refusing to overwrite existing PKI assets. Re-run with FORCE=1 if intentional." >&2
  exit 1
fi

if [[ "$FORCE" == "1" ]]; then
  rm -rf "$ROOT_DIR" "$INT_DIR"
fi

mkdir -p "$PKI_BASE_DIR" "$ROOT_DIR/private" "$INT_DIR/private" "$TRUST_DIR"
chmod 700 "$ROOT_DIR/private" "$INT_DIR/private"
ln -sfn "$(basename "$PKI_BASE_DIR")" "$PKI_CURRENT_LINK"

root_cfg="$(mktemp)"
int_req_cfg="$(mktemp)"
int_ext_cfg="$(mktemp)"
trap 'rm -f "$root_cfg" "$int_req_cfg" "$int_ext_cfg"' EXIT

cat > "$root_cfg" <<EOF
[ req ]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no
[ dn ]
CN = $ROOT_CN
[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true, pathlen:1
keyUsage = critical, keyCertSign, cRLSign
EOF

cat > "$int_req_cfg" <<EOF
[ req ]
distinguished_name = dn
prompt = no
[ dn ]
CN = $INT_CN
EOF

cat > "$int_ext_cfg" <<EOF
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EOF

openssl genrsa -out "$ROOT_KEY" 4096
chmod 600 "$ROOT_KEY"
openssl req -x509 -new -sha256 -days "$ROOT_DAYS" \
  -key "$ROOT_KEY" -out "$ROOT_CERT" -config "$root_cfg"

openssl genrsa -out "$INT_KEY" 4096
chmod 600 "$INT_KEY"
openssl req -new -sha256 -key "$INT_KEY" -out "$INT_CSR" -config "$int_req_cfg"
openssl x509 -req -sha256 -days "$INTERMEDIATE_DAYS" \
  -in "$INT_CSR" \
  -CA "$ROOT_CERT" -CAkey "$ROOT_KEY" -CAcreateserial -CAserial "$ROOT_SERIAL" \
  -out "$INT_CERT" -extfile "$int_ext_cfg"

cat "$INT_CERT" "$ROOT_CERT" > "$CHAIN_CERT"
rm -f "$TRUST_CHAIN_PATH"
cp "$CHAIN_CERT" "$TRUST_CHAIN_PATH"

openssl verify -CAfile "$ROOT_CERT" "$INT_CERT"

cat > "$INDEX_FILE" <<EOF
user=$PKI_USER
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
root_dir=$ROOT_DIR
root_cert=$ROOT_CERT
root_key=$ROOT_KEY
intermediate_dir=$INT_DIR
intermediate_cert=$INT_CERT
intermediate_key=$INT_KEY
chain_cert=$CHAIN_CERT
trust_chain=$TRUST_CHAIN_PATH
current_link=$PKI_CURRENT_LINK
EOF

echo "Generated root CA:         $ROOT_CERT"
echo "Generated intermediate CA: $INT_CERT"
echo "Generated chain bundle:    $CHAIN_CERT"
echo "Root key remains offline at: $ROOT_KEY"
echo "Runtime signer should mount only: $INT_CERT, $INT_KEY, $CHAIN_CERT"
echo "Per-user PKI index:        $INDEX_FILE"
echo "Shared current link:       $PKI_CURRENT_LINK"

