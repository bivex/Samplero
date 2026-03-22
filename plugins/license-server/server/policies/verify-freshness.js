"use strict";

const parseRequestTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();

  if (/^[0-9]+$/.test(normalized)) {
    const numeric = Number(normalized);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

module.exports = async (policyContext, config, { strapi }) => {
  const ctx = policyContext;
  const headers = ctx.request?.headers || {};
  const nonce = headers["x-request-nonce"];
  const timestampHeader = headers["x-request-timestamp"];
  const pluginConfig = strapi.config?.get?.("plugin::license-server", {}) || {};
  const effectiveConfig = {
    ...pluginConfig,
    ...(config || {}),
  };
  const maxSkewSeconds = effectiveConfig.freshnessMaxSkewSeconds || 300;
  const requireFreshnessStore = effectiveConfig.requireFreshnessStore !== false;

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

    if (status === 503 && typeof ctx.serviceUnavailable === "function") {
      return ctx.serviceUnavailable(message);
    }

    ctx.status = status;
    ctx.body = { error: message };
    return false;
  };

  if (!nonce) {
    return fail(400, "x-request-nonce header is required");
  }

  if (!timestampHeader) {
    return fail(400, "x-request-timestamp header is required");
  }

  const timestamp = parseRequestTimestamp(timestampHeader);

  if (!timestamp) {
    return fail(400, "x-request-timestamp is invalid");
  }

  const skewMs = Math.abs(Date.now() - timestamp.getTime());

  if (skewMs > maxSkewSeconds * 1000) {
    return fail(400, "x-request-timestamp is outside the allowed freshness window");
  }

  const cryptoService = strapi.plugin("license-server")?.service("crypto");

  if (!cryptoService || typeof cryptoService.reserveNonce !== "function") {
    if (requireFreshnessStore) {
      strapi.log.error("[Security] Freshness store unavailable for protected request");
      return fail(503, "Freshness store unavailable");
    }

    strapi.log.warn("[Security] Freshness store unavailable, skipping freshness check");
    return true;
  }

  try {
    const reserved = await cryptoService.reserveNonce(
      nonce,
      ctx.request?.path || "license",
    );

    if (reserved === false) {
      strapi.log.error(`[Security] Replay attack detected: ${nonce}`);
      return fail(409, "Nonce already used");
    }

    if (reserved === null) {
      if (requireFreshnessStore) {
        strapi.log.error("[Security] Freshness store unavailable for protected request");
        return fail(503, "Freshness store unavailable");
      }

      strapi.log.warn("[Security] Freshness store unavailable, skipping freshness check");
      return true;
    }

    return true;
  } catch (err) {
    if (requireFreshnessStore) {
      strapi.log.error("[Security] Freshness verification failed:", err.message);
      return fail(503, "Freshness store unavailable");
    }

    strapi.log.warn("[Security] Freshness store unavailable, skipping freshness check");
    return true;
  }
};