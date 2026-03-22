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

const {
  matchesSearch,
  normalizeSearchTerm,
  normalizeSortDirection,
  parseQueryInt,
  sortItems,
} = require("../utils/admin-list");
const {
  appendFreshnessFields,
  verifyRequestFreshness,
} = require("../utils/request-security");

const ACTIVATION_SORTERS = {
  id: (activation) => Number(activation.id) || 0,
  last_checkin: (activation) => activation.last_checkin || null,
  device: (activation) => activation.device_fingerprint || "",
  user: (activation) => activation.license?.user?.email || "",
  product: (activation) => activation.license?.product?.name || "",
  status: (activation) => (activation.revoked_at ? "revoked" : "active"),
};

const filterActivations = ({ activations, searchTerm, status }) =>
  activations.filter((activation) => {
    const activationStatus = activation.revoked_at ? "revoked" : "active";

    if (status && status !== "all" && activationStatus !== status) {
      return false;
    }

    return matchesSearch(searchTerm, [
      activation.id,
      activation.device_fingerprint,
      activation.certificate_serial,
      activation.platform,
      activation.license?.uid,
      activation.license?.user?.email,
      activation.license?.user?.username,
      activation.license?.product?.name,
      activation.license?.product?.slug,
    ]);
  });

const findActivationFromRequest = async (
  body = {},
  { requireDeviceFingerprintForActivationId = false } = {},
) => {
  const activationId = body?.activation_id;
  const licenseKey = body?.license_key;
  const deviceFingerprint = body?.device_fingerprint;

  if (!activationId && !licenseKey) {
    throw new Error("ACTIVATION_LOOKUP_REQUIRED");
  }

  if (activationId) {
    if (requireDeviceFingerprintForActivationId && !deviceFingerprint) {
      throw new Error("DEVICE_FINGERPRINT_REQUIRED_FOR_ACTIVATION_ID");
    }

    const activation = await strapi.db.query("plugin::license-server.activation").findOne({
      where: { id: activationId },
    });

    if (
      activation &&
      deviceFingerprint &&
      activation.device_fingerprint &&
      activation.device_fingerprint !== deviceFingerprint
    ) {
      throw new Error("ACTIVATION_DEVICE_MISMATCH");
    }

    return activation;
  }

  if (!deviceFingerprint) {
    throw new Error("DEVICE_FINGERPRINT_REQUIRED");
  }

  const license = await strapi.db.query("plugin::license-server.license").findOne({
    where: { uid: licenseKey },
  });

  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  return strapi.db.query("plugin::license-server.activation").findOne({
    where: {
      license_id: license.id,
      device_fingerprint: deviceFingerprint,
      revoked_at: null,
    },
  });
};

const forbidActivationBindingMismatch = (ctx) => {
  if (typeof ctx.forbidden === "function") {
    return ctx.forbidden("Activation does not match device_fingerprint");
  }

  ctx.status = 403;
  ctx.body = { error: "Activation does not match device_fingerprint" };
  return ctx.body;
};

module.exports = {
  async find(ctx) {
    try {
      const query = ctx.query || {};
      const hasPagination = query.limit !== undefined || query.offset !== undefined;
      const searchTerm = normalizeSearchTerm(query.search);
      const hasAdvancedFilters = Boolean(
        searchTerm ||
        (query.status && query.status !== "all") ||
        query.sortBy ||
        query.sortDir,
      );
      const licenseService = strapi.plugin("license-server").service("license");
      const activationQuery = strapi.db.query("plugin::license-server.activation");

      if (hasPagination && !hasAdvancedFilters) {
        const limit = parseQueryInt(query.limit, 20);
        const offset = parseQueryInt(query.offset, 0);
        const [activations, total] = await Promise.all([
          activationQuery.findMany({
            limit,
            offset,
            orderBy: { id: "asc" },
          }),
          activationQuery.count({}),
        ]);

        return {
          activations: await licenseService.hydrateActivations(activations),
          total,
          limit,
          offset,
        };
      }

      if (hasAdvancedFilters) {
        const limit = parseQueryInt(query.limit, 20);
        const offset = parseQueryInt(query.offset, 0);
        const sortBy = ACTIVATION_SORTERS[query.sortBy] ? query.sortBy : "id";
        const sortDir = normalizeSortDirection(query.sortDir, "asc");
        const hydratedActivations = await licenseService.hydrateActivations(
          await activationQuery.findMany(),
        );
        const filteredActivations = filterActivations({
          activations: hydratedActivations,
          searchTerm,
          status: query.status,
        });
        const sortedActivations = sortItems(
          filteredActivations,
          ACTIVATION_SORTERS[sortBy],
          sortDir,
        );

        if (!hasPagination) {
          return sortedActivations;
        }

        return {
          activations: sortedActivations.slice(offset, offset + limit),
          total: sortedActivations.length,
          limit,
          offset,
        };
      }

      const activations = await activationQuery.findMany();
      return await licenseService.hydrateActivations(activations);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const activation = await strapi.db
        .query("plugin::license-server.activation")
        .findOne({
          where: { id },
        });
      if (!activation) {
        return ctx.notFound("Activation not found");
      }
      return await licenseService.hydrateActivation(activation);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async revoke(ctx) {
    const { id } = ctx.params;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const activation = await strapi.db
        .query("plugin::license-server.activation")
        .update({
          where: { id },
          data: {
            revoked_at: new Date(),
          },
        });

      if (!activation) {
        return ctx.notFound("Activation not found");
      }

      return await licenseService.hydrateActivation(activation);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async revokeMine(ctx) {
    const userId = ctx.state?.user?.id;
    const { licenseId, activationId } = ctx.params;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.revokeOwnedActivation({
        ownerUserId: userId,
        licenseId,
        activationId,
      });
    } catch (err) {
      if (err.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }

      if (err.message === "ACTIVATION_NOT_FOUND") {
        return ctx.notFound("Activation not found");
      }

      ctx.throw(500, err);
    }
  },

  async heartbeat(ctx) {
    try {
      const freshnessResult = await verifyRequestFreshness(ctx);
      if (freshnessResult !== true) {
        return freshnessResult;
      }

      let activation = ctx.state.licenseActivation;
      const headers = ctx.request?.headers || {};
      const payloadSignature = headers["x-payload-signature"];
      let requestPayload = ctx.request?.body || {};

      // If activation not set by policy, look it up from request body
      if (!activation) {
        activation = await findActivationFromRequest(ctx.request?.body || {}, {
          requireDeviceFingerprintForActivationId: !payloadSignature,
        });
      } else if (
        ctx.request?.body?.device_fingerprint &&
        activation.device_fingerprint &&
        activation.device_fingerprint !== ctx.request.body.device_fingerprint
      ) {
        return forbidActivationBindingMismatch(ctx);
      }

      if (!activation) {
        return ctx.notFound("Activation not found");
      }

      requestPayload = appendFreshnessFields(requestPayload, headers);

      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.heartbeat(activation, {
        trustLevel: ctx.state.trustLevel,
        payloadSignature,
        requestPayload,
      });
    } catch (err) {
      strapi.log.error("[Heartbeat] Error:", err);
      if (err?.message === "ACTIVATION_LOOKUP_REQUIRED") {
        return ctx.badRequest("activation_id or license_key is required");
      }

      if (err?.message === "DEVICE_FINGERPRINT_REQUIRED") {
        return ctx.badRequest("device_fingerprint is required when activation_id is missing");
      }

      if (err?.message === "DEVICE_FINGERPRINT_REQUIRED_FOR_ACTIVATION_ID") {
        return ctx.badRequest(
          "device_fingerprint is required when activation_id is used without payload signature",
        );
      }

      if (err?.message === "ACTIVATION_DEVICE_MISMATCH") {
        return forbidActivationBindingMismatch(ctx);
      }

      if (err?.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }

      if (
        err?.message === "PAYLOAD_SIGNATURE_REQUIRED" ||
        err?.message === "INVALID_PAYLOAD_SIGNATURE"
      ) {
        if (typeof ctx.unauthorized === "function") {
          return ctx.unauthorized(err.message);
        }

        ctx.status = 401;
        ctx.body = { error: err.message };
        return ctx.body;
      }
      ctx.throw(500, err?.message || "Heartbeat failed");
    }
  },

  async bootstrap(ctx) {
    try {
      const freshnessResult = await verifyRequestFreshness(ctx);
      if (freshnessResult !== true) {
        return freshnessResult;
      }

      const headers = ctx.request?.headers || {};
      const payloadSignature = headers["x-payload-signature"];
      const requestPayload = appendFreshnessFields(ctx.request?.body || {}, headers);
      const activation = await findActivationFromRequest(ctx.request?.body || {}, {
        requireDeviceFingerprintForActivationId: !payloadSignature,
      });

      if (!activation) {
        return ctx.notFound("Activation not found");
      }

      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.bootstrapActivationCertificate(activation, {
        payloadSignature,
        requestPayload,
      });
    } catch (err) {
      if (err?.message === "ACTIVATION_LOOKUP_REQUIRED") {
        return ctx.badRequest("activation_id or license_key is required");
      }

      if (err?.message === "DEVICE_FINGERPRINT_REQUIRED") {
        return ctx.badRequest("device_fingerprint is required when activation_id is missing");
      }

      if (err?.message === "DEVICE_FINGERPRINT_REQUIRED_FOR_ACTIVATION_ID") {
        return ctx.badRequest(
          "device_fingerprint is required when activation_id is used without payload signature",
        );
      }

      if (err?.message === "ACTIVATION_DEVICE_MISMATCH") {
        return forbidActivationBindingMismatch(ctx);
      }

      if (err?.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }

      if (
        err?.message === "PAYLOAD_SIGNATURE_REQUIRED" ||
        err?.message === "INVALID_PAYLOAD_SIGNATURE"
      ) {
        if (typeof ctx.unauthorized === "function") {
          return ctx.unauthorized(err.message);
        }

        ctx.status = 401;
        ctx.body = { error: err.message };
        return ctx.body;
      }

      if (err?.message === "ACTIVATION_REVOKED") {
        if (typeof ctx.forbidden === "function") {
          return ctx.forbidden("Activation revoked");
        }

        ctx.status = 403;
        ctx.body = { error: "Activation revoked" };
        return ctx.body;
      }

      ctx.throw(500, err?.message || "Bootstrap failed");
    }
  },
};
