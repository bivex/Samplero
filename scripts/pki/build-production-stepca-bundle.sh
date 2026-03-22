#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-${1:-}}"
OUTPUT_DIR="${OUTPUT_DIR:-.tmp/stepca-prod-bundle}"
ARCHIVE="${ARCHIVE:-1}"
FORCE="${FORCE:-0}"

info() { printf '[build-stepca-bundle] %s\n' "$*"; }
die() { printf '[build-stepca-bundle][error] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  SOURCE_DIR=/secure/offline/step-ca OUTPUT_DIR=.tmp/stepca-prod-bundle \
    bash scripts/pki/build-production-stepca-bundle.sh

The source must contain:
  config/ca.json
  certs/root_ca.crt
  certs/intermediate_ca.crt
  secrets/intermediate_ca_key
  secrets/password
EOF
}

[[ -n "$SOURCE_DIR" ]] || { usage; exit 1; }
[[ -d "$SOURCE_DIR" ]] || die "Не найдена source dir: $SOURCE_DIR"

for required in \
  config/ca.json \
  certs/root_ca.crt \
  certs/intermediate_ca.crt \
  secrets/intermediate_ca_key \
  secrets/password; do
  [[ -f "$SOURCE_DIR/$required" ]] || die "Не найден обязательный файл: $SOURCE_DIR/$required"
done

if [[ -e "$SOURCE_DIR/secrets/root_ca_key" || -e "$SOURCE_DIR/secrets/root-ca.key" ]]; then
  info "Root key найден в source. В bundle он намеренно НЕ попадёт."
fi

if [[ -e "$OUTPUT_DIR" && "$FORCE" != "1" ]]; then
  die "Выходная папка уже существует: $OUTPUT_DIR. Используй FORCE=1 для перезаписи."
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/config" "$OUTPUT_DIR/certs" "$OUTPUT_DIR/secrets"

cp "$SOURCE_DIR/config/ca.json" "$OUTPUT_DIR/config/ca.json"
if [[ -f "$SOURCE_DIR/config/defaults.json" ]]; then
  cp "$SOURCE_DIR/config/defaults.json" "$OUTPUT_DIR/config/defaults.json"
fi
cp "$SOURCE_DIR/certs/root_ca.crt" "$OUTPUT_DIR/certs/root_ca.crt"
cp "$SOURCE_DIR/certs/intermediate_ca.crt" "$OUTPUT_DIR/certs/intermediate_ca.crt"
cat "$OUTPUT_DIR/certs/intermediate_ca.crt" "$OUTPUT_DIR/certs/root_ca.crt" > "$OUTPUT_DIR/certs/ca-chain.crt"
cp "$SOURCE_DIR/secrets/intermediate_ca_key" "$OUTPUT_DIR/secrets/intermediate_ca_key"
cp "$SOURCE_DIR/secrets/password" "$OUTPUT_DIR/secrets/password"

openssl verify -CAfile "$OUTPUT_DIR/certs/root_ca.crt" "$OUTPUT_DIR/certs/intermediate_ca.crt"

cat > "$OUTPUT_DIR/MANIFEST.txt" <<EOF
created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
source_dir=$SOURCE_DIR
bundle_dir=$OUTPUT_DIR
root_key_included=no
files=config/ca.json certs/root_ca.crt certs/intermediate_ca.crt certs/ca-chain.crt secrets/intermediate_ca_key secrets/password
EOF

find "$OUTPUT_DIR" -type d -exec chmod 700 {} +
chmod 644 "$OUTPUT_DIR"/certs/*.crt
chmod 600 "$OUTPUT_DIR"/secrets/* "$OUTPUT_DIR/MANIFEST.txt"
chmod 644 "$OUTPUT_DIR/config/ca.json"
[[ -f "$OUTPUT_DIR/config/defaults.json" ]] && chmod 644 "$OUTPUT_DIR/config/defaults.json"

if [[ "$ARCHIVE" == "1" ]]; then
  tar -C "$(dirname "$OUTPUT_DIR")" -czf "$OUTPUT_DIR.tar.gz" "$(basename "$OUTPUT_DIR")"
  info "Архив собран: $OUTPUT_DIR.tar.gz"
fi

info "Bundle готов: $OUTPUT_DIR"
info "Теперь перенеси bundle на сервер и установи через scripts/pki/install-production-stepca-bundle.sh"

