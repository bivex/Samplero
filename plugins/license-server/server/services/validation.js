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
  async validateActivationRequest(ctx, next) {
    const { license_key, device_fingerprint, plugin_version, platform } =
      ctx.request.body || {};

    if (!license_key) {
      return ctx.badRequest("license_key is required");
    }

    if (!device_fingerprint) {
      return ctx.badRequest("device_fingerprint is required");
    }

    if (!plugin_version) {
      return ctx.badRequest("plugin_version is required");
    }

    if (!platform || !["win", "mac", "linux"].includes(platform)) {
      return ctx.badRequest("platform must be win, mac, or linux");
    }

    return next();
  },

  async validateDeactivationRequest(ctx, next) {
    const { license_key, device_fingerprint } = ctx.request.body || {};

    if (!license_key) {
      return ctx.badRequest("license_key is required");
    }

    if (!device_fingerprint) {
      return ctx.badRequest("device_fingerprint is required");
    }

    return next();
  },

  async validateCSR(ctx, next) {
    const { csr } = ctx.request.body || {};

    if (csr) {
      try {
        const decodedCsr = Buffer.from(csr, "base64").toString("utf8");
        const forge = require("node-forge");
        const csrObj = forge.pki.certificationRequestFromPem(decodedCsr);

        if (!csrObj.publicKey) {
          return ctx.badRequest("Invalid CSR: no public key");
        }
      } catch (err) {
        return ctx.badRequest("Invalid CSR format");
      }
    }

    return next();
  },
};
