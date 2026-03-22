## cert-signer with step-ca backend

### Goal
Использовать `smallstep/step-ca` как CA backend, сохраняя JSON body contract между Strapi и `cert-signer`, но с усиленной signed-auth схемой.

### How it works
- Strapi вызывает `cert-signer`
- `cert-signer` вызывает `step ca token` и `step ca sign`
- `step-ca` выпускает клиентский cert
- `cert-signer` возвращает `certificate`, `ca_certificate`, `fingerprint`, `serial`

### Bootstrap dev CA
- `bash scripts/pki/bootstrap-step-ca.sh`
- по умолчанию состояние кладётся в `.docker-pki/<user>/step-ca`
- рядом создаётся `.docker-pki/<user>/index.txt`, а `.docker-pki/current` указывает на активную локальную папку
- общий стабильный trust-path для локального mTLS теперь лежит в `.docker-pki/<user>/trust/ca-chain.crt`

### Docker Compose
- `docker compose -f docker/docker-compose.yml -f docker/docker-compose.stepca.yml up`

### Auth contract
- bearer token остаётся обязательным
- дополнительно required:
  - `CERT_SIGNER_AUTH_SHARED_SECRET`
  - `x-signer-timestamp`
  - `x-signer-nonce`
  - `x-signer-signature`
- HMAC считается по raw body: `<timestamp>.<nonce>.<raw-json-body>`

### Optional Strapi ↔ signer mTLS
- сгенерируй service certs: `bash scripts/pki/bootstrap-signer-mtls-certs.sh`
- переведи Strapi на `LICENSE_SIGNER_URL=https://cert-signer:8081`
- задай:
  - `LICENSE_SIGNER_TLS_CA_PATH=/etc/pki-trust/ca-chain.crt`
  - `LICENSE_SIGNER_TLS_CERT_PATH=/etc/pki-services/strapi-signer-client/client.crt`
  - `LICENSE_SIGNER_TLS_KEY_PATH=/etc/pki-services/strapi-signer-client/client.key`
  - `CERT_SIGNER_TLS_CERT_PATH=/etc/pki-services/cert-signer/server.crt`
  - `CERT_SIGNER_TLS_KEY_PATH=/etc/pki-services/cert-signer/server.key`
  - `CERT_SIGNER_TLS_CLIENT_CA_PATH=/etc/pki-trust/ca-chain.crt`

### Important behavior
- `step-ca` backend подписывает CSR **as-is**
- если нужен специфичный `CN`/`SAN`, клиентский CSR должен уже содержать нужную identity shape
- actual issued cert serial нужно сохранять из ответа signer, а не использовать предварительный placeholder serial

