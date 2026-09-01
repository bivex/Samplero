## Production PKI Runbook

### Recommended topology
- offline `root CA`
- online `intermediate CA` for client certificate issuance
- Strapi delegates CSR signing to standalone `cert-signer`
- signer holds only the intermediate key material

### Repo-local workflow
- bootstrap dev/test PKI with `bash scripts/pki/bootstrap-intermediate-ca.sh`
- generated offline root assets live under `.docker-pki/<user>/root/`
- generated runtime intermediate assets live under `.docker-pki/<user>/intermediate/`
- user-local PKI state is tracked in `.docker-pki/<user>/index.txt`
- `.docker-pki/current` points at the active local user folder for tools that need one stable path
- `.docker-pki/<user>/trust/ca-chain.crt` is the stable local trust path for nginx and other validators
- `docker/pki-stack.sh` is the main operator entrypoint near `docker-compose`; it switches `.docker-pki/current`, initializes missing PKI state, and runs `up` / `down` / `restart` / `status`
- `ca-chain.crt` is `intermediate + root` and is returned by signer as `ca_certificate`

### step-ca workflow
- bootstrap dev `step-ca` authority with `bash scripts/pki/bootstrap-step-ca.sh`
- start the stack with `docker compose -f docker/docker-compose.yml -f docker/docker-compose.stepca.yml up`
- `step-ca` becomes the online CA backend; Strapi still talks only to `cert-signer`
- `cert-signer` uses `step ca token` + `step ca sign` and returns the actual issued certificate serial
- in `step-ca` mode the CSR identity is signed mostly as-provided by the client CSR; if you require a strict `CN` shape, the client CSR must carry it

### step-ca production cutover plan

#### 1. Custody and artifact prep
- do **not** use the dev bootstrap output as production PKI state
- keep the production `root CA` offline and issue the production `intermediate CA` from the controlled root workflow
- use `scripts/pki/build-production-stepca-bundle.sh` on the secure machine and `scripts/pki/install-production-stepca-bundle.sh` on the server to avoid manual file shuffling
- run `scripts/pki/verify-production-stepca-bundle.sh` before any server copy and keep its printed hashes with the rollout evidence
- store production `step-ca` materials in the chosen controlled custody path. In the current rollout this means the server-local `.docker-pki/<user>/step-ca` layout next to `docker-compose` with strict file permissions. The same artifact set is:
  - `root_ca.crt`
  - `intermediate_ca.crt`
  - `intermediate_ca_key` or managed key handle
  - provisioner password / JWK secrets
  - final `ca-chain.crt`
- decide the production runtime paths or secret mounts before cutover so these map cleanly into:
  - `CERT_SIGNER_CA_CHAIN_PATH`
  - `CERT_SIGNER_STEP_CA_ROOT_PATH`
  - `CERT_SIGNER_STEP_CA_PASSWORD_FILE`
  - `CERT_SIGNER_STEP_CA_PROVISIONER`
  - `CERT_SIGNER_STEP_CA_URL`
- on the server, run `scripts/pki/audit-production-stepca-host.sh` after install and before cutover to prove the host layout contains no `root key`, has strict permissions, and publishes the expected chain hashes

#### 2. Production authority assembly
- initialize or assemble the production `step-ca` authority using the production root/intermediate artifacts, not repo-local generated dev files
- confirm the production provisioner name and password flow match what `cert-signer` will use for `step ca token`
- verify the production `ca.json` / authority config points at the correct cert/key material and policy for client certificate issuance
- if production still uses file mounts temporarily, ensure mounts are read-only where possible and never baked into images

#### 3. Canary deployment
- deploy `step-ca` in the production-like environment first without switching all traffic
- deploy `cert-signer` with `CERT_SIGNER_BACKEND=stepca` and production env vars, while preserving the previous signer/backend for rollback
- confirm Strapi remains on external signer mode only (`LICENSE_SIGNER_MODE=remote`)
- run one canary activation and confirm:
  - client cert issuance succeeds
  - returned `serial` matches the actual issued leaf cert serial
  - returned `ca_certificate` matches the published production chain
  - `cert-signer` can still issue within timeout limits

#### 4. Chain publication and nginx trust update
- publish the final production trust bundle in this order:
  - `intermediate_ca.crt`
  - `root_ca.crt`
- update nginx mTLS trust configuration to the new production chain artifact
- reload nginx only after the new chain is present on every validator that will see the new leaf certs
- verify the new chain with:
  - `openssl verify` against a canary leaf cert
  - one live `validate` request through nginx using the new client cert

#### 5. Cutover verification
- verify the full flow against production or a production-like canary:
  - `activate`
  - `validate`
  - `heartbeat`
  - `deactivate`
- confirm positive cases:
  - `mTLS + signature` succeeds
  - direct signed fallback succeeds only if that path remains intentionally enabled
- confirm negative cases:
  - tampered signed payload is rejected
  - unsigned direct fallback is rejected
  - no-cert request at nginx is rejected
- capture rollout evidence:
  - activation id
  - issuer CN
  - actual leaf serial
  - returned trust level
  - published chain hash / artifact version

#### 6. Rollback readiness for step-ca
- keep the previous trusted chain artifact and previous signer/backend config ready until the new issuer path is stable
- rollback immediately if:
  - `step-ca` cannot issue consistently
  - nginx rejects valid canary certs
  - `validate` / `heartbeat` fail for healthy canary activations
  - serial persistence or chain publication is inconsistent
- rollback sequence:
  1. point `cert-signer` back to the previous backend/intermediate path
  2. restore the previous nginx trust chain
  3. reload nginx and restart signer/issuer services
  4. re-run canary `activate -> validate -> heartbeat`
  5. freeze new activations until trust state is confirmed

### Key custody
- `root CA key`: never mounted into Strapi or signer runtime
- `intermediate CA key`: prefer `Vault` / `KMS` / HSM-backed custody
- if file-backed temporarily, mount as read-only runtime secret, never bake into image
- `step-ca` dev bootstrap is still file-backed; production should move `step-ca`/issuer custody to managed secret infrastructure

### Runtime split
- `Strapi`: business logic / activation workflow
- `cert-signer`: narrow certificate issuance service
- `nginx`: mTLS edge / forwarded certificate metadata
- docker dev wiring should set `LICENSE_SIGNER_MODE=remote`
- Strapi should not mount any CA private key volumes
- signer should mount only `intermediate-ca.crt`, `intermediate-ca.key`, and `ca-chain.crt`

### Current request hardening baseline

- `validate` and `heartbeat` are now treated as strict protected routes
- they must pass through trusted nginx/reverse-proxy ingress only
- Strapi should not be publicly exposed; repo Docker default binds it to `127.0.0.1:1337`
- nginx must strip incoming `x-ssl-*` / `x-client-cert-*` headers and re-set them itself
- app policy requires `LICENSE_PROXY_SHARED_SECRET` on the nginx → Strapi hop
- production should keep `LICENSE_REQUIRE_MTLS=true`
- `validate` / `heartbeat` now require both headers:
  - `x-request-nonce`
  - `x-request-timestamp`
- these freshness fields are expected to be included in the client-signed canonical payload
- freshness checks should fail closed for critical routes when the freshness store is required but unavailable
- payment webhook requests should use a dedicated `LICENSE_WEBHOOK_SECRET`, plus:
  - `x-webhook-timestamp`
  - `x-webhook-id`
  - `x-webhook-signature = HMAC_SHA256(webhook_secret, "<timestamp>.<event_id>.<json-body>")`
- if webhook delivery comes from fixed provider/gateway addresses, set `LICENSE_WEBHOOK_ALLOWED_IPS`
  to an exact allowlist and reject all other sources at the app boundary as a second line of defense
- remote signer calls now require a second shared secret layer in addition to bearer auth:
  - `LICENSE_SIGNER_SHARED_SECRET` on Strapi
  - `CERT_SIGNER_AUTH_SHARED_SECRET` on signer
  - signed headers `x-signer-timestamp` / `x-signer-nonce` / `x-signer-signature`
- optional hardening step for east-west traffic: run Strapi → signer over mTLS
  - bootstrap helper: `bash scripts/pki/bootstrap-signer-mtls-certs.sh`
  - signer server cert should include `DNS:cert-signer`
  - Strapi should trust the same `ca-chain.crt` and present its own client cert/key
- signer/webhook freshness failures and first activations should be treated as security-audit signals in monitoring

### Trust chain usage
- signer issues leaf client certs from the intermediate CA
- nginx trusts `certs/intermediate/ca-chain.crt`
- root key remains offline and is used only to sign/rotate intermediates

### Production intermediate CA rollout checklist

#### 1. Prerequisites
- confirm the offline `root CA` is readable only from the issuance workstation or HSM-backed flow
- choose the production online issuer path:
  - `step-ca` + managed secret/KMS-backed custody, or
  - standalone `cert-signer` with managed `intermediate CA` key access
- define validity windows before issuance:
  - root lifetime
  - intermediate lifetime
  - client cert lifetime
- record the production subject, issuer name, allowed EKU (`clientAuth`), SAN policy, and serial/audit expectations

#### 2. Chain generation and publication
- issue the production `intermediate CA` from the offline root
- build and verify the published chain bundle in this order:
  - `intermediate_ca.crt`
  - `root_ca.crt`
- publish the same chain bundle to every runtime that validates client certs:
  - `nginx` mTLS trust store
  - `cert-signer` / `step-ca` returned `ca_certificate`
  - operational runbooks / secure artifact storage
- verify with `openssl verify` that a freshly issued client cert validates against the published chain

#### 3. Issuance rollout
- deploy the signer backend with production issuer settings but keep the old path available for rollback
- confirm Strapi uses external issuance only (`LICENSE_SIGNER_MODE=remote`)
- verify Strapi does not mount any CA private key material
- verify signer/`step-ca` can read only the minimum required production materials:
  - issuer cert
  - issuer private key or managed key handle
  - published chain bundle
- run a staging or canary issuance and confirm:
  - activation succeeds
  - returned `ca_certificate` matches the published chain
  - stored certificate serial equals the actual issued cert serial
  - nginx accepts the client certificate on `validate` / `heartbeat`
- when using the repo-local server layout, prefer `scripts/pki/rollout-production-intermediate.sh` so the cutover automatically does bundle verification, local backup, deploy, host audit, and evidence capture in one flow

#### 4. Cutover acceptance checks
- activate a fresh license against production or a production-like canary environment
- verify `validate` works with:
  - mTLS only (if allowed by policy)
  - mTLS + signed payload
  - direct signed fallback, if that path remains enabled
- verify negative cases:
  - tampered signed payload is rejected
  - unsigned signed-activation fallback is rejected
  - revoked activation or revoked cert path is rejected
- capture evidence for the rollout ticket:
  - leaf cert serial
  - issuer CN
  - trust level returned by `validate` / `heartbeat`
  - exact chain bundle hash or artifact version

### Rotation
- rotate intermediate before expiry
- publish new intermediate + chain before cutover
- keep root offline
- revoke compromised intermediate and replace from root

#### Intermediate rotation playbook
- issue the next intermediate before the current one expires
- publish the new chain bundle before issuance cutover so validators trust both the new path and any still-valid old leafs as needed
- switch signer issuance to the new intermediate only after:
  - chain distribution is complete
  - canary issuance succeeds
  - nginx trust bundle is updated everywhere
- keep the old intermediate available long enough to validate already-issued leaf certs until they expire or are reissued
- document the serial boundary or issuance timestamp that separates old-vs-new intermediate issuance

### Revocation / incident response
- mark affected client certificates revoked in app DB
- rotate compromised intermediate CA
- re-issue client certificates on next activation/renewal
- document blast radius and affected serial range

### Rollback checklist
- keep the previous signer image/config and previous trusted chain artifact available until the new issuer path is proven stable
- rollback triggers include:
  - widespread mTLS handshake failures
  - signer cannot issue or persist serials correctly
  - clients fail to validate against the published chain
- rollback steps:
  1. point signer issuance back to the previous intermediate/backend
  2. restore the previous trusted chain bundle in nginx and runtime secrets
  3. restart/reload nginx and signer services
  4. issue a fresh canary activation and verify `activate -> validate -> heartbeat`
  5. freeze new production activations if trust state is still ambiguous
- for repo-local server layout the fast-path helper is `scripts/pki/rollback-production-intermediate.sh /path/to/backup-dir`
- after rollback, capture:
  - affected time window
  - impacted serial range
  - whether any clients need forced re-issuance

### Docker guidance
- `cert-signer` can run as statically compiled binary in `scratch`
- Strapi should stay on `distroless` or `node:slim`, not `scratch`
- when using `step-ca`, use the overlay compose file and the `services/cert-signer/Dockerfile.stepca` image instead of the scratch signer image

