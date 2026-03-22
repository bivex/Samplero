# 📄 OpenAPI 3.0 Schema — License Server API

Ниже представлена полная спецификация OpenAPI для сервера лицензирования, основанная на спроектированной доменной модели.

```yaml
openapi: 3.0.3
info:
  title: VST & Samples License Server API
  description: |
    API для управления лицензиями, активациями и проверкой прав доступа 
    для VST-плагинов и сэмплов с поддержкой mTLS.
  version: 1.0.0
  contact:
    name: License Server Support
    email: support@example.com
  license:
    name: Proprietary
    url: https://example.com/license

servers:
  - url: https://api.example.com/v1
    description: Production Server
  - url: https://staging-api.example.com/v1
    description: Staging Server

tags:
  - name: Authentication
    description: mTLS и сессионная аутентификация
  - name: Licenses
    description: Управление лицензиями
  - name: Activations
    description: Активации устройств
  - name: Products
    description: Продукты и версии плагинов
  - name: Orders
    description: Заказы и транзакции
  - name: Users
    description: Управление пользователями

security:
  - BearerAuth: []
  - MTLSAuth: []

paths:
  # ==================== AUTHENTICATION ====================
  /auth/login:
    post:
      tags: [Authentication]
      summary: User login
      operationId: userLogin
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  format: password
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthTokenResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /auth/refresh:
    post:
      tags: [Authentication]
      summary: Refresh access token
      operationId: refreshToken
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Token refreshed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthTokenResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /auth/activate:
    post:
      tags: [Authentication]
      summary: Device activation (mTLS)
      operationId: activateDevice
      security:
        - MTLSAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ActivationRequest'
      responses:
        '200':
          description: Activation successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ActivationResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          description: Activation limit reached
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/validate:
    get:
      tags: [Authentication]
      summary: Validate license (heartbeat)
      operationId: validateLicense
      security:
        - MTLSAuth: []
      parameters:
        - in: header
          name: X-Plugin-Version
          schema:
            type: string
          required: true
          description: Semver version of the plugin
      responses:
        '200':
          description: License valid
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationResponse'
        '403':
          description: License invalid or revoked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/deactivate:
    post:
      tags: [Authentication]
      summary: Deactivate device
      operationId: deactivateDevice
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [activation_id]
              properties:
                activation_id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Deactivation successful
        '404':
          $ref: '#/components/responses/NotFound'

  # ==================== LICENSES ====================
  /licenses:
    get:
      tags: [Licenses]
      summary: List user licenses
      operationId: listLicenses
      security:
        - BearerAuth: []
      parameters:
        - in: query
          name: status
          schema:
            type: string
            enum: [active, revoked, expired]
        - in: query
          name: product_id
          schema:
            type: string
            format: uuid
        - in: query
          name: limit
          schema:
            type: integer
            default: 20
        - in: query
          name: offset
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: List of licenses
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LicenseListResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

    post:
      tags: [Licenses]
      summary: Create license (admin only)
      operationId: createLicense
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LicenseCreateRequest'
      responses:
        '201':
          description: License created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/License'
        '400':
          $ref: '#/components/responses/BadRequest'
        '403':
          $ref: '#/components/responses/Forbidden'

  /licenses/{license_id}:
    get:
      tags: [Licenses]
      summary: Get license details
      operationId: getLicense
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: license_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: License details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/License'
        '404':
          $ref: '#/components/responses/NotFound'

  /licenses/{license_id}/revoke:
    post:
      tags: [Licenses]
      summary: Revoke license
      operationId: revokeLicense
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: license_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                reason:
                  type: string
      responses:
        '200':
          description: License revoked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/License'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          description: License already revoked

  /licenses/{license_id}/activations:
    get:
      tags: [Licenses]
      summary: List activations for license
      operationId: listActivations
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: license_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: List of activations
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ActivationListResponse'

  # ==================== ACTIVATIONS ====================
  /activations:
    get:
      tags: [Activations]
      summary: List all activations (admin)
      operationId: listAllActivations
      security:
        - BearerAuth: []
      parameters:
        - in: query
          name: license_id
          schema:
            type: string
            format: uuid
        - in: query
          name: status
          schema:
            type: string
            enum: [active, revoked]
      responses:
        '200':
          description: List of activations
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ActivationListResponse'

  /activations/{activation_id}:
    get:
      tags: [Activations]
      summary: Get activation details
      operationId: getActivation
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: activation_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Activation details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Activation'
        '404':
          $ref: '#/components/responses/NotFound'

  /activations/{activation_id}/revoke:
    post:
      tags: [Activations]
      summary: Revoke specific activation
      operationId: revokeActivation
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: activation_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Activation revoked
        '404':
          $ref: '#/components/responses/NotFound'

  # ==================== PRODUCTS ====================
  /products:
    get:
      tags: [Products]
      summary: List products
      operationId: listProducts
      parameters:
        - in: query
          name: type
          schema:
            type: string
            enum: [sample_pack, plugin]
        - in: query
          name: is_active
          schema:
            type: boolean
        - in: query
          name: limit
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: List of products
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProductListResponse'

  /products/{product_id}:
    get:
      tags: [Products]
      summary: Get product details
      operationId: getProduct
      parameters:
        - in: path
          name: product_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Product details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Product'
        '404':
          $ref: '#/components/responses/NotFound'

  /products/{product_id}/versions:
    get:
      tags: [Products]
      summary: List plugin versions
      operationId: listPluginVersions
      parameters:
        - in: path
          name: product_id
          required: true
          schema:
            type: string
            format: uuid
        - in: query
          name: platform
          schema:
            type: string
            enum: [win, mac, linux]
      responses:
        '200':
          description: List of versions
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PluginVersionListResponse'

    post:
      tags: [Products]
      summary: Create new plugin version (admin)
      operationId: createPluginVersion
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: product_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PluginVersionCreateRequest'
      responses:
        '201':
          description: Version created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PluginVersion'

  /products/{product_id}/versions/{version_id}:
    get:
      tags: [Products]
      summary: Get version details
      operationId: getPluginVersion
      parameters:
        - in: path
          name: product_id
          required: true
          schema:
            type: string
            format: uuid
        - in: path
          name: version_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Version details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PluginVersion'
        '404':
          $ref: '#/components/responses/NotFound'

  /products/{product_id}/versions/{version_id}/download:
    get:
      tags: [Products]
      summary: Get presigned download URL
      operationId: getDownloadUrl
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: product_id
          required: true
          schema:
            type: string
            format: uuid
        - in: path
          name: version_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Presigned URL
          content:
            application/json:
              schema:
                type: object
                properties:
                  download_url:
                    type: string
                    format: uri
                  expires_at:
                    type: string
                    format: date-time
        '403':
          description: No active license for this product

  # ==================== ORDERS ====================
  /orders:
    get:
      tags: [Orders]
      summary: List user orders
      operationId: listOrders
      security:
        - BearerAuth: []
      parameters:
        - in: query
          name: status
          schema:
            type: string
            enum: [pending, paid, failed, refunded]
      responses:
        '200':
          description: List of orders
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderListResponse'

    post:
      tags: [Orders]
      summary: Create new order
      operationId: createOrder
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OrderCreateRequest'
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'

  /orders/{order_id}:
    get:
      tags: [Orders]
      summary: Get order details
      operationId: getOrder
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: order_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Order details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          $ref: '#/components/responses/NotFound'

  /orders/{order_id}/items:
    get:
      tags: [Orders]
      summary: Get order items
      operationId: getOrderItems
      security:
        - BearerAuth: []
      parameters:
        - in: path
          name: order_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Order items
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderItemListResponse'

  # ==================== USERS ====================
  /users/me:
    get:
      tags: [Users]
      summary: Get current user profile
      operationId: getCurrentUser
      security:
        - BearerAuth: []
      responses:
        '200':
          description: User profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

    put:
      tags: [Users]
      summary: Update user profile
      operationId: updateUser
      security:
        - BearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserUpdateRequest'
      responses:
        '200':
          description: User updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

  /users/me/devices:
    get:
      tags: [Users]
      summary: List all user devices/activations
      operationId: listUserDevices
      security:
        - BearerAuth: []
      responses:
        '200':
          description: List of devices
          content:
            application/json:
              schema:
                type: object
                properties:
                  devices:
                    type: array
                    items:
                      $ref: '#/components/schemas/Activation'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT token obtained from /auth/login

    MTLSAuth:
      type: mutualTLS
      description: |
        mTLS authentication for plugin license validation.
        Client must present valid certificate issued by our CA.
        Certificate serial is validated against Activation table.
        Required headers from Nginx:
        - X-Client-Cert-Serial: Certificate serial number
        - X-Client-Cert-DN: Certificate subject DN
        - X-SSL-Verified: SUCCESS

  schemas:
    # ==================== AUTH ====================
    AuthTokenResponse:
      type: object
      properties:
        access_token:
          type: string
        refresh_token:
          type: string
        expires_in:
          type: integer
          description: Seconds until expiration
        token_type:
          type: string
          enum: [Bearer]

    ActivationRequest:
      type: object
      required:
        - license_key
        - device_fingerprint
        - plugin_version
        - platform
      properties:
        license_key:
          type: string
          format: uuid
          description: License key from purchase
        device_fingerprint:
          type: string
          description: Unique device identifier from JUCE
        plugin_version:
          type: string
          description: Semver version (e.g., 1.0.0)
        platform:
          type: string
          enum: [win, mac, linux]
        csr:
          type: string
          description: Base64-encoded Certificate Signing Request (first activation only)

    ActivationResponse:
      type: object
      properties:
        status:
          type: string
          enum: [approved, pending, rejected]
        activation_id:
          type: string
          format: uuid
        certificate:
          type: string
          description: PEM-encoded client certificate (if CSR provided)
        ttl:
          type: integer
          description: Session TTL in seconds
        message:
          type: string

    ValidationResponse:
      type: object
      properties:
        valid:
          type: boolean
        license_status:
          type: string
          enum: [active, expired, revoked]
        license_id:
          type: string
          format: uuid
        product_id:
          type: string
          format: uuid
        activation_limit:
          type: integer
        activations_used:
          type: integer
        updates_available:
          type: array
          items:
            type: string
            description: Available version numbers
        grace_period_remaining:
          type: integer
          description: Days remaining in offline grace period

    # ==================== LICENSES ====================
    License:
      type: object
      properties:
        id:
          type: string
          format: uuid
        user_id:
          type: string
          format: uuid
        product_id:
          type: string
          format: uuid
        product_name:
          type: string
        order_item_id:
          type: string
          format: uuid
        activation_limit:
          type: integer
        activations_used:
          type: integer
        status:
          type: string
          enum: [active, revoked, expired]
        issued_at:
          type: string
          format: date-time
        expires_at:
          type: string
          format: date-time
          nullable: true
        revoked_at:
          type: string
          format: date-time
          nullable: true

    LicenseListResponse:
      type: object
      properties:
        licenses:
          type: array
          items:
            $ref: '#/components/schemas/License'
        total:
          type: integer
        limit:
          type: integer
        offset:
          type: integer

    LicenseCreateRequest:
      type: object
      required:
        - user_id
        - product_id
        - activation_limit
      properties:
        user_id:
          type: string
          format: uuid
        product_id:
          type: string
          format: uuid
        activation_limit:
          type: integer
          default: 2
        expires_at:
          type: string
          format: date-time
          nullable: true

    # ==================== ACTIVATIONS ====================
    Activation:
      type: object
      properties:
        id:
          type: string
          format: uuid
        license_id:
          type: string
          format: uuid
        device_fingerprint:
          type: string
        client_public_key:
          type: string
          description: PEM-encoded public key
        certificate_serial:
          type: string
          description: X.509 certificate serial number
        plugin_version_id:
          type: string
          format: uuid
        plugin_version:
          type: string
        platform:
          type: string
          enum: [win, mac, linux]
        activated_at:
          type: string
          format: date-time
        last_checkin_at:
          type: string
          format: date-time
        revoked_at:
          type: string
          format: date-time
          nullable: true

    ActivationListResponse:
      type: object
      properties:
        activations:
          type: array
          items:
            $ref: '#/components/schemas/Activation'
        total:
          type: integer

    # ==================== PRODUCTS ====================
    Product:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        type:
          type: string
          enum: [sample_pack, plugin]
        description:
          type: string
        price_cents:
          type: integer
        currency:
          type: string
          enum: [USD, EUR, GBP]
        is_active:
          type: boolean
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    ProductListResponse:
      type: object
      properties:
        products:
          type: array
          items:
            $ref: '#/components/schemas/Product'
        total:
          type: integer

    PluginVersion:
      type: object
      properties:
        id:
          type: string
          format: uuid
        product_id:
          type: string
          format: uuid
        version:
          type: string
          description: Semver (e.g., 1.0.0)
        platform:
          type: string
          enum: [win, mac, linux]
        build_hash:
          type: string
          description: Git commit hash or build identifier
        min_license_protocol_version:
          type: integer
          description: Minimum protocol version required
        file_size_bytes:
          type: integer
        download_url:
          type: string
          format: uri
          nullable: true
        created_at:
          type: string
          format: date-time

    PluginVersionListResponse:
      type: object
      properties:
        versions:
          type: array
          items:
            $ref: '#/components/schemas/PluginVersion'
        total:
          type: integer

    PluginVersionCreateRequest:
      type: object
      required:
        - version
        - platform
        - build_hash
      properties:
        version:
          type: string
        platform:
          type: string
          enum: [win, mac, linux]
        build_hash:
          type: string
        min_license_protocol_version:
          type: integer
          default: 1
        file_size_bytes:
          type: integer

    # ==================== ORDERS ====================
    Order:
      type: object
      properties:
        id:
          type: string
          format: uuid
        user_id:
          type: string
          format: uuid
        total_amount_cents:
          type: integer
        currency:
          type: string
        status:
          type: string
          enum: [pending, paid, failed, refunded]
        created_at:
          type: string
          format: date-time
        paid_at:
          type: string
          format: date-time
          nullable: true

    OrderListResponse:
      type: object
      properties:
        orders:
          type: array
          items:
            $ref: '#/components/schemas/Order'
        total:
          type: integer

    OrderCreateRequest:
      type: object
      required:
        - items
      properties:
        items:
          type: array
          items:
            type: object
            required:
              - product_id
              - quantity
            properties:
              product_id:
                type: string
                format: uuid
              quantity:
                type: integer
                default: 1
        payment_method:
          type: string
          enum: [card, paypal, crypto]

    OrderItem:
      type: object
      properties:
        id:
          type: string
          format: uuid
        order_id:
          type: string
          format: uuid
        product_id:
          type: string
          format: uuid
        product_name:
          type: string
        price_at_purchase:
          type: integer
          description: Price in cents
        quantity:
          type: integer

    OrderItemListResponse:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: '#/components/schemas/OrderItem'

    # ==================== USERS ====================
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        status:
          type: string
          enum: [active, suspended, deleted]
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    UserUpdateRequest:
      type: object
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          format: password
          writeOnly: true

    # ==================== ERRORS ====================
    Error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
          additionalProperties: true

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: UNAUTHORIZED
            message: Invalid or expired token

    Forbidden:
      description: Access denied
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: FORBIDDEN
            message: Insufficient permissions

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: NOT_FOUND
            message: Resource not found

    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: BAD_REQUEST
            message: Validation failed
            details:
              field: email
              reason: Invalid format
```

---

# 🔑 Ключевые особенности схемы

| Особенность | Реализация |
|-------------|------------|
| **mTLS Security** | `MTLSAuth` security scheme + заголовки от Nginx (`X-Client-Cert-Serial`) |
| **Версионирование** | Поле `min_license_protocol_version` в `PluginVersion` |
| **Soft Delete** | `revoked_at` вместо булевых флагов |
| **Пресайднл URL** | Временные ссылки на скачивание через S3 |
| **Grace Period** | `grace_period_remaining` в `ValidationResponse` для оффлайн-работы |
| **Пагинация** | `limit`/`offset` во всех list-эндпоинтах |
| **Идемпотентность** | `activation_id` уникален в рамках лицензии |

---

# 📍 Следующие шаги

1. **Сохранить** как `openapi.yaml` в корне проекта
2. **Подключить** плагин `@strapi-plugin-documentation` — он автоматически сгенерирует Swagger UI
3. **Валидировать** через [Swagger Editor](https://editor.swagger.io/)
4. **Сгенерировать** TypeScript-клиенты для JUCE (через `openapi-generator`)

Нужно ли добавить вебхуки для платежных систем или расширить схему для white-label аренды?