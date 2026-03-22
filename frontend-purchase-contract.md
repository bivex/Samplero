## Frontend Purchase & Download Contract

Этот документ фиксирует текущий buyer-facing contract для `plugin` и `sample_pack` продуктов в License Server.

### Основные endpoints

- `POST /api/license-server/orders` — создать `pending` order
- `POST /api/license-server/webhooks/payment` — подтвердить оплату и получить fulfillment payload
- `GET /api/license-server/me/orders` — список заказов текущего пользователя
- `GET /api/license-server/me/licenses` — только license-bearing покупки (`plugin`)
- `GET /api/license-server/me/downloads` — все downloadable покупки (`plugin` + `sample_pack`)

### Общие правила

- Любой продаваемый продукт обязан иметь downloadable asset, иначе order/fulfillment блокируется с `400`
- Для `sample_pack` допустим cross-platform asset с `platform = "all"`
- `downloads[]` содержит все доступные downloadable variants
- `primary_download` — рекомендуемый вариант для немедленного CTA в UI

### Fulfillment response после `payment.succeeded`

`POST /api/license-server/webhooks/payment` для `payment.succeeded` возвращает:

- `received: true`
- `fulfillment.order`
- `fulfillment.licenses`
- `fulfillment.downloads`

`fulfillment.order` дополнительно содержит UX-friendly поля:

- `order_reference`
- `receipt`
- `delivery_summary`
- `post_purchase`

`fulfillment.licenses` содержит только `plugin` покупки.

`fulfillment.downloads` содержит:

- `plugin` покупки
- `sample_pack` покупки

### Shared purchase/download fields

Каждый объект в `fulfillment.downloads` и `GET /me/downloads` содержит:

- `id`
- `status`
- `issued_at`
- `expires_at`
- `product: { id, name, slug, type }`
- `downloads[]`
- `primary_download`
- `requires_license_key`

Каждый объект order в `fulfillment.order`, `GET /me/orders` и `GET /orders/:id` теперь дополнительно содержит:

- `order_reference`
- `receipt: { total_amount_cents, currency, total_items, line_items[] }`
- `delivery_summary: { plugin_count, sample_pack_count, license_count, download_count, ready_for_delivery }`
- `post_purchase: { headline, message, primary_cta, secondary_cta, email_hint }`

Каждый объект в `downloads[]` / `primary_download` содержит:

- `id`
- `version`
- `platform`
- `is_latest`
- `min_license_protocol_version`
- `file_size_bytes`
- `archive_name`
- `download_endpoint`

### `plugin` contract

Для `product.type = "plugin"` фронт может ожидать:

- `license_key`
- `license_key_masked`
- `activation_limit`
- `requires_license_key: true`
- `downloads[]`
- `primary_download`
- `activation_claims_endpoint`
- `has_pending_activation_claim`
- `pending_activation_claims[]`

UI правило:

- после оплаты показывать `license_key` и кнопку download
- в кабинете лицензий использовать `GET /api/license-server/me/licenses`
- в download CTA брать `primary_download.download_endpoint`
- для верхнего banner/hero можно использовать `order.post_purchase.headline` и `order.post_purchase.message`
- если `has_pending_activation_claim=true`, показывать pending-device confirmation прямо в user cabinet

Каждый `pending_activation_claims[]` объект содержит:

- `id`
- `status` (`pending_confirmation`)
- `device_fingerprint`
- `key_hash`
- `csr_fingerprint`
- `plugin_version`
- `platform`
- `machine_id`
- `request_ip`
- `risk_score`
- `risk_reasons[]`
- `attempt_count`
- `expires_at`
- `approve_endpoint`
- `reject_endpoint`

Cabinet confirm flow:

1. frontend грузит `GET /api/license-server/me/licenses`
2. если у лицензии есть `pending_activation_claims[]`, показывает карточку `Confirm this device?`
3. approve → `POST approve_endpoint`
4. reject → `POST reject_endpoint`
5. после approve/reject обновить `GET /api/license-server/me/licenses`

### `sample_pack` contract

Для `product.type = "sample_pack"` фронт может ожидать:

- `delivery: "archive"`
- `requires_license_key: false`
- `downloads[]`
- `primary_download`
- `archive_url`
- `archive_name`
- `file_size_bytes`

Для `sample_pack` backend **не должен** отдавать:

- `license_key`
- `license_key_masked`

UI правило:

- после оплаты сразу показывать `Download ZIP`
- использовать `archive_url` как shortcut для главной кнопки
- использовать `archive_name` и `file_size_bytes` для CTA/metadata
- не ожидать появления sample pack в `GET /api/license-server/me/licenses`
- для главной CTA можно напрямую использовать `order.post_purchase.primary_cta`

### Рекомендуемый frontend flow

#### Plugin purchase

1. Создать order через `POST /api/license-server/orders`
2. Дождаться `payment.succeeded`
3. Взять из fulfillment:
   - `licenses[0].license_key`
   - `downloads[0].primary_download.download_endpoint`
4. Показать экран: `License key + Download`

#### Sample-pack purchase

1. Создать order через `POST /api/license-server/orders`
2. Дождаться `payment.succeeded`
3. Взять из fulfillment:
   - `downloads[n].archive_url`
   - `downloads[n].archive_name`
   - `downloads[n].file_size_bytes`
4. Показать экран: `Download ZIP`

### Cabinet rendering rules

- `GET /me/orders` — order history / statuses
- `GET /me/licenses` — только plugin/VST лицензии
- `GET /me/downloads` — единый downloads hub для plugin и sample packs
- first-activation confirmation в кабинете нужно строить по `pending_activation_claims[]` из `GET /me/licenses`

Если UI нужен единый download list, нужно опираться на `GET /me/downloads`, а не на `GET /me/licenses`.

Для order cards/history можно напрямую использовать:

- `order.order_reference`
- `order.receipt`
- `order.post_purchase.headline`
- `order.post_purchase.primary_cta`