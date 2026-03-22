## cert-signer

Минимальный standalone signer/issuer service для mTLS client certificates.

### Endpoint
- `GET /healthz`
- `POST /v1/certificates/issue`

### Auth
- `Authorization: Bearer <CERT_SIGNER_AUTH_TOKEN>`
- `x-signer-timestamp: <unix-seconds>`
- `x-signer-nonce: <unique-request-id>`
- `x-signer-signature: HMAC_SHA256(CERT_SIGNER_AUTH_SHARED_SECRET, "<timestamp>.<nonce>.<raw-json-body>")`

### Required env
- `CERT_SIGNER_AUTH_TOKEN`
- `CERT_SIGNER_AUTH_SHARED_SECRET`
- `CERT_SIGNER_CA_CERT_PATH`
- `CERT_SIGNER_CA_CHAIN_PATH`
- `CERT_SIGNER_CA_KEY_PATH`
- `CERT_SIGNER_VALIDITY_DAYS` (optional, default `365`)
- `CERT_SIGNER_LISTEN_ADDR` (optional, default `:8081`)
- `CERT_SIGNER_AUTH_MAX_SKEW` (optional, default `60s`)
- optional signer mTLS server mode:
  - `CERT_SIGNER_TLS_CERT_PATH`
  - `CERT_SIGNER_TLS_KEY_PATH`
  - `CERT_SIGNER_TLS_CLIENT_CA_PATH`

### Request body
- `csr_pem`
- `serial_number`
- `machine_id`
- `key_hash`

### Response body
- `certificate`
- `ca_certificate`
- `fingerprint`
- `subject_cn`

### Docker
Сервис собирается статически и запускается через `scratch` image:

- build stage: `golang:1.26-alpine`
- final stage: `scratch`

### Optional Strapi ↔ signer mTLS
- signer can terminate TLS and require verified client certificates
- Strapi can call signer over `https://...` with:
  - `LICENSE_SIGNER_TLS_CA_PATH`
  - `LICENSE_SIGNER_TLS_CERT_PATH`
  - `LICENSE_SIGNER_TLS_KEY_PATH`
- repo helper for local PKI/service certs:
  - `bash scripts/pki/bootstrap-signer-mtls-certs.sh`

### Intermediate CA mode
- `CERT_SIGNER_CA_CERT_PATH` указывает на cert intermediate CA
- `CERT_SIGNER_CA_KEY_PATH` указывает на private key intermediate CA
- `CERT_SIGNER_CA_CHAIN_PATH` указывает на bundle `intermediate + root`, который возвращается клиенту как `ca_certificate`
- `root CA key` в runtime signer не монтируется

