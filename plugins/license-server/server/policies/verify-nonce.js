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

module.exports = async (policyContext, config, { strapi }) => {
  const ctx = policyContext;
  const nonce = ctx.request.headers["x-request-nonce"];

  const fail = (status, message) => {
    if (typeof ctx.throw === "function") {
      return ctx.throw(status, message);
    }

    if (status === 400 && typeof ctx.badRequest === "function") {
      return ctx.badRequest(message);
    }

    if (status === 409 && typeof ctx.conflict === "function") {
      return ctx.conflict(message);
    }

    ctx.status = status;
    ctx.body = { error: message };
    return false;
  };

  if (!nonce) {
    return fail(400, "x-request-nonce header is required");
  }

  const cryptoService = strapi.plugin("license-server").service("crypto");
  const scope = ctx.request.path || "license";

  try {
    if (typeof cryptoService.reserveNonce === "function") {
      const reserved = await cryptoService.reserveNonce(nonce, scope);

      if (reserved === false) {
        strapi.log.error(`[Security] Replay attack detected: ${nonce}`);
        return fail(409, "Nonce already used");
      }

      if (reserved === null) {
        strapi.log.warn("[Security] Redis not available, skipping nonce check");
        return true;
      }

      return true;
    }

    const exists = await cryptoService.verifyNonce(nonce);

    if (exists) {
      strapi.log.error(`[Security] Replay attack detected: ${nonce}`);
      return fail(409, "Nonce already used");
    }

    await cryptoService.setNonce(nonce);
  } catch (err) {
    strapi.log.warn("[Security] Redis not available, skipping nonce check");
  }

  return true;
};
