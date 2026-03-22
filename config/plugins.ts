/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 06:40
 * Last Updated: 2026-03-05 06:40
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

const stripHtml = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCoverImage = (coverImage) => {
  if (!coverImage || typeof coverImage !== "object") {
    return null;
  }

  return {
    url: coverImage.url || null,
    name: coverImage.name || null,
    alternativeText: coverImage.alternativeText || null,
  };
};

export default ({ env }) => ({
  "strapi-plugin-rate-limit": {
    enabled: true,
    resolve: "./plugins/strapi-plugin-rate-limit",
    config: {
      defaults: {
        limit: env.int("RATE_LIMIT", 100),
        interval: env("RATE_LIMIT_INTERVAL", "1m"),
        blockDuration: 0,
      },
      redis: env.bool("REDIS_ENABLED", false)
        ? {
            url: env("REDIS_URL"),
          }
        : undefined,
      rules: [
        { path: "/api/license/activate", limit: 10, interval: "1m" },
        { path: "/api/license/heartbeat", limit: 60, interval: "1m" },
        { path: "/api/license/validate", limit: 100, interval: "1m" },
        { path: "/api/license-server/products/search", limit: 30, interval: "1m" },
      ],
      exclude: ["/admin/**", "/health", "/_health"],
    },
  },
  redis: {
    enabled: env.bool("REDIS_ENABLED", false),
    config: {
      connection: {
        host: env("REDIS_HOST", "127.0.0.1"),
        port: env.int("REDIS_PORT", 6379),
        password: env("REDIS_PASSWORD"),
        db: env.int("REDIS_DB", 0),
      },
    },
  },
  "users-permissions": {
    config: {
      jwtManagement: env("USERS_PERMISSIONS_JWT_MANAGEMENT", "legacy-support"),
      jwt: {
        expiresIn: env("JWT_EXPIRESIN", "30d"),
      },
    },
  },
  email: {
    config: {
      provider: "sendmail",
      providerOptions: {},
    },
  },
  upload: {
    config: {
      provider: env("UPLOAD_PROVIDER", "local"),
      providerOptions:
        env("UPLOAD_PROVIDER") === "aws-s3"
          ? {
              s3: {
                accessKeyId: env("AWS_ACCESS_KEY_ID"),
                secretAccessKey: env("AWS_SECRET_ACCESS_KEY"),
                region: env("AWS_REGION"),
                bucket: env("AWS_S3_BUCKET"),
                endpoint: env("AWS_S3_ENDPOINT"),
                sslEnabled: env.bool("AWS_S3_SSL_ENABLED", true),
                forcePathStyle: env.bool("AWS_S3_FORCE_PATH_STYLE", false),
                signatureVersion: env("AWS_S3_SIGNATURE_VERSION", "v4"),
                expires: env.int("AWS_S3_SIGNED_URL_EXPIRES", 3600),
              },
            }
          : {},
      actionOptions: {
        upload: {},
        uploadStream: {},
      },
    },
  },
  meilisearch: {
    config: {
      host: env("MEILISEARCH_HOST"),
      apiKey: env("MEILISEARCH_API_KEY"),
      product: {
        indexName: "products",
        entriesQuery: {
          populate: ["cover_image"],
          limit: env.int("MEILISEARCH_PRODUCT_BATCH_LIMIT", 1000),
        },
        filterEntry({ entry }) {
          return entry?.is_active !== false;
        },
        transformEntry({ entry }) {
          return {
            id: entry.id,
            documentId: entry.documentId,
            name: entry.name,
            slug: entry.slug,
            type: entry.type,
            description: stripHtml(entry.description),
            price_cents: entry.price_cents,
            currency: entry.currency,
            is_active: entry.is_active !== false,
            cover_image: normalizeCoverImage(entry.cover_image),
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          };
        },
        settings: {
          searchableAttributes: ["name", "description", "type", "slug"],
          filterableAttributes: ["type", "currency", "is_active"],
          sortableAttributes: ["price_cents", "name", "createdAt", "updatedAt"],
        },
      },
    },
  },
  "license-server": {
    enabled: true,
    resolve: "./plugins/license-server",
    config: {
      caCertPath: env("LICENSE_CA_CERT_PATH", "/etc/ssl/certs/ca.crt"),
      caKeyPath: env("LICENSE_CA_KEY_PATH", "/etc/ssl/private/ca.key"),
      signerMode: env("LICENSE_SIGNER_MODE", "local"),
      signerUrl: env("LICENSE_SIGNER_URL", "http://127.0.0.1:8081"),
      signerAuthToken: env("LICENSE_SIGNER_AUTH_TOKEN", "change-me-signer-token"),
      signerSharedSecret: env(
        "LICENSE_SIGNER_SHARED_SECRET",
        "change-me-signer-shared-secret"
      ),
      signerTlsCaPath: env("LICENSE_SIGNER_TLS_CA_PATH", ""),
      signerTlsCertPath: env("LICENSE_SIGNER_TLS_CERT_PATH", ""),
      signerTlsKeyPath: env("LICENSE_SIGNER_TLS_KEY_PATH", ""),
      signerFreshnessMaxSkewSeconds: env.int(
        "LICENSE_SIGNER_FRESHNESS_MAX_SKEW_SECONDS",
        60
      ),
      signerTimeoutMs: env.int("LICENSE_SIGNER_TIMEOUT_MS", 5000),
      serverSecret: env("LICENSE_SERVER_SECRET"),
      mtlsEndpoint: env("LICENSE_MTLS_ENDPOINT", "https://api"),
      gracePeriodDays: env.int("LICENSE_GRACE_PERIOD_DAYS", 7),
      heartbeatIntervalHours: env.int("LICENSE_HEARTBEAT_HOURS", 24),
      maxActivations: env.int("LICENSE_MAX_ACTIVATIONS", 3),
      nonceTtl: env.int("LICENSE_NONCE_TTL", 300),
      freshnessMaxSkewSeconds: env.int("LICENSE_FRESHNESS_MAX_SKEW_SECONDS", 300),
      webhookFreshnessMaxSkewSeconds: env.int(
        "LICENSE_WEBHOOK_FRESHNESS_MAX_SKEW_SECONDS",
        300
      ),
      webhookAllowedIps: env.array("LICENSE_WEBHOOK_ALLOWED_IPS", []),
      requireFreshnessStore: env.bool("LICENSE_REQUIRE_FRESHNESS_STORE", true),
      mockAutoApproveFirstActivation: env.bool(
        "LICENSE_MOCK_AUTO_APPROVE_FIRST_ACTIVATION",
        false
      ),
      certificateValidityDays: env.int("LICENSE_CERT_DAYS", 365),
      webhookSecret: env("LICENSE_WEBHOOK_SECRET", "change-me-webhook-secret"),
      proxySharedSecret: env("LICENSE_PROXY_SHARED_SECRET", ""),
      requireMtls: env.bool("LICENSE_REQUIRE_MTLS", true),
      meilisearchReindexOnBootstrap: env.bool("MEILISEARCH_REINDEX_ON_BOOTSTRAP", false),
      productSearchMinQueryLength: env.int("PRODUCT_SEARCH_MIN_QUERY_LENGTH", 2),
      productSearchCacheTtlSeconds: env.int("PRODUCT_SEARCH_CACHE_TTL_SECONDS", 60),
    },
  },
});
