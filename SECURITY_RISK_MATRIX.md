## Security Risk Matrix

Updated: 2026-06-11

### Purpose

Это отдельная security risk matrix для license-server stack.

`ROADMAP_MATRIX.md` показывает статус работ, а этот документ фиксирует:

- реальные сценарии атаки
- текущие контрмеры в коде и инфраструктуре
- остаточный риск
- приоритет следующего hardening

### Risk scale

| Level | Meaning |
|---|---|
| Critical | высокий impact + реалистичный путь эксплуатации |
| High | серьёзный impact, эксплуатация реалистична при неблагоприятных условиях |
| Medium | нужен дополнительный доступ/ошибка конфигурации или ущерб ограничен |
| Low | маловероятно или impact ограничен |

### Executive summary

| Area | Current state | Main concern |
|---|---|---|
| Request authenticity | Hardened baseline | остаточный риск теперь в misconfiguration/infrastructure drift |
| mTLS | Enforced on protected routes; signer-channel mTLS available | важно не ломать trusted nginx-only ingress invariant и реально включить signer mTLS в production |
| Signed requests | Hardened | клиент должен подписывать payload вместе с freshness fields |
| Replay protection | Enforced for critical routes | Redis/freshness store теперь security dependency |
| Webhook security | Hardened | dedicated webhook secret + freshness/replay protection now present; provider-native validation and strict ingress rollout still desirable |
| PKI custody | Improved | production file-backed issuer secrets всё ещё sensitive |

### Closed in current baseline

Ниже — что уже закрыто или существенно снижено в текущем коде/config baseline:

| Item | Status | What changed |
|---|---|---|
| Direct public Strapi exposure in default Docker wiring | Closed in repo defaults | Strapi bind changed to `127.0.0.1:1337:1337` |
| Proxy/mTLS header spoofing in normal reverse-proxy path | Closed in app baseline | `verify-mtls` now requires `LICENSE_PROXY_SHARED_SECRET`; nginx strips and re-sets mTLS headers |
| Weak `LICENSE_REQUIRE_MTLS=false` default | Closed | secure default is now `true` in plugin config and app config |
| Missing strict freshness on `validate` / `heartbeat` | Closed | new `verify-freshness` policy requires `x-request-nonce` + `x-request-timestamp` and fails closed when freshness store is required but unavailable |
| Webhook secret reuse against general server secret domain | Closed | webhook now uses dedicated `LICENSE_WEBHOOK_SECRET` |
| Webhook replay / stale delivery acceptance | Closed in app baseline | webhook now requires `x-webhook-timestamp` + `x-webhook-id`, rejects replayed events, and logs security rejects |
| Webhook ingress restriction capability | Reduced | optional `LICENSE_WEBHOOK_ALLOWED_IPS` now blocks non-allowlisted source IPs |
| Signer auth based on static bearer only | Closed in app baseline | signer now also requires timestamp + nonce + HMAC over raw JSON body |
| Unprotected east-west transport between Strapi and signer | Reduced | optional Strapi↔signer mTLS now exists, with service-cert bootstrap script and Docker/env wiring |
| Missing server-side first-activation signal | Reduced | first activation now emits explicit security log signal for audit/monitoring |

Остаточный риск по этим пунктам теперь в основном связан не с кодом, а с:

- неправильным production deploy
- ручным reverse-proxy bypass
- отключением security env overrides
- broken Redis / freshness infrastructure without monitoring

### Still incomplete / residual gaps
    
Ниже — вещи, которые **не закрыты полностью** даже после текущего hardening раунда:

| Area | Current state | Why still incomplete |
|---|---|---|
| Client private key storage | Partially addressed in clients | добавлены Tauri и Flutter клиенты с нативным FFI C++ крипто-адаптером (HMAC/JNI/FFI), но аппаратного Keychain/DPAPI/TPM/Secure Enclave пока нет |
| First activation hijack prevention | Partially reduced | есть server-side audit signal, но нет полноценного customer notification / explicit approval / out-of-band confirmation flow |
| Webhook provider validation | Partially reduced | есть собственная HMAC + freshness + replay + optional IP allowlist, но нет provider-native signature/cert verification |
| Webhook ingress restriction rollout | Operationally incomplete | `LICENSE_WEBHOOK_ALLOWED_IPS` optional; production может не включить allowlist или provider IP ranges могут быть нестабильны |
| Strapi↔signer mTLS rollout | Operationally incomplete | поддержка в коде и Docker есть, но mTLS не включается автоматически без cert bootstrap и env rollout |
| Service identity hardening | Not solved fully | нет short-lived workload identity / Vault-issued service credentials / SPIFFE-like identity |
| Monitoring and alerting | Partially reduced | security log points добавлены, но полноценные alerts/dashboards/escalation policy не встроены |
| Issuer secret custody | Improved, not solved | root key убран с runtime host, но intermediate / step-ca secrets всё ещё file-backed и очень чувствительны |

### Risk matrix

| ID | Risk | Likelihood | Impact | Residual | Key Controls | Main Gap |
|---|---|---|---|---|---|---|
| [R1](#r1) | Direct Strapi Exposure | Low-Med | High | **Medium** | `verify-mtls`, local Docker bind | Bypass via production routing |
| [R2](#r2) | Ingress Header Spoofing | Low-Med | High | **Medium** | Proxy shared secret, header strip | Leaked secret or ingress miswiring |
| [R3](#r3) | mTLS Not Required | Low-Med | High | **Medium** | `LICENSE_REQUIRE_MTLS=true` | Manual config overrides |
| [R4](#r4) | Replay / Stale Requests | Low-Med | Med | **Medium** | Nonce freshness checks, Redis | Redis outage / client time skew |
| [R5](#r5) | Client Key Extraction | Med | High | **High** | Device binding, FFI C++ crypto | Hostile client environment (no TPM) |
| [R6](#r6) | First Activation Hijack | Med | Med | **Medium** | Staged activations, audit logs | No out-of-band owner verification |
| [R7](#r7) | Webhook Forgery | Low | High | **Low-Med** | Dedicated secret, replay protection | Missing provider-native signature validation |
| [R8](#r8) | Signer Token Leakage | Low | High | **Low** | Signed HMAC auth, private network | Non-mandatory signer mTLS |
| [R9](#r9) | S3 Download URL Leakage | Med | Med | **Medium** | Time-limited presigned S3 URLs | Sharing of URLs before expiration |
| [R10](#r10) | Redis Outage (No Replay) | Med | Med | **Medium** | Log warnings, route continuity | Fail-open behavior in `verify-nonce` |
| [R11](#r11) | Response-Signing Misuse | Low | Med | **Low-Med** | HMAC signature middleware | Client relying on signature over weak transport |
| [R12](#r12) | Issuer CA Key Compromise | Low-Med | Critical | **High** | Offline root, server bundle script | File-backed intermediate keys on host |


### Detailed notes by risk

#### R1 — Direct Strapi exposure bypasses nginx trust boundary

Why it matters:

- `verify-mtls` relies on request headers such as `x-ssl-verified`
- this is safe only when Strapi is reachable **only** through the trusted nginx edge
- repo default now binds Strapi to `127.0.0.1:1337`
- remaining risk is primarily a production deployment misconfiguration problem

Recommended actions:

1. never expose Strapi port publicly in production
2. keep ingress restricted to nginx/reverse proxy only
3. preserve this as a hard deployment invariant
4. alert on unexpected external reachability of Strapi port

#### R2 — Header spoofing for mTLS identity

Why it matters:

- edge configs now strip incoming spoofable cert headers and re-set them explicitly
- app policy now also requires a trusted proxy shared secret
- remaining risk exists if proxy secret leaks or ingress is miswired

Recommended actions:

1. keep `LICENSE_PROXY_SHARED_SECRET` random and rotated via env/secret store
2. enforce network ACLs so only nginx can reach Strapi
3. ensure all reverse-proxy configs preserve header stripping behavior

#### R3 — mTLS not globally required

Observed state:

- `requireMtls` is configurable
- secure default is now `LICENSE_REQUIRE_MTLS=true`
- when mTLS is absent and not required, trust falls back to weaker path

Recommended actions:

1. set `LICENSE_REQUIRE_MTLS=true` in production
2. treat any non-mTLS validate/heartbeat as suspicious or unsupported
3. keep signed fallback only for controlled migration/canary windows

#### R4 — Replay / stale signed request reuse

Observed state:

- `validate` / `heartbeat` now require `x-request-nonce`
- `validate` / `heartbeat` now require `x-request-timestamp`
- nonce/timestamp are bound into the signed request payload
- freshness checks now fail closed when the freshness store is required but unavailable

Recommended actions:

1. keep client implementations aligned with the new signed payload contract
2. monitor Redis/freshness-store health as security-critical
3. alert on repeated freshness rejections / replay attempts

#### R5 — Client private key extraction

Reality check:

- plugin clients run on hostile machines
- determined attackers can reverse engineer binaries or scrape local key material

Recommended actions:

1. store client private key in OS keystore / secure enclave where possible
2. rotate/reissue on suspicious activity
3. make device revoke/self-service easy
4. alert on unusual activation churn / geography / fingerprint changes

#### R6 — License key theft

Why it matters:

- first activation often starts from possession of `license_key`
- if the user leaks the key before trustworthy binding is established, hijack risk exists
- current server now emits an explicit first-activation security signal, which improves auditability but does not block hijack by itself

Recommended actions:

1. keep activation limits low
2. notify customer on new activation
3. expose device management and revoke flow clearly
4. consider email confirmation for first activation on high-value products

#### R7 — Webhook forgery / secret reuse

Observed state:

- webhook now uses dedicated `LICENSE_WEBHOOK_SECRET`
- webhook freshness requires `x-webhook-timestamp` + `x-webhook-id`
- replayed event IDs are rejected and logged
- optional `LICENSE_WEBHOOK_ALLOWED_IPS` can restrict ingress to expected source IPs

Recommended actions:

1. if payment provider supports it, validate provider-native signature format
2. prefer `LICENSE_WEBHOOK_ALLOWED_IPS` or a dedicated gateway when provider IPs are stable
3. alert on repeated stale/replay/IP-blocked webhook events
4. treat missing allowlist rollout as deployment debt when provider IPs are predictable

#### R8 — Signer token leakage

Why it matters:

- bearer possession alone is no longer sufficient; signer also requires fresh signed HMAC headers
- optional signer mTLS further reduces east-west interception/impersonation risk, but must actually be enabled in deployment

Recommended actions:

1. rotate signer token periodically
2. keep signer reachable only on private network
3. keep Strapi↔signer mTLS enabled where possible, or move further to short-lived service credentials

#### R9 — Download URL leakage

Observed state:

- download endpoints require authenticated user and active license
- returned object URL is time-limited

Recommended actions:

1. keep signed URL TTL short
2. avoid logging full signed URLs
3. consider one-time download tokens for very sensitive assets

#### R10 — Redis unavailable reduces replay defense

Observed state:

- nonce verification degrades with a warning when Redis plugin is unavailable

Recommended actions:

1. fail closed for freshness checks on critical security routes
2. monitor Redis availability as security dependency, not only performance dependency

#### R11 — Response-signing misuse

Observed state:

- responses are HMAC-signed via middleware
- this is useful, but not a substitute for transport/request authenticity

Recommended actions:

1. document response signing as additive integrity signal
2. do not rely on it to compensate for weak ingress boundary

#### R12 — Production issuer secret compromise

Observed state:

- root key is kept off the server
- this is good
- intermediate/step-ca runtime secrets remain highly sensitive

Recommended actions:

1. move issuer custody toward Vault / KMS / HSM-backed path
2. minimize host access and filesystem exposure
3. rotate intermediate on compromise suspicion and prepare emergency revocation procedure

### Priority hardening order

| Priority | Action | Why |
|---|---|---|
| 1 | Harden client key storage + anomaly alerts | raises cost of plugin-side compromise |
| 2 | Move issuer custody toward managed secrets | reduces catastrophic PKI compromise risk |
| 3 | Add provider-native webhook validation and make ingress restrictions real in production | closes residual payment ingress risk that code alone cannot fully remove |
| 4 | Turn signer mTLS + security alerting into enforced operational baseline | converts today's optional hardening into guaranteed runtime protection |

### Deployment invariants

These should be treated as non-negotiable production rules:

1. only nginx/public edge is internet-facing
2. Strapi is private-only
3. `LICENSE_REQUIRE_MTLS=true`
4. signer is private-only
5. root CA key never lands on runtime host
6. security monitoring treats Redis and signer availability as security-relevant

### Related files

- `ROADMAP_MATRIX.md`
- `docs-pki-runbook.md`
- `plugins/license-server/server/policies/verify-mtls.js`
- `plugins/license-server/server/policies/verify-nonce.js`
- `plugins/license-server/server/services/license.js`
- `plugins/license-server/server/services/crypto.js`
- `plugins/license-server/server/controllers/webhook.js`
- `plugins/license-server/server/controllers/product.js`
- `src/middlewares/response-sign.ts`