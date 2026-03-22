TODO: Задачи по Strapi + License Server Plugin

✅ Реализовано
Content Types:
- [x] License
- [x] Activation  
- [x] Product
- [x] Order / Order-Item
- [x] Plugin-Version
- [x] ClientCertificate

API Endpoints:
- [x] POST /license/activate
- [x] GET /license/validate
- [x] POST /license/deactivate
- [x] POST /license/heartbeat
- [x] GET /license/status
- [x] POST /webhooks/payment
- [x] /products (find, findBySlug, versions)
- [x] /orders (CRUD)
- [x] /me/orders
- [x] /me/licenses
- [x] /me/downloads
- [x] /license-server/licenses (list, get by id)
- [x] /license-server/activations (list, get by id)
- [x] Hydrated JSON responses для License/Activation (nested user/product/license/activations)

Services:
- [x] crypto.js (шифрование)
- [x] license.js (бизнес-логика)
- [x] purchase.js (fulfillment / customer downloads / paid order delivery)
- [x] s3.js (signed download URLs)
- [x] validation.js

Policies:
- [x] verify-nonce
- [x] verify-mtls
- [x] rate-limit (через strapi-plugin-rate-limit)

Безопасность:
- [x] RBAC роли для buyer/support/admin сценариев (`authenticated`, `support`, `admin`)
- [x] verify-mtls policy с проверкой сертификатов
- [x] Response signing (global middleware)
- [x] Подпись входящих запросов для `validate` / `heartbeat`
- [x] Проверка подписи по `client_public_key`
- [x] Trust levels `SIGNED` / `MTLS_SIGNED`

Тесты:
- [x] Unit тесты для policies
- [x] Unit тесты для RBAC
- [x] Unit тесты для license service
- [x] Unit тесты для controllers
- [x] HTTP integration tests через `supertest` для `/license-server/licenses*`
- [x] HTTP integration tests через `supertest` для `/license-server/activations*`
- [x] HTTP integration tests для admin mutation endpoints (`revoke/activate/deactivate`)
- [x] Targeted plugin test suites проходят
- [x] Targeted commerce tests проходят (`purchase`, `order`, `webhook`, customer downloads)
- [x] `npm run build` проходит
- [x] Strapi startup smoke-check проходит
- [x] Все тесты работают с bun test (45/45)
- [x] Targeted anti-forgery tests для `validate` / `heartbeat` проходят (proof-of-possession, tamper detection, no pre-verification heartbeat refresh)
- [x] Живой E2E signed/mTLS flow через `curl` подтверждён (`activate -> validate -> heartbeat -> deactivate`)
  - [x] `mTLS + signature` даёт `trust_level=MTLS_SIGNED`
  - [x] tampered `validate` payload отклоняется с `401 INVALID_REQUEST_SIGNATURE`
  - [x] direct API-key fallback со valid signature даёт `trust_level=SIGNED`
  - [x] direct API-key fallback без подписи отклоняется (`REQUEST_SIGNATURE_REQUIRED` / `PAYLOAD_SIGNATURE_REQUIRED`)
  - [x] `heartbeat` signature failures возвращают `401`, а не `500`
- [x] Полный Docker smoke с `nginx + mTLS` подтверждён живым прогоном
  - [x] Docker stack поднимается через `docker/pki-stack.sh up`
  - [x] `nginx` на `8443` проксирует в Strapi внутри Docker-сети
  - [x] `activate -> validate -> heartbeat -> deactivate` проходит через Docker `nginx + mTLS + signature`
  - [x] запрос без client cert режется `403`
  - [x] signed tampered payload режется `401 INVALID_REQUEST_SIGNATURE`
- [x] Живой customer flow проверен: `order -> payment webhook -> /me/orders -> /me/licenses -> /me/downloads -> download`

База данных:
- [x] Настройка PostgreSQL в config/database.ts (поддержка postgres/sqlite)
- [x] PostgreSQL 17 (рекомендуемая), min 14
- [x] Индексы для license/activation таблиц

Rate Limiting:
- [x] strapi-plugin-rate-limit установлен
- [x] Конфигурация в config/plugins.ts
- [x] Per-route rules для /license/* endpoints

Redis:
- [x] Поддержка Redis для rate-limiting (опционально)

---
🔲 Осталось сделать

### Ближайшая дорожная карта

1. Дожать серверное хранение ключей до боевого порядка
- зафиксировать точный путь рядом с `docker-compose`
- выбрать владельца файлов и группы
- выставить права на папки, ключи и служебные файлы
- проверить, что ключи не утекают в репозиторий, лишние тома и архивы

2. Выпустить боевой `intermediate CA` и завести его в рабочий контур
- выпустить реальный production `intermediate CA`
- собрать боевую `chain`
- поднять `step-ca` с боевыми файлами
- подключить `cert-signer`
- обновить trust в `nginx`
- прогнать живую проверку и негативные кейсы
- держать готовый rollback

3. Закрыть offline-логику лицензии
- доделать `grace period`
- проверить сценарии без сети и после восстановления связи

4. Добить эксплуатационные интеграции
- SendGrid
- Sentry
- Prometheus

1. Инфраструктура
- [x] Настроить PostgreSQL (config/database.ts готов)
- [x] strapi-plugin-rate-limit настроен
- [x] AWS S3 настроен
- [x] Настроить Nginx с mTLS
- [x] Создать CA сертификаты для тестирования
- [x] Поднять Docker `nginx`-edge на `8443` для полного локального mTLS smoke

2. Безопасность
- [x] Добавить тест CA для интеграционного тестирования
- [x] Request signatures для `validate` / `heartbeat`
  - [x] Для activation с `client_public_key` API-key fallback теперь требует proof-of-possession (`x-request-signature` / `x-payload-signature`)
  - [x] Подмена `license_key` / `device_fingerprint` после подписи ловится проверкой подписи canonical payload
  - [x] `heartbeat` больше не обновляет `last_checkin` до успешной верификации запроса
- [x] Подготовить production PKI runbook (`root CA` / `intermediate CA`, ротация, отзыв)
- [ ] Дожать серверное хранение production CA keys рядом с `docker-compose` до боевого вида
  - [x] Принято решение хранить production keys на самом сервере, в локальной PKI-папке рядом с запуском Docker
  - [x] Локальное и серверное PKI-состояние разнесено по пользователям в `.docker-pki/<user>/...`
  - [x] Добавлен `.docker-pki/<user>/index.txt` и ссылка `.docker-pki/current` для стабильного пути от `docker-compose`
  - [x] Добавлен `docker/pki-stack.sh` рядом с `docker-compose`: он сам переключает активную PKI-папку и умеет `up` / `down` / `restart` / `status`
  - [x] Добавлены shell-скрипты для server prep и bundle install: `prepare-production-stepca-host.sh`, `build-production-stepca-bundle.sh`, `install-production-stepca-bundle.sh`
  - [x] Добавлен единый server deploy script: `deploy-production-stepca-server.sh`
  - [x] Добавлены custody helper scripts: `verify-production-stepca-bundle.sh` и `audit-production-stepca-host.sh`
  - [ ] Зафиксировать точный боевой путь на сервере и пользователя-владельца
  - [ ] Выставить корректные права на папки, ключи и служебные файлы
  - [ ] Проверить, что ключи не попадают в репозиторий, лишние тома и случайные архивы
  - [x] Добавлен `smallstep/step-ca` dev/staging path как лёгкий online CA backend
  - [x] `cert-signer` умеет работать поверх `step-ca` через `step ca token` + `step ca sign`
  - [x] Оформлен `step-ca` production cutover plan: custody / canary issuance / nginx trust / verification / rollback (`docs-pki-runbook.md`)
- [ ] Выпустить production `intermediate CA` для mTLS
  - [x] Выделен отдельный `cert-signer` service под CSR signing
  - [x] Добавлен `scratch` Dockerfile для signer service
  - [x] Добавлен `step-ca` Docker/compose overlay для online CA backend
  - [x] Strapi умеет делегировать выпуск client cert во внешний signer (`LICENSE_SIGNER_MODE=remote`)
  - [x] Добавлен workflow `offline root -> runtime intermediate` (`scripts/pki/bootstrap-intermediate-ca.sh`)
  - [x] Локальное PKI-состояние разнесено по пользователям в `.docker-pki/<user>/...`, чтобы файлы не скапливались в одной общей куче
  - [x] Добавлен `.docker-pki/<user>/index.txt` и ссылка `.docker-pki/current` для стабильного локального пути
  - [x] Добавлен `docker/pki-stack.sh` рядом с `docker-compose`: он сам переключает активную PKI-папку и умеет `up` / `down` / `restart` / `status`
  - [x] Docker runtime переведён на схему без root/private CA key внутри Strapi
  - [x] Оформлен production rollout/checklist: `chain` / `issuance` / `rotation` / `rollback` (`docs-pki-runbook.md`)
  - [x] `cert-signer` возвращает chain bundle (`intermediate + root`) как `ca_certificate`
  - [x] `cert-signer` возвращает actual issued cert serial, совместимый с `step-ca`
  - [x] Добавлен безопасный shell flow для сборки production step-ca bundle без `root key` и установки его на сервер
  - [x] Добавлены rollout/rollback helper scripts: `rollout-production-intermediate.sh` и `rollback-production-intermediate.sh`
  - [ ] Выпустить реальный production `intermediate CA` от корневого сертификата
  - [ ] Собрать и положить боевую `chain` в серверную PKI-папку рядом с `docker-compose`
  - [ ] Поднять `step-ca` с боевыми файлами и проверить выдачу через `cert-signer`
  - [ ] Обновить доверенную цепочку в `nginx` и перечитать конфигурацию
  - [ ] Прогнать живую проверку: `activate -> validate -> heartbeat -> deactivate`
  - [ ] Проверить негативные кейсы: без cert / без signature / с подменённым payload
  - [ ] Подготовить и проверить понятный rollback-порядок

3. Лицензирование
- [x] CSR processing - подпись сертификатов
- [x] Выдача client certificates при активации
- [x] Grace period логика (offline режим)
  - [x] `validate` различает `active` / `grace_period` / `grace_period_expired`
  - [x] внутри grace лицензия остаётся валидной, но требует online `heartbeat`
  - [x] после истечения grace `validate` требует recovery heartbeat
  - [x] первый успешный online `heartbeat` восстанавливает activation и сбрасывает offline budget
  - [x] offline recovery подтверждён HTTP integration flow: `validate(expired) -> heartbeat -> validate(active)`

4. Интеграции
- [x] AWS S3 (скачивание плагинов)
  - [x] Конфигурация в config/plugins.ts
  - [x] Provider: @strapi/provider-upload-aws-s3
  - [x] Presigned URLs для безопасной загрузки
  - [x] Service: license-server.service('s3')
  - [x] Endpoint: GET /api/license-server/products/:productId/versions/:versionId/download
- [ ] SendGrid (email уведомления)
- [ ] Sentry (мониторинг ошибок)
- [ ] Prometheus (метрики)

0. Commerce / Digital Delivery
- [x] Payment webhook fulfillment для paid order
- [x] Human-readable license keys для VST / plugin продуктов
- [x] Customer cabinet endpoints `/me/orders`, `/me/licenses`, `/me/downloads`
- [x] Sample-pack delivery без `license_key` (archive-only payload)
- [x] Frontend-friendly payload: `archive_url`, `archive_name`, `file_size_bytes`, `primary_download`
- [x] P0: Валидировать downloadable assets до продажи / fulfillment, чтобы нельзя было продать продукт без архива / бинарника
- [x] P0: Нормализовать модель sample-pack assets через `platform=all` и fallback version lookup
- [x] P1: Зафиксировать frontend contract для `plugin` vs `sample_pack` payloads (`frontend-purchase-contract.md`)
- [x] P1: Добавить post-purchase delivery UX hooks (`order_reference`, `receipt`, `delivery_summary`, `post_purchase`, CTA/email hints)
  - [x] `plugin` flow: `license_key + downloads + primary_download`
  - [x] `sample_pack` flow: `downloads only + archive_url + archive_name + file_size_bytes`
  - [x] Order UX fields в `/orders`, `/orders/:id`, fulfillment: `order_reference`, `receipt`, `delivery_summary`, `post_purchase`
  - [x] Frontend contract doc: `frontend-purchase-contract.md`

5. Admin UI
- [x] Панель управления лицензиями в админке
- [x] CRUD для License/Activation
- [x] Revoke интерфейс
  - [x] Dashboard со статистикой
  - [x] Licenses - таблица с фильтрацией, revoke модал
  - [x] Activations - список активаций
  - [x] Products - список продуктов
  - [x] Navigation links в боковой панели
- [x] Исправлен plugin menu path для Strapi 5 (`plugins/license-server`)
- [x] Исправлена browser/Vite совместимость admin bundle через `sanitize-html` shim
- [x] Локально устранены warnings для `License Server`, `Rate Limiter`, `useRBAC`

6. Документация
- [ ] Инструкция по запуску
- [ ] API документация
- [ ] Как генерировать сертификаты

7. Стабилизация / Tech Debt
- [x] Зафиксировать локальные patch'и для `strapi-plugin-rate-limit` и `@strapi/plugin-users-permissions` вне `node_modules`
- [x] Выбрать постоянный способ: vendor / local extension / admin alias override
  - [x] `strapi-plugin-rate-limit` завендорен в `plugins/strapi-plugin-rate-limit` и подключён через `config/plugins.ts -> resolve`
  - [x] `users-permissions` server patch вынесен в `src/extensions/users-permissions`
  - [x] `users-permissions` admin patch закреплён через локальный vendor в `src/admin/vendors/users-permissions` и alias в `src/admin/vite.config.js`

---
❓ Вопросы по Strapi (конкретные)

## 1. Email (SendGrid)
- Как настроить SendGrid в config/plugins.ts?
- Как отправлять email при истечении лицензии через cron?
- Как создать кастомный email template в Strapi?

## 2. S3 Storage
- [x] Как настроить AWS S3 для скачивания плагинов?
- [x] Как генерировать presigned URLs для безопасной загрузки?
- Конфигурация в `config/plugins.ts`:
  - `UPLOAD_PROVIDER=aws-s3`
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`
- Service: `strapi.plugin('license-server').service('s3').getSignedDownloadUrl(path, expiresIn)`

## 3. Sentry
- Как подключить strapi-plugin-sentry?
- Как логировать ошибки валидации лицензий?

## 4. Prometheus метрики
- Как добавить метрики для /license/activate endpoint?
- Как отслеживать количество активаций и revoked лицензий?

## 5. Admin UI - Custom Fields
- Как добавить кастомное поле для отображения статуса лицензии?
- Как создать bulk actions для revoke/extend лицензий?
- Как добавить виджет на dashboard с статистикой?

## 6. Audit Logs
- Как включить audit logs для отслеживания изменений лицензий?
- Какие события нужно логировать (create, update, revoke)?

## 7. Lifecycle Hooks
- Как создать cron job для проверки истекающих лицензий?
- Как отправлять email уведомления за N дней до истечения?

---
### Конфигурация Rate Limiting

Плагин: `strapi-plugin-rate-limit`

```ts
// config/plugins.ts
'strapi-plugin-rate-limit': {
  enabled: true,
  config: {
    defaults: {
      limit: 100,
      interval: '1m',
    },
    redis: {
      url: env('REDIS_URL'),
    },
    rules: [
      { path: '/api/license/activate', limit: 10, interval: '1m' },
      { path: '/api/license/heartbeat', limit: 60, interval: '1m' },
      { path: '/api/license/validate', limit: 100, interval: '1m' },
    ],
    exclude: ['/admin/**', '/health'],
  },
}
```

Response Headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---
### Рекомендуемые индексы для PostgreSQL

```sql
-- License indexes
CREATE INDEX idx_license_user_id ON license (user_id);
CREATE INDEX idx_license_uid ON license (uid) UNIQUE;
CREATE INDEX idx_license_status ON license (status);
CREATE INDEX idx_license_expires_at ON license (expires_at);

-- Activation indexes
CREATE INDEX idx_activation_license_id ON activation (license_id);
CREATE INDEX idx_activation_device_fingerprint ON activation (device_fingerprint);
CREATE INDEX idx_activation_certificate_serial ON activation (certificate_serial) UNIQUE;
CREATE INDEX idx_activation_last_checkin ON activation (last_checkin);
```

---
Приоритет 1: production CA custody (`Vault` / `KMS`) → убрать file-backed `step-ca` secrets
Приоритет 2: выпуск production `intermediate CA` для mTLS → rollout/runbook/checklist
Приоритет 3: SendGrid / Sentry / Prometheus

---
Последние обновления:
- Настроен `nginx` reverse proxy для внешних `/api/license/*` routes с mTLS-gate для `validate` / `heartbeat`
- Реализованы `x-request-signature` и `x-payload-signature` с проверкой по `activation.client_public_key`
- Для signed activations API-key path теперь требует proof-of-possession; подмена payload после подписи отклоняется
- `heartbeat` больше не может продлевать activation до верификации подписи/доверия
- Закрыта offline/grace-period логика: `validate` теперь явно различает `active` / `grace_period` / `grace_period_expired`, а первый online `heartbeat` восстанавливает activation после офлайна
- Anti-forgery поведение подтверждено live `curl`/e2e прогоном: `mTLS + signature` проходит, tampered/unsigned requests режутся
- По ходу live verification исправлены два runtime бага: local signer serial response и `heartbeat` signature failure status mapping (`500 -> 401`)
- Исправлен `global::response-sign`, чтобы не ломать array-responses и Strapi admin i18n (`locales.find is not a function`)
- Добавлены реальные HTTP integration tests для admin endpoints plugin'а License Server
- Починена hydration-логика ответов Licenses/Activations
- Починена совместимость Strapi admin с Vite browser runtime (`sanitize-html` shim)
- Локально устранены deprecated warnings в `Rate Limiter` и `users-permissions`
- Починен RBAC bootstrap и customer JWT auth для `/api/license-server/me/*` и `/api/license-server/orders`
- Реализован reusable paid-order fulfillment и публичный `POST /api/license-server/webhooks/payment`
- Реализован buyer flow для `plugin`: `license_key + downloads`
- Реализован buyer flow для `sample_pack`: `downloads only`, без `license_key`
- В payload добавлены `archive_url`, `archive_name`, `file_size_bytes`, `primary_download`
- В fulfillment и order payload добавлены UX hooks: `order_reference`, `receipt`, `delivery_summary`, `post_purchase`, CTA/email hints
- Нужна отдельная постоянная стратегия для этих patch'ей, т.к. часть изменений сейчас живёт в `node_modules`

Статус commerce flow

- [x] Полный backend flow `order -> payment webhook -> fulfillment -> customer cabinet/downloads` уже собран и проверен локально
- [x] Для `plugin` покупатель получает `license_key` + доступ к скачиванию бинаря
- [x] Для `sample_pack` покупатель получает archive-delivery payload без `license_key`
- [x] Customer API уже готов для кабинета и post-purchase UX

Сделано дополнительно

- `frontend-purchase-contract.md` фиксирует buyer/frontend contract для `plugin` и `sample_pack`
- Commerce/backend payload теперь содержит post-purchase UX hooks для fulfillment и order history



  Я добавил рабочую интеграцию с smallstep/step-ca как backend для cert-signer, не ломая текущий HTTP contract между Strapi и signer.

  Что изменил

    • Добавил новый backend stepca в services/cert-signer
    • Добавил отдельный image services/cert-signer/Dockerfile.stepca
    • Добавил bootstrap script:
       • scripts/pki/bootstrap-step-ca.sh
    • Добавил compose overlay:
       • docker/docker-compose.stepca.yml
    • Обновил Strapi flow, чтобы сохранялся actual issued certificate serial, а не только заранее сгенерённый placeholder
    • Обновил docs:
       • docs-pki-runbook.md
       • TODO.md
       • services/cert-signer/README.stepca.md

  Важное поведение

  В step-ca режиме сейчас реализован pragmatic path:

    • cert-signer вызывает step ca token + step ca sign
    • step-ca подписывает CSR как есть
    • signer возвращает:
       • certificate
       • ca_certificate
       • fingerprint
       • subject_cn
       • serial

  Это значит:

    • для step-ca мы больше не зависим от того, что serial задаётся локальным signer'ом
    • license-server теперь хранит реальный serial выпущенного сертификата

  Ограничение, о котором важно знать

  С текущей реализацией step-ca не повторяет старую семантику “сервер насильно переписывает CN/SAN поверх произвольного CSR”.

  То есть в step-ca mode:

    • identity сертификата в основном берётся из самого CSR клиента
    • если вам нужен строгий CN-format вроде client:<machineId>:<keyHash>, клиентский CSR должен уже нести это значение

  Это не баг текущей интеграции, а ограничение нативного CSR/token flow в step-ca.

  Проверки

  Я прогнал и получил успешные результаты:

    • go test ./... в services/cert-signer ✅
    • targeted Jest:
       • tests/services/crypto.test.js
       • tests/services/license-csr-revoke.test.js ✅
    • docker compose -f docker/docker-compose.yml -f docker/docker-compose.stepca.yml config ✅
    • реальный e2e smoke:
       • поднят step-ca
       • поднят cert-signer с backend stepca
       • отправлен реальный CSR по HTTP
       • ответ 200 ✅
       • выдан cert + chain ✅
       • пример результата:
          • subject_cn = client:machine-1:testhash1234
          • serial = 9B6D19BD8FDBD4E89B589DDB5DDEC0A

  Как запускать

    1. Инициализировать dev step-ca:
    • bash scripts/pki/bootstrap-step-ca.sh

    2. Поднять stack с overlay:
    • docker compose -f docker/docker-compose.yml -f docker/docker-compose.stepca.yml up

  Что ещё улучшено попутно

  Я специально поправил integration contract так, чтобы внешний issuer мог возвращать actual serial. Это важно не только для step-ca, но и
  вообще для любых CA backend'ов, которые сами выбирают serial number.