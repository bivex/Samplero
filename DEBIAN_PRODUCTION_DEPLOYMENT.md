## Debian Production Deployment

Updated: 2026-03-06

### Goal

Развернуть текущий production-like стек на `Debian` с `step-ca` backend, внешним `cert-signer`, `Strapi`, `Postgres`, `Redis` и `nginx` mTLS edge.

### Supported target

- основной ориентир: `Debian 12 (Bookworm)`
- для `Debian 11 (Bullseye)` шаги почти те же, меняется только codename в Docker repo

### What this repo expects

- репозиторий лежит на сервере целиком, например: `/srv/samplero-license-server`
- `SERVER_ROOT` должен совпадать с корнем репозитория
- production PKI bundle ставится в `.docker-pki/<pki-user>/step-ca`
- Strapi работает только через внешний signer: `LICENSE_SIGNER_MODE=remote`
- nginx читает публичный TLS cert/key из `certs/server/nginx.crt` и `certs/server/nginx.key`

### Runtime topology

- `strapi` → бизнес-логика лицензирования
- `cert-signer` → HTTP signer service
- `step-ca` → CA backend
- `nginx` → TLS/mTLS edge на `8443`
- `postgres` → metadata store
- `redis` → cache / queue support

### Before you start

Нужно подготовить заранее:

1. доменное имя для production endpoint
2. TLS certificate для nginx (`certs/server/nginx.crt`, `certs/server/nginx.key`)
3. production `.env` values
4. production `step-ca` bundle, собранный **вне** сервера
5. sudo-доступ на Debian host

### 1. Build the production bundle on a secure machine

На оффлайн/controlled машине собери bundle **без root key**:

```bash
SOURCE_DIR=/secure/step-ca \
OUTPUT_DIR=.tmp/stepca-prod-bundle \
bash scripts/pki/build-production-stepca-bundle.sh

bash scripts/pki/verify-production-stepca-bundle.sh .tmp/stepca-prod-bundle.tar.gz
```

Bundle должен содержать:

- `config/ca.json`
- `certs/root_ca.crt`
- `certs/intermediate_ca.crt`
- `certs/ca-chain.crt`
- `secrets/intermediate_ca_key`
- `secrets/password`

Bundle **не должен** содержать `root_ca_key`.

### 2. Prepare Debian host

Установи Docker Engine и Compose plugin.

Для `Debian 12`:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg openssl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Перелогинься после `usermod -aG docker`.

### 3. Clone the repo onto the server

```bash
sudo mkdir -p /srv
sudo chown "$USER":"$USER" /srv
git clone <YOUR_REPO_URL> /srv/samplero-license-server
cd /srv/samplero-license-server
```

Если репозиторий уже лежит на сервере в другом каталоге — используй именно его, но дальше `SERVER_ROOT` должен быть равен этому пути.

### 4. Create production environment file

Создай production `.env` в корне репозитория. Не используй локальный dev `.env` как есть.

Минимальный каркас:

```dotenv
NODE_ENV=production
DATABASE_CLIENT=postgres
DATABASE_PORT=5432
DATABASE_NAME=license_server
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=change-me
REDIS_URL=redis://strapi-redis:6379

JWT_SECRET=change-me
ADMIN_JWT_SECRET=change-me
APP_KEYS=key1,key2,key3,key4
LICENSE_SERVER_SECRET=change-me
LICENSE_WEBHOOK_SECRET=change-me-webhook-secret
LICENSE_WEBHOOK_ALLOWED_IPS=203.0.113.10,203.0.113.11

LICENSE_SIGNER_MODE=remote
LICENSE_SIGNER_URL=https://cert-signer:8081
LICENSE_SIGNER_AUTH_TOKEN=change-me-signer-token
LICENSE_SIGNER_SHARED_SECRET=change-me-signer-shared-secret
LICENSE_SIGNER_TLS_CA_PATH=/etc/pki-trust/ca-chain.crt
LICENSE_SIGNER_TLS_CERT_PATH=/etc/pki-services/strapi-signer-client/client.crt
LICENSE_SIGNER_TLS_KEY_PATH=/etc/pki-services/strapi-signer-client/client.key
CERT_SIGNER_TLS_CERT_PATH=/etc/pki-services/cert-signer/server.crt
CERT_SIGNER_TLS_KEY_PATH=/etc/pki-services/cert-signer/server.key
CERT_SIGNER_TLS_CLIENT_CA_PATH=/etc/pki-trust/ca-chain.crt
LICENSE_SIGNER_FRESHNESS_MAX_SKEW_SECONDS=60
LICENSE_SIGNER_TIMEOUT_MS=5000
LICENSE_MTLS_ENDPOINT=https://licenses.example.com:8443
LICENSE_PROXY_SHARED_SECRET=replace-with-random-nginx-to-strapi-secret
LICENSE_REQUIRE_MTLS=true
LICENSE_FRESHNESS_MAX_SKEW_SECONDS=300
LICENSE_WEBHOOK_FRESHNESS_MAX_SKEW_SECONDS=300
LICENSE_REQUIRE_FRESHNESS_STORE=true

LICENSE_CERT_DAYS=365
STEP_CA_PROVISIONER=samplero-ra
PKI_USER=prod
```

Notes:

- `LICENSE_SIGNER_MODE` должен быть `remote`
- для signer mTLS сгенерируй service certs через `bash scripts/pki/bootstrap-signer-mtls-certs.sh`
- `LICENSE_SIGNER_URL` должен указывать на `https://cert-signer:8081`
- `LICENSE_WEBHOOK_SECRET` должен быть отдельным секретом, не равным `LICENSE_SERVER_SECRET`
- если платёжный провайдер даёт фиксированные source IP, задай их в `LICENSE_WEBHOOK_ALLOWED_IPS`
- `LICENSE_SIGNER_SHARED_SECRET` должен совпадать между `strapi` и `cert-signer`
- `LICENSE_SIGNER_TLS_CA_PATH` / `LICENSE_SIGNER_TLS_CERT_PATH` / `LICENSE_SIGNER_TLS_KEY_PATH` должны указывать на signer-mTLS cert bundle
- `CERT_SIGNER_TLS_CERT_PATH` / `CERT_SIGNER_TLS_KEY_PATH` / `CERT_SIGNER_TLS_CLIENT_CA_PATH` должны включать TLS+mTLS server side на signer
- `LICENSE_MTLS_ENDPOINT` должен совпадать с публичным endpoint nginx
- `LICENSE_PROXY_SHARED_SECRET` должен совпадать у `nginx` и `strapi`
- `LICENSE_REQUIRE_MTLS` должен оставаться `true`
- `PKI_USER` лучше держать одинаковым с rollout-командами, например `prod`

### 5. Put server TLS certs in place

Положи публичные файлы для nginx сюда:

```bash
mkdir -p certs/server
cp /path/to/nginx.crt certs/server/nginx.crt
cp /path/to/nginx.key certs/server/nginx.key
chmod 600 certs/server/nginx.key
chmod 644 certs/server/nginx.crt
```

### 6. Copy the verified production bundle to the server

Например:

```bash
scp .tmp/stepca-prod-bundle.tar.gz user@server:/tmp/stepca-prod-bundle.tar.gz
```

### 7. Prepare PKI host layout on Debian

Из корня репозитория:

```bash
cd /srv/samplero-license-server
sudo env SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero APP_GROUP=samplero PKI_USER=prod CREATE_OWNER=1 \
  bash scripts/pki/prepare-production-stepca-host.sh
```

Что это делает:

- создаёт `.docker-pki/prod/step-ca`
- создаёт `.docker-pki/current -> prod`
- выставляет строгие права
- подготавливает `index.txt`

### 8. Install the bundle on the server

```bash
cd /srv/samplero-license-server
sudo env SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero APP_GROUP=samplero PKI_USER=prod \
  bash scripts/pki/install-production-stepca-bundle.sh /tmp/stepca-prod-bundle.tar.gz
```

### 9. Start the stack

```bash
cd /srv/samplero-license-server
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh up
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh status
```

Утилита использует `docker compose` и overlay `docker-compose.stepca.yml`.

### 10. One-command deployment option

Если bundle уже на сервере, можно сделать всё одной командой:

```bash
cd /srv/samplero-license-server
sudo env SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero APP_GROUP=samplero PKI_USER=prod \
  bash scripts/pki/deploy-production-stepca-server.sh /tmp/stepca-prod-bundle.tar.gz
```

Для rollout с backup + audit evidence:

```bash
cd /srv/samplero-license-server
sudo env SERVER_ROOT=/srv/samplero-license-server APP_OWNER=samplero APP_GROUP=samplero PKI_USER=prod \
  bash scripts/pki/rollout-production-intermediate.sh /tmp/stepca-prod-bundle.tar.gz
```

### 11. Post-deploy verification

Проверь layout и файлы:

```bash
cd /srv/samplero-license-server
sudo env SERVER_ROOT=/srv/samplero-license-server PKI_USER=prod \
  bash scripts/pki/audit-production-stepca-host.sh
```

Проверь контейнеры и логи:

```bash
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh status
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh logs step-ca
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh logs cert-signer
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh logs strapi
```

Expected checks:

- `step-ca` стартует без ошибок
- `cert-signer` видит `CERT_SIGNER_BACKEND=stepca`
- `strapi` работает в `LICENSE_SIGNER_MODE=remote`
- `.docker-pki/current` указывает на `prod`
- published chain лежит в `.docker-pki/prod/trust/ca-chain.crt`

### 12. Firewall / exposure recommendations

- публикуй наружу только `8443/tcp`
- не открывай наружу `5432`, `6379`, `1337`
- `9000` для `step-ca` лучше ограничить `localhost`, VPN или private admin network

### 13. Rollback

Если rollout делался через `rollout-production-intermediate.sh`, используй backup path из вывода/evidence:

```bash
cd /srv/samplero-license-server
sudo bash scripts/pki/rollback-production-intermediate.sh /srv/samplero-license-server/.docker-pki-backups/<timestamp>-prod
```

После rollback:

```bash
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh restart
PKI_USER=prod PKI_BACKEND=stepca ./docker/pki-stack.sh status
```

### 14. Debian-specific notes

- для `Debian 11` Docker repo URL тот же, но codename будет `bullseye`
- если используешь минимальный cloud image, проверь наличие `gnupg`, `ca-certificates`, `openssl`
- helper scripts используют обычные POSIX/Linux пути и под Debian работают так же, как под Ubuntu

### 15. Operational notes

- root CA key не должен попадать на runtime host
- Strapi не должен монтировать CA private key
- signer/runtime должны видеть только minimum issuer materials
- если меняешь `PKI_USER`, меняй его консистентно в `.env`, rollout и stack-командах
- helper scripts ожидают запуск из этого репозитория и рядом с `docker-compose`

### Related files

- `UBUNTU_22_04_PRODUCTION_DEPLOYMENT.md`
- `docs-pki-runbook.md`
- `scripts/pki/README.md`
- `scripts/pki/build-production-stepca-bundle.sh`
- `scripts/pki/verify-production-stepca-bundle.sh`
- `scripts/pki/prepare-production-stepca-host.sh`
- `scripts/pki/install-production-stepca-bundle.sh`
- `scripts/pki/deploy-production-stepca-server.sh`
- `scripts/pki/rollout-production-intermediate.sh`
- `docker/pki-stack.sh`