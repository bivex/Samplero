/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 05:07
 * Last Updated: 2026-03-05 05:07
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

module.exports = ({ env }) => ({
  enabled: true,
  config: {
    caCertPath: env("LICENSE_CA_CERT_PATH", "/etc/ssl/certs/ca.crt"),
    caKeyPath: env("LICENSE_CA_KEY_PATH", "/etc/ssl/private/ca.key"),
    signerMode: env("LICENSE_SIGNER_MODE", "local"),
    signerUrl: env("LICENSE_SIGNER_URL", "http://127.0.0.1:8081"),
    signerAuthToken: env("LICENSE_SIGNER_AUTH_TOKEN", "change-me-signer-token"),
    signerSharedSecret: env(
      "LICENSE_SIGNER_SHARED_SECRET",
      "change-me-signer-shared-secret",
    ),
    signerTlsCaPath: env("LICENSE_SIGNER_TLS_CA_PATH", ""),
    signerTlsCertPath: env("LICENSE_SIGNER_TLS_CERT_PATH", ""),
    signerTlsKeyPath: env("LICENSE_SIGNER_TLS_KEY_PATH", ""),
    signerFreshnessMaxSkewSeconds: env.int(
      "LICENSE_SIGNER_FRESHNESS_MAX_SKEW_SECONDS",
      60,
    ),
    signerTimeoutMs: env.int("LICENSE_SIGNER_TIMEOUT_MS", 5000),
    mtlsEndpoint: env("LICENSE_MTLS_ENDPOINT", "https://api"),
    gracePeriodDays: env.int("LICENSE_GRACE_PERIOD_DAYS", 7),
    heartbeatIntervalHours: env.int("LICENSE_HEARTBEAT_HOURS", 24),
    maxActivations: env.int("LICENSE_MAX_ACTIVATIONS", 3),
    nonceTtl: env.int("LICENSE_NONCE_TTL", 300),
    freshnessMaxSkewSeconds: env.int("LICENSE_FRESHNESS_MAX_SKEW_SECONDS", 300),
    webhookFreshnessMaxSkewSeconds: env.int(
      "LICENSE_WEBHOOK_FRESHNESS_MAX_SKEW_SECONDS",
      300,
    ),
    webhookAllowedIps: env.array("LICENSE_WEBHOOK_ALLOWED_IPS", []),
    requireFreshnessStore: env.bool("LICENSE_REQUIRE_FRESHNESS_STORE", true),
    mockAutoApproveFirstActivation: env.bool(
      "LICENSE_MOCK_AUTO_APPROVE_FIRST_ACTIVATION",
      false,
    ),
    serverSecret: env("LICENSE_SERVER_SECRET", "change-me-in-production"),
    webhookSecret: env("LICENSE_WEBHOOK_SECRET", "change-me-webhook-secret"),
    proxySharedSecret: env("LICENSE_PROXY_SHARED_SECRET", ""),
    certificateValidityDays: env.int("LICENSE_CERT_DAYS", 365),
    requireMtls: env.bool("LICENSE_REQUIRE_MTLS", true),
  },
});
