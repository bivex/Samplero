/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:31
 * Last Updated: 2026-03-05 04:31
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const crypto = require("crypto");

function parseTimestampSeconds(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed > 1e12) {
    return Math.floor(parsed / 1000);
  }

  return Math.floor(parsed);
}

function normalizeSignature(signature) {
  if (!signature) {
    return null;
  }

  return String(signature).trim().replace(/^sha256=/i, "").toLowerCase();
}

function timingSafeHexEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function buildSignedWebhookPayload({ timestamp, eventId, body }) {
  return `${timestamp}.${eventId}.${JSON.stringify(body || {})}`;
}

function normalizeIp(ip) {
  if (!ip) {
    return null;
  }

  const trimmed = String(ip).trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^::ffff:/i, "").toLowerCase();
}

function extractWebhookSourceIp(ctx) {
  const forwardedFor = ctx.request?.headers?.["x-forwarded-for"];
  const forwardedIps = typeof forwardedFor === "string"
    ? forwardedFor
        .split(",")
        .map((value) => normalizeIp(value))
        .filter(Boolean)
    : [];

  const candidates = [
    ...(Array.isArray(ctx.request?.ips) ? ctx.request.ips : []),
    ...(Array.isArray(ctx.ips) ? ctx.ips : []),
    ctx.request?.ip,
    ctx.ip,
    ...forwardedIps,
  ]
    .map((value) => normalizeIp(value))
    .filter(Boolean);

  return candidates[0] || null;
}

module.exports = {
  async handlePayment(ctx) {
    const config = strapi.config.get("plugin::license-server", {});
    const { event, data } = ctx.request.body;
    const headers = ctx.request?.headers || {};
    const signature = normalizeSignature(headers["x-webhook-signature"]);
    const timestamp = headers["x-webhook-timestamp"];
    const eventId =
      headers["x-webhook-id"] || ctx.request.body?.id || ctx.request.body?.event_id;
    const expectedSecret = config.webhookSecret;
    const parsedTimestamp = parseTimestampSeconds(timestamp);
    const maxSkewSeconds = config.webhookFreshnessMaxSkewSeconds || config.freshnessMaxSkewSeconds || 300;
    const allowedIps = Array.isArray(config.webhookAllowedIps)
      ? config.webhookAllowedIps.map((value) => normalizeIp(value)).filter(Boolean)
      : [];
    const requireFreshnessStore = config.requireFreshnessStore !== false;
    const sourceIp = extractWebhookSourceIp(ctx);
    const computedSignature = crypto
      .createHmac("sha256", expectedSecret)
      .update(
        buildSignedWebhookPayload({
          timestamp,
          eventId,
          body: ctx.request.body,
        }),
      )
      .digest("hex");

    if (allowedIps.length > 0 && (!sourceIp || !allowedIps.includes(sourceIp))) {
      strapi.log.warn(
        `[Security] Webhook rejected: source IP ${sourceIp || "unknown"} is not allowlisted`,
      );
      if (typeof ctx.forbidden === "function") {
        return ctx.forbidden("Webhook source not allowed");
      }
      return ctx.unauthorized("Webhook source not allowed");
    }

    if (!timestamp || !eventId || parsedTimestamp === null) {
      strapi.log.warn("[Security] Webhook rejected: missing or invalid freshness headers");
      return ctx.unauthorized("Missing webhook freshness headers");
    }

    if (!timingSafeHexEqual(signature, computedSignature)) {
      strapi.log.warn("[Security] Webhook rejected: invalid signature");
      return ctx.unauthorized("Invalid signature");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parsedTimestamp) > maxSkewSeconds) {
      strapi.log.warn(`[Security] Webhook rejected: stale timestamp for event ${eventId}`);
      return ctx.unauthorized("Webhook timestamp outside allowed window");
    }

    const cryptoService = strapi.plugin("license-server").service("crypto");
    const nonceReserved = await cryptoService.reserveNonce(String(eventId), "webhook");

    if (nonceReserved === null && requireFreshnessStore) {
      strapi.log.error("[Security] Webhook freshness store unavailable");
      if (typeof ctx.throw === "function") {
        return ctx.throw(503, "Webhook freshness store unavailable");
      }
      return ctx.badRequest("Webhook freshness store unavailable");
    }

    if (nonceReserved === false) {
      strapi.log.warn(`[Security] Webhook replay rejected for event ${eventId}`);
      return ctx.unauthorized("Webhook replay detected");
    }

    try {
      switch (event) {
        case "payment.succeeded":
          return {
            received: true,
            fulfillment: await this.createLicenseFromPayment(data),
          };
        case "payment.refunded":
          await this.revokeLicenseFromPayment(data);
          break;
        default:
          strapi.log.info(`[Webhook] Unknown event: ${event}`);
      }

      return { received: true };
    } catch (err) {
      strapi.log.error("[Webhook] Processing failed:", err);
      return ctx.badRequest(err.message);
    }
  },

  async createLicenseFromPayment(paymentData) {
    const result = await strapi.plugin("license-server").service("purchase").fulfillPaidOrder({
      orderId: paymentData.order_id,
      paymentId: paymentData.payment_id,
      expirationDays: paymentData.expiration_days,
      allowExistingPaid: true,
    });
    strapi.log.info(`[Webhook] Fulfilled paid order ${paymentData.order_id}`);
    return result;
  },

  async revokeLicenseFromPayment(paymentData) {
    const { order_id } = paymentData;
    await strapi.plugin("license-server").service("purchase").revokeOrderLicenses({
      orderId: order_id,
      reason: "Refunded: payment.refunded",
    });
    strapi.log.info(`[Webhook] License revoked for order ${order_id}`);
  },
};
