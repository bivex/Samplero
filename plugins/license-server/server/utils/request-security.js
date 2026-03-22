"use strict";

const appendFreshnessFields = (payload, headers = {}) => ({
  ...(payload || {}),
  ...(headers["x-request-nonce"] ? { request_nonce: headers["x-request-nonce"] } : {}),
  ...(headers["x-request-timestamp"]
    ? { request_timestamp: headers["x-request-timestamp"] }
    : {}),
});

const verifyRequestFreshness = async (ctx) => {
  const headers = ctx.request?.headers || {};
  const nonce = headers["x-request-nonce"];
  const timestamp = headers["x-request-timestamp"];
  const config =
    typeof strapi?.config?.get === "function"
      ? strapi.config.get("plugin::license-server", {})
      : {};
  const maxSkewSeconds = config.freshnessMaxSkewSeconds || 300;
  const requireFreshnessStore = config.requireFreshnessStore !== false;

  if (!nonce) {
    return ctx.badRequest("x-request-nonce header is required");
  }

  if (!timestamp) {
    return ctx.badRequest("x-request-timestamp header is required");
  }

  const requestTime = new Date(timestamp);
  if (Number.isNaN(requestTime.getTime())) {
    return ctx.badRequest("x-request-timestamp is outside the allowed freshness window");
  }

  const skewSeconds = Math.abs(Date.now() - requestTime.getTime()) / 1000;
  if (skewSeconds > maxSkewSeconds) {
    return ctx.badRequest("x-request-timestamp is outside the allowed freshness window");
  }

  const cryptoService = strapi.plugin("license-server")?.service("crypto");
  if (!cryptoService || typeof cryptoService.reserveNonce !== "function") {
    strapi.log.warn("[Security] Freshness store unavailable, skipping nonce check");
    return true;
  }

  try {
    const reserved = await cryptoService.reserveNonce(nonce, ctx.request?.path || "license");

    if (reserved === false) {
      return ctx.conflict("Nonce already used");
    }

    if (reserved === null) {
      if (requireFreshnessStore) {
        if (typeof ctx.serviceUnavailable === "function") {
          return ctx.serviceUnavailable("Freshness store unavailable");
        }

        ctx.status = 503;
        ctx.body = { error: "Freshness store unavailable" };
        return ctx.body;
      }

      strapi.log.warn("[Security] Redis not available, skipping freshness check");
    }

    return true;
  } catch (err) {
    if (requireFreshnessStore) {
      if (typeof ctx.serviceUnavailable === "function") {
        return ctx.serviceUnavailable("Freshness store unavailable");
      }

      ctx.status = 503;
      ctx.body = { error: "Freshness store unavailable" };
      return ctx.body;
    }

    strapi.log.warn("[Security] Redis not available, skipping freshness check");
    return true;
  }
};

module.exports = {
  appendFreshnessFields,
  verifyRequestFreshness,
};