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

const verifyMtls = require("./verify-mtls");
const verifyFreshness = require("./verify-freshness");
const verifyNonce = require("./verify-nonce");
const rateLimit = require("./rate-limit");

module.exports = {
  "verify-mtls": {
    config: {
      auth: false,
    },
    handler: verifyMtls,
  },
  "verify-freshness": {
    config: {
      auth: false,
    },
    handler: verifyFreshness,
  },
  "verify-nonce": {
    config: {
      auth: false,
    },
    handler: verifyNonce,
  },
  "rate-limit": {
    config: {
      auth: false,
    },
    handler: rateLimit,
  },
};
