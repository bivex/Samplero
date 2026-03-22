#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKI_USER="${PKI_USER:-$(id -un 2>/dev/null || echo default)}"
PKI_BASE_DIR="${PKI_BASE_DIR:-$REPO_ROOT/.docker-pki/$PKI_USER}"
SERVICES_DIR="$PKI_BASE_DIR/services"
SIGNER_DIR="$SERVICES_DIR/cert-signer"
STRAPI_DIR="$SERVICES_DIR/strapi-signer-client"
TRUST_CHAIN="$PKI_BASE_DIR/trust/ca-chain.crt"
FORCE="${FORCE:-0}"
VALID_DAYS="${VALID_DAYS:-825}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

find_issuer() {
  if [[ -f "$PKI_BASE_DIR/intermediate/intermediate-ca.crt" && -f "$PKI_BASE_DIR/intermediate/private/intermediate-ca.key" ]]; then
    ISSUER_CERT="$PKI_BASE_DIR/intermediate/intermediate-ca.crt"
    ISSUER_KEY="$PKI_BASE_DIR/intermediate/private/intermediate-ca.key"
    return
  fi
  if [[ -f "$PKI_BASE_DIR/step-ca/certs/intermediate_ca.crt" && -f "$PKI_BASE_DIR/step-ca/secrets/intermediate_ca_key" ]]; then
    ISSUER_CERT="$PKI_BASE_DIR/step-ca/certs/intermediate_ca.crt"
    ISSUER_KEY="$PKI_BASE_DIR/step-ca/secrets/intermediate_ca_key"
    return
  fi
  die "No intermediate CA materials found under $PKI_BASE_DIR"
}

prepare_dirs() {
  mkdir -p "$SIGNER_DIR" "$STRAPI_DIR"
  [[ -f "$TRUST_CHAIN" ]] || die "Trust chain not found: $TRUST_CHAIN"
  if [[ "$FORCE" != "1" && ( -f "$SIGNER_DIR/server.crt" || -f "$STRAPI_DIR/client.crt" ) ]]; then
    die "Service certs already exist. Re-run with FORCE=1 to overwrite."
  fi
}

issue_signer_server_cert() {
  local csr="$SIGNER_DIR/server.csr"
  local ext="$SIGNER_DIR/server.ext"
  openssl genrsa -out "$SIGNER_DIR/server.key" 2048 >/dev/null 2>&1
  openssl req -new -sha256 -key "$SIGNER_DIR/server.key" -out "$csr" -subj "/CN=cert-signer" >/dev/null 2>&1
  cat > "$ext" <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:cert-signer,DNS:localhost,IP:127.0.0.1
EOF
  openssl x509 -req -sha256 -days "$VALID_DAYS" \
    -in "$csr" -CA "$ISSUER_CERT" -CAkey "$ISSUER_KEY" -CAcreateserial \
    -out "$SIGNER_DIR/server.crt" -extfile "$ext" >/dev/null 2>&1
  chmod 600 "$SIGNER_DIR/server.key"
}

issue_strapi_client_cert() {
  local csr="$STRAPI_DIR/client.csr"
  local ext="$STRAPI_DIR/client.ext"
  openssl genrsa -out "$STRAPI_DIR/client.key" 2048 >/dev/null 2>&1
  openssl req -new -sha256 -key "$STRAPI_DIR/client.key" -out "$csr" -subj "/CN=strapi-signer-client" >/dev/null 2>&1
  cat > "$ext" <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF
  openssl x509 -req -sha256 -days "$VALID_DAYS" \
    -in "$csr" -CA "$ISSUER_CERT" -CAkey "$ISSUER_KEY" -CAcreateserial \
    -out "$STRAPI_DIR/client.crt" -extfile "$ext" >/dev/null 2>&1
  chmod 600 "$STRAPI_DIR/client.key"
}

find_issuer
prepare_dirs
issue_signer_server_cert
issue_strapi_client_cert

echo "Signer mTLS certs generated:"
echo "  server cert:  $SIGNER_DIR/server.crt"
echo "  server key:   $SIGNER_DIR/server.key"
echo "  client cert:  $STRAPI_DIR/client.crt"
echo "  client key:   $STRAPI_DIR/client.key"
echo "  trust chain:  $TRUST_CHAIN"
echo
echo "Recommended env:"
echo "  LICENSE_SIGNER_URL=https://cert-signer:8081"
echo "  LICENSE_SIGNER_TLS_CA_PATH=/etc/pki-trust/ca-chain.crt"
echo "  LICENSE_SIGNER_TLS_CERT_PATH=/etc/pki-services/strapi-signer-client/client.crt"
echo "  LICENSE_SIGNER_TLS_KEY_PATH=/etc/pki-services/strapi-signer-client/client.key"
echo "  CERT_SIGNER_TLS_CERT_PATH=/etc/pki-services/cert-signer/server.crt"
echo "  CERT_SIGNER_TLS_KEY_PATH=/etc/pki-services/cert-signer/server.key"
echo "  CERT_SIGNER_TLS_CLIENT_CA_PATH=/etc/pki-trust/ca-chain.crt"