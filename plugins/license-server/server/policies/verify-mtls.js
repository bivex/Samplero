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

const crypto = require("crypto");

const TRUST_LEVEL = {
  NONE: 0,
  API_KEY: 1,
  MTLS: 2,
  SIGNED: 3,
  MTLS_SIGNED: 4,
};

module.exports = async (policyContext, config, { strapi }) => {
  const ctx = policyContext;
  const headers = ctx.request.headers;
  const pluginConfig = strapi.config?.get?.("plugin::license-server", {}) || {};
  const effectiveConfig = {
    ...pluginConfig,
    ...(config || {}),
  };

  const safeEquals = (left, right) => {
    if (typeof left !== "string" || typeof right !== "string") {
      return false;
    }

    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  };

  const deny = (message) => {
    if (typeof ctx.forbidden === "function") {
      return ctx.forbidden(message);
    }

    ctx.status = 403;
    ctx.body = { error: message };
    return false;
  };

  const certSerial = headers["x-client-cert-serial"];
  const sslVerified = headers["x-ssl-verified"];
  const certFingerprint = headers["x-client-cert-fingerprint"];
  const rawCert = headers["x-client-cert"];
  const proxyToken = headers["x-license-proxy-token"];

  const cryptoService = strapi.plugin("license-server")?.service("crypto");
  const clientCertPem = rawCert ? decodeURIComponent(rawCert) : null;
  const baseCertSerial =
    (clientCertPem && cryptoService?.extractCertificateSerial?.(clientCertPem)) ||
    certSerial;
  const resolvedCertSerial =
    cryptoService?.normalizeCertificateSerial?.(baseCertSerial) || baseCertSerial;
  const resolvedFingerprint =
    certFingerprint ||
    (clientCertPem && cryptoService?.computeFingerprint?.(clientCertPem));

  ctx.state.trustLevel = TRUST_LEVEL.NONE;
  ctx.state.certificateVerified = false;

  if (effectiveConfig.proxySharedSecret) {
    if (!safeEquals(proxyToken, effectiveConfig.proxySharedSecret)) {
      strapi.log.warn(
        `[Security] Trusted proxy authentication failed from ${ctx.request.ip}`,
      );
      return deny("Trusted proxy authentication required");
    }

    ctx.state.proxyVerified = true;
  }

  if (sslVerified === "SUCCESS" && resolvedCertSerial) {
    ctx.state.trustLevel = TRUST_LEVEL.MTLS;
    ctx.state.certificateVerified = true;

    if (cryptoService) {
      const revocationCheck = await cryptoService.checkRevocation(
        resolvedCertSerial,
        resolvedFingerprint,
      );

      if (revocationCheck.revoked) {
        strapi.log.warn(
          `[Security] Certificate revoked: ${resolvedCertSerial}, reason: ${revocationCheck.reason}`,
        );
        return deny(`Certificate ${revocationCheck.reason}`);
      }
    }
  }

  const activation = await strapi.db
    .query("plugin::license-server.activation")
    .findOne({
      where: { certificate_serial: resolvedCertSerial || "none" },
    });

  let license = activation?.license;

  if (activation?.license_id && !license) {
    license = await strapi.db.query("plugin::license-server.license").findOne({
      where: { id: activation.license_id },
      populate: ["user"],
    });
  }

  if (sslVerified === "SUCCESS" && resolvedCertSerial) {
    if (!activation) {
      strapi.log.warn(
        `[Security] Activation not found for serial: ${resolvedCertSerial}`,
      );
      return deny("Activation not found");
    }

    if (activation.revoked_at) {
      strapi.log.warn(`[Security] Activation revoked: ${resolvedCertSerial}`);
      return deny("Activation revoked");
    }

    if (!license) {
      strapi.log.warn(
        `[Security] License missing for activation: ${resolvedCertSerial}`,
      );
      return deny("License invalid");
    }

    if (license.revoked_at || license.status !== "active") {
      strapi.log.warn(
        `[Security] License invalid for activation: ${resolvedCertSerial}`,
      );
      return deny("License invalid");
    }

    await strapi.db.query("plugin::license-server.activation").update({
      where: { id: activation.id },
      data: { last_trust_level: TRUST_LEVEL.MTLS },
    });

    ctx.state.licenseActivation = {
      ...activation,
      license,
    };
    ctx.state.user = license.user;

    return true;
  }

  if (effectiveConfig.requireMtls) {
    strapi.log.warn(
      `[Security] mTLS required but not provided from ${ctx.request.ip}`,
    );
    return deny("mTLS authentication required");
  }

  ctx.state.trustLevel = TRUST_LEVEL.API_KEY;

  return true;
};
