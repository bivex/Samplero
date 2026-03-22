/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 05:08
 * Last Updated: 2026-03-05 05:08
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

module.exports = {
  LICENSE_STATUS: {
    ACTIVE: "active",
    REVOKED: "revoked",
    EXPIRED: "expired",
  },

  PLATFORM: {
    WIN: "win",
    MAC: "mac",
    LINUX: "linux",
  },

  TRUST_LEVEL: {
    NONE: 0,
    API_KEY: 1,
    MTLS: 2,
    SIGNED: 3,
    MTLS_SIGNED: 4,
  },

  CHANNEL_SECURITY: {
    LEVEL_1_PINNING: 1,
    LEVEL_2_MTLS: 2,
    LEVEL_3_SIGNED: 3,
  },

  ERROR_CODES: {
    LICENSE_NOT_FOUND: "LICENSE_NOT_FOUND",
    LICENSE_REVOKED: "LICENSE_REVOKED",
    LICENSE_EXPIRED: "LICENSE_EXPIRED",
    ACTIVATION_LIMIT_EXCEEDED: "ACTIVATION_LIMIT_EXCEEDED",
    DEVICE_ALREADY_ACTIVATED: "DEVICE_ALREADY_ACTIVATED",
    ACTIVATION_NOT_FOUND: "ACTIVATION_NOT_FOUND",
    MTLS_REQUIRED: "MTLS_REQUIRED",
    DOWNGRADE_DETECTED: "DOWNGRADE_DETECTED",
    CERTIFICATE_REVOKED: "CERTIFICATE_REVOKED",
  },
};
