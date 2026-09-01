# Техническое Задание: Кастомный плагин лицензирования (`strapi-plugin-license-server`)

## 1. Цель и назначение

Создание защищённой системы выдачи и проверки лицензий для VST-плагинов и сэмплов, интегрированной в Strapi CMS. Плагин обеспечивает:

- Выдачу криптографически защищённых лицензий
- mTLS-аутентификацию клиентских подключений
- Лимиты активаций на одно устройство
- Версионирование плагинов с поддержкой обновлений
- Offline-режим с grace period

---

## 2. Технологический стек

| Компонент | Технология / Плагин | Обоснование |
| :--- | :--- | :--- |
| **CMS Core** | Strapi v5 | Основная платформа управления контентом и API |
| **Язык** | Node.js 20+ | Требуется для работы Strapi и криптографических операций |
| **БД** | PostgreSQL | Надёжное хранение транзакций и лицензий (ACID-транзакции) |
| **Кэш** | Redis (strapi-plugin-redis) | Кэширование статусов лицензий, снижение нагрузки на БД |
| **Файлы** | AWS S3 (@strapi-provider-upload-aws-s3) | Хранение бинарников VST и сэмплов |
| **Почта** | SendGrid (@strapi-provider-email-sendgrid) | Доставка лицензий и уведомлений |
| **Мониторинг** | Sentry (@strapi-plugin-sentry) | Отлов ошибок валидации лицензий |
| **Метрики** | Prometheus (strapi-prometheus) | Мониторинг нагрузки на API лицензий |
| **Поиск** | Meilisearch (strapi-plugin-meilisearch) | Поиск по магазину продуктов |
| **TLS Termination** | Nginx | Внешний компонент для mTLS handshake |
| **ID Генерация** | UUID (strapi-advanced-uuid) | Генерация уникальных ключей лицензий |

---

## 3. Архитектура плагина

### 3.1. Структура директорий

```
src/plugins/license-server/
├── admin/                           # Админ-интерфейс
├── server/
│   ├── config/
│   │   ├── index.js                 # Конфигурация плагина
│   │   └── security.js              # Настройки безопасности
│   ├── content-types/
│   │   ├── license/
│   │   │   └── schema.json          # Схема лицензии
│   │   └── activation/
│   │       └── schema.json          # Схема активации
│   ├── controllers/
│   │   ├── license.js               # Управление лицензиями
│   │   ├── activation.js            # Управление активациями
│   │   └── webhook.js              # Обработка вебхуков (платежи)
│   ├── services/
│   │   ├── crypto.js               # Криптографические операции
│   │   ├── license.js              # Бизнес-логика лицензий
│   │   └── validation.js           # Валидация запросов
│   ├── policies/
│   │   ├── verify-mtls.js          # Проверка mTLS заголовков
│   │   ├── verify-nonce.js         # Anti-replay protection
│   │   └── rate-limit.js           # Rate limiting
│   ├── routes/
│   │   ├── license.json            # API маршруты
│   │   └── index.js               # Регистрация маршрутов
│   └── utils/
│       ├── constants.js            # Константы
│       └── helpers.js             # Вспомогательные функции
├── package.json
└── strapi-server.js               # Точка входа
```

### 3.2. Модель данных

#### License (Лицензия)

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `uid` | UUID (Unique) | Уникальный идентификатор лицензии |
| `user` | Relation → User | Владелец лицензии |
| `product` | Relation → Product | Продукт, на который выдана лицензия |
| `status` | Enum (active, revoked, expired) | Статус лицензии |
| `activation_limit` | Integer | Максимальное количество активаций |
| `issued_at` | DateTime | Дата выдачи |
| `expires_at` | DateTime (Nullable) | Дата истечения (null = бессрочно) |
| `revoked_at` | DateTime (Nullable) | Дата отзыва (soft delete) |

#### Activation (Активация)

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `license` | Relation → License | Связанная лицензия |
| `device_fingerprint` | String | Уникальный отпечаток устройства |
| `client_public_key` | Text | Публичный ключ из CSR |
| `certificate_serial` | String (Unique) | Серийный номер выданного сертификата |
| `plugin_version` | String | Версия плагина при активации |
| `platform` | Enum (win, mac, linux) | Платформа |
| `last_checkin` | DateTime | Последний heartbeat |
| `revoked_at` | DateTime (Nullable) | Дата деактивации |

#### PluginVersion (Версия плагина)

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `version` | String (SemVer) | Версия плагина |
| `platform` | Enum (win, mac, linux) | Платформа |
| `min_license_protocol` | Integer | Минимальная версия протокола |
| `build_hash` | String | Хэш сборки |
| `download_url` | String | URL для скачивания |

---

## 4. API Specification

### 4.1. Активация устройства

**Endpoint:** `POST /api/license/activate`  
**Auth:** mTLS (Client Certificate)

**Request:**
```json
{
  "license-string",
  "device_fingerprint":_key": "uuid "hash-from-juce",
  "plugin_version": "1.0.0",
  "platform": "win",
  "csr": "base64-encoded-csr"
}
```

**Response (успех):**
```json
{
  "status": "approved",
  "certificate": "pem-string",
  "ttl": 86400,
  "grace_period": 604800
}
```

**Response (ошибка):**
```json
{
  "status": "denied",
  "reason": "ACTIVATION_LIMIT_EXCEEDED",
  "message": "Превышен лимит активаций"
}
```

### 4.2. Проверка статуса (Heartbeat)

**Endpoint:** `GET /api/license/validate`  
**Auth:** mTLS (Client Certificate)

**Response:**
```json
{
  "valid": true,
  "license_status": "active",
  "expires_in": 2592000,
  "updates_available": ["1.0.1"],
  "grace_period_remaining": 432000
}
```

### 4.3. Отзыв активации

**Endpoint:** `POST /api/license/deactivate`  
**Auth:** User JWT + License Key

**Request:**
```json
{
  "license_key": "uuid-string",
  "device_fingerprint": "hash-from-juce"
}
```

**Response:**
```json
{
  "status": "deactivated",
  "activations_remaining": 2
}
```

### 4.4. Управление лицензиями (Admin API)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/admin/licenses` | GET | Список всех лицензий |
| `/admin/licenses` | POST | Создание лицензии |
| `/admin/licenses/:id` | GET | Детали лицензии |
| `/admin/licenses/:id` | PUT | Обновление лицензии |
| `/admin/licenses/:id/revoke` | POST | Отзыв лицензии |
| `/admin/activations` | GET | Список активаций |
| `/admin/activations/:id/revoke` | POST | Отзыв активации |

---

## 5. Безопасность

### 5.1. Архитектура mTLS

```
┌─────────────┐     mTLS      ┌─────────────┐   Headers   ┌─────────────┐
│ JUCE Plugin │ ─────────────▶│   Nginx     │ ──────────▶│   Strapi    │
│  (Client)   │   HTTPS +     │  (Gateway)  │  X-Client- │  (Backend)  │
│             │  Client Cert  │             │  Cert-Serial│             │
└─────────────┘               └─────────────┘             └─────────────┘
```

**Nginx конфигурация:**
```nginx
server {
    listen 443 ssl;
    
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_client_certificate /etc/nginx/certs/ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;
    
    location /api/ {
        proxy_pass http://strapi:1337;
        
        # Передача данных сертификата
        proxy_set_header X-Client-Cert-Serial $ssl_client_serial;
        proxy_set_header X-Client-Cert-DN $ssl_client_s_dn;
        proxy_set_header X-SSL-Verified $ssl_client_verify;
    }
}
```

### 5.2. Защита от атак

#### Anti-Replay (Redis + Nonce)
```javascript
// Проверка nonce при каждом запросе
const nonce = ctx.request.headers['x-request-nonce'];
const redisKey = `nonce:${nonce}`;
const exists = await redis.get(redisKey);

if (exists) {
    return ctx.conflict('Replay attack detected');
}

await redis.set(redisKey, '1', 'EX', 300); // TTL 5 минут
```

#### Response Signing (HMAC)
```javascript
// Подпись ответа сервера
const payload = JSON.stringify(response.data);
const signature = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(payload)
    .digest('base64');

return {
    ...response,
    signature
};
```

### 5.3. Zero-Trust принципы

1. **Никогда не доверять клиенту** — все данные о статусе лицензии проверяются в БД
2. **Stateful verification** — каждая активация привязана к конкретному сертификату
3. **mTLS required** — без валидного клиентского сертификата запрос отклоняется
4. **Grace period** — при отсутствии heartbeat лицензия остаётся валидной N дней

---

## 6. Интеграция с плагинами

### 6.1. Redis (strapi-plugin-redis)

```javascript
// Кэширование статуса лицензии
const cacheKey = `license:${serial}:status`;
let status = await redis.get(cacheKey);

if (!status) {
    status = await db.activation.find({ certificate_serial: serial });
    await redis.set(cacheKey, status, 'EX', 300);
}

// Anti-replay nonce
await redis.set(`nonce:${nonce}`, '1', 'EX', 300);
```

### 6.2. Sentry (strapi-plugin-sentry)

```javascript
// Логирование подозрительной активности
Sentry.captureMessage('Multiple activation attempts', {
    level: 'warning',
    extra: {
        ip: ctx.request.ip,
        license_key: licenseKey,
        attempts: count
    }
});
```

### 6.3. AWS S3 (presigned URLs)

```javascript
// Генерация временной ссылки на скачивание
const downloadUrl = await strapi
    .plugin('upload')
    .provider
    .getSignedUrl(filePath, {
        expiresIn: 3600,
        responseContentDisposition: `attachment; filename="${filename}"`
    });
```

---

## 7. RBAC и роли

| Роль | Контекст | Права |
| :--- | :--- | :--- |
| **Plugin Client** | mTLS | `/api/license/validate`, `/api/license/heartbeat` |
| **Customer** | JWT | `/api/licenses` (свои), `/api/license/deactivate` |
| **Support** | JWT + Admin | `/admin/activations`, `/admin/licenses/:id/revoke` |
| **Admin** | JWT + Admin | Полный доступ |
| **System** | Webhook Secret | `/api/webhooks/payment` (IP whitelist) |

---

## 8. План разработки

### Неделя 1: Инфраструктура
- [ ] Поднять Strapi v5 + PostgreSQL + Redis
- [ ] Настроить AWS S3 и SendGrid
- [ ] Настроить Nginx с mTLS
- [ ] Создать CA для тестирования

### Неделя 2: Ядро плагина
- [ ] Создать скелет плагина
- [ ] Реализовать Content Types
- [ ] Написать Policy для mTLS проверки
- [ ] Настроить RBAC

### Неделя 3: Логика активации
- [ ] Реализовать `/activate` endpoint
- [ ] Принять CSR, подписать сертификат
- [ ] Реализовать лимиты активаций
- [ ] Интегрировать Redis кэширование

### Неделя 4: JUCE интеграция
- [ ] Написать тестовый клиент на C++
- [ ] Протестировать активацию/деактивацию
- [ ] Протестировать offline grace period

### Неделя 5: Мониторинг
- [ ] Подключить Sentry
- [ ] Настроить Prometheus метрики
- [ ] Настроить алерты

---

## 9. Чек-лист безопасности

- [ ] Nginx настроен на `ssl_verify_client on`
- [ ] CA сертификат хранится в secrets, не в репозитории
- [ ] Policy проверяет `X-SSL-Verified` заголовок
- [ ] Redis используется для nonce проверки
- [ ] Ответы сервера подписываются HMAC
- [ ] Sentry алертит при аномальной активности
- [ ] БД имеет индекс на `certificate_serial`
- [ ] Все действия логируются

---

## 10. Риски и ограничения

| Риск | Mitigation |
| :--- | :--- |
| Сложность mTLS настройки | Документация, скрипты для перевыпуска CA |
| Offline режим | Grace period 7 дней, проверка при первом онлайне |
| Нагрузка на БД | Redis кэширование, асинхронный heartbeat |
| Piracy | mTLS + hardware binding + Sentry мониторинг |

---

## 11. Конфигурация

### config/plugins.js
```javascript
module.exports = ({ env }) => ({
  'license-server': {
    enabled: true,
    config: {
      caCertPath: env('LICENSE_CA_CERT_PATH', '/etc/ssl/certs/ca.crt'),
      gracePeriodDays: env.int('LICENSE_GRACE_PERIOD_DAYS', 7),
      heartbeatIntervalHours: env.int('LICENSE_HEARTBEAT_HOURS', 24),
      maxActivations: env.int('LICENSE_MAX_ACTIVATIONS', 3),
    },
  },
});
```

### .env
```
LICENSE_CA_CERT_PATH=/etc/ssl/certs/ca.crt
LICENSE_GRACE_PERIOD_DAYS=7
LICENSE_HEARTBEAT_HOURS=24
LICENSE_MAX_ACTIVATIONS=3
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```
