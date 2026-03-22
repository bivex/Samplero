/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:30
 * Last Updated: 2026-03-05 04:30
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

const ADMIN_ROLE_CODES = new Set([
  "admin",
  "strapi-super-admin",
  "strapi-editor",
  "strapi-author",
]);

const hasAdminRoleCode = (role) => {
  if (!role) return false;

  return [role.type, role.code, role.name].some(
    (value) => value && ADMIN_ROLE_CODES.has(String(value)),
  );
};

const isAdminUser = (user) => {
  if (!user) return false;
  if (hasAdminRoleCode(user.role)) return true;
  if (Array.isArray(user.roles) && user.roles.some(hasAdminRoleCode)) return true;
  return false;
};

const verifyRequestNonce = async (ctx) => {
  const nonce = ctx.request?.headers?.["x-request-nonce"];

  if (!nonce) {
    ctx.badRequest("x-request-nonce header is required");
    return false;
  }

  const cryptoService = strapi.plugin("license-server")?.service("crypto");
  const scope = ctx.request?.path || "license";

  if (!cryptoService) {
    return true;
  }

  try {
    if (typeof cryptoService.reserveNonce === "function") {
      const reserved = await cryptoService.reserveNonce(nonce, scope);

      if (reserved === false) {
        return ctx.conflict("Nonce already used");
      }

      if (reserved === null) {
        strapi.log.warn("[Security] Redis not available, skipping nonce check");
      }

      return true;
    }

    if (typeof cryptoService.verifyNonce === "function") {
      const exists = await cryptoService.verifyNonce(nonce);

      if (exists) {
        return ctx.conflict("Nonce already used");
      }

      if (typeof cryptoService.setNonce === "function") {
        await cryptoService.setNonce(nonce);
      }
    }
  } catch (err) {
    strapi.log.warn("[Security] Redis not available, skipping nonce check");
  }

  return true;
};

const buildPendingApprovalResponse = (claim) => ({
  status: "pending_confirmation",
  action: "awaiting_approval",
  claim_id: claim?.id || null,
  expires_at: claim?.expires_at || null,
  next_step: "approve_in_account",
});

const findPendingClaimForDevice = async ({ license, deviceFingerprint }) => {
  if (!license?.id || !deviceFingerprint) {
    return null;
  }

  const claimService = strapi.plugin("license-server")?.service("activation-claim");
  if (!claimService || typeof claimService.findOpenClaimForLicense !== "function") {
    return null;
  }

  const claim = await claimService.findOpenClaimForLicense(license.id);
  return claim?.device_fingerprint === deviceFingerprint ? claim : null;
};

const respondPendingApprovalConflict = (ctx, claim) => {
  const body = buildPendingApprovalResponse(claim);
  ctx.status = 409;
  ctx.body = body;
  return body;
};

const LICENSE_SORTERS = {
  id: (license) => Number(license.id) || 0,
  issued_at: (license) => license.issued_at || null,
  status: (license) => license.status || "",
  user: (license) => license.user?.email || license.user?.username || "",
  product: (license) => license.product?.name || "",
  activations: (license) => license.activations?.length || 0,
};

const filterLicenses = ({ licenses, searchTerm, status }) =>
  licenses.filter((license) => {
    if (status && status !== "all" && license.status !== status) {
      return false;
    }

    return matchesSearch(searchTerm, [
      license.id,
      license.uid,
      license.user?.email,
      license.user?.username,
      license.product?.name,
      license.product?.slug,
    ]);
  });

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
      const licenseService = strapi.plugin("license-server").service("license");
      const purchaseService = strapi.plugin("license-server").service("purchase");
      const query = ctx.query || {};
      const hasPagination = query.limit !== undefined || query.offset !== undefined;
      const searchTerm = normalizeSearchTerm(query.search);
      const hasAdvancedFilters = Boolean(
        searchTerm ||
        (query.status && query.status !== "all") ||
        query.sortBy ||
        query.sortDir,
      );
      const userId = ctx.state.user?.id;
      const isAdmin = isAdminUser(ctx.state.user);

      if (!userId && !isAdmin) {
        return ctx.unauthorized("Authentication required");
      }

      if (userId && !isAdmin) {
        return await purchaseService.getCustomerLicenses(userId);
      }

      const licenseQuery = strapi.db.query("plugin::license-server.license");

      if (hasPagination && !hasAdvancedFilters) {
        const limit = parseQueryInt(query.limit, 20);
        const offset = parseQueryInt(query.offset, 0);
        const [licenses, total] = await Promise.all([
          licenseQuery.findMany({
            populate: ["user", "product"],
            limit,
            offset,
            orderBy: { id: "asc" },
          }),
          licenseQuery.count({}),
        ]);

        return {
          licenses: await licenseService.hydrateLicenses(licenses),
          total,
          limit,
          offset,
        };
      }

      if (hasAdvancedFilters) {
        const limit = parseQueryInt(query.limit, 20);
        const offset = parseQueryInt(query.offset, 0);
        const sortBy = LICENSE_SORTERS[query.sortBy] ? query.sortBy : "id";
        const sortDir = normalizeSortDirection(query.sortDir, "asc");
        const hydratedLicenses = await licenseService.hydrateLicenses(
          await licenseQuery.findMany({
            populate: ["user", "product"],
          }),
        );
        const filteredLicenses = filterLicenses({
          licenses: hydratedLicenses,
          searchTerm,
          status: query.status,
        });
        const sortedLicenses = sortItems(
          filteredLicenses,
          LICENSE_SORTERS[sortBy],
          sortDir,
        );

        if (!hasPagination) {
          return sortedLicenses;
        }

        return {
          licenses: sortedLicenses.slice(offset, offset + limit),
          total: sortedLicenses.length,
          limit,
          offset,
        };
      }

      const licenses = await licenseQuery.findMany({
        populate: ["user", "product"],
      });
      return await licenseService.hydrateLicenses(licenses);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const purchaseService = strapi.plugin("license-server").service("purchase");
      const where = { id };
      const isAdmin = isAdminUser(ctx.state.user);

      if (ctx.state.user?.id && !isAdmin) {
        where.user = ctx.state.user.id;
      }

      const license = await strapi.db
        .query("plugin::license-server.license")
        .findOne({
          where,
          populate: ["user", "product"],
        });
      if (!license) {
        return ctx.notFound("License not found");
      }
      if (ctx.state.user?.id && !isAdmin) {
        const licenses = await purchaseService.getCustomerLicenses(ctx.state.user.id);
        return licenses.find((item) => item.id === license.id) || (await licenseService.hydrateLicense(license));
      }
      return await licenseService.hydrateLicense(license);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async create(ctx) {
    const {
      user: userId,
      product: productId,
      activation_limit,
      expires_at,
    } = ctx.request.body;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const product = await strapi.db.query("plugin::license-server.product").findOne({
        where: { id: productId },
      });
      const uid = licenseService.generateLicenseKey(product);
      const license = await strapi.db
        .query("plugin::license-server.license")
        .create({
          data: {
            uid,
            user: userId,
            product: productId,
            status: "active",
            activation_limit: activation_limit || 3,
            issued_at: new Date(),
            expires_at: expires_at || null,
          },
          populate: ["user", "product"],
        });
      return await licenseService.hydrateLicense(license);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async update(ctx) {
    const { id } = ctx.params;
    const updateData = ctx.request.body;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const license = await strapi.db
        .query("plugin::license-server.license")
        .update({
          where: { id },
          data: updateData,
          populate: ["user", "product"],
        });
      if (!license) {
        return ctx.notFound("License not found");
      }
      return await licenseService.hydrateLicense(license);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async revoke(ctx) {
    const { id } = ctx.params;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.revokeLicense(id);
    } catch (err) {
      if (err.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }
      ctx.throw(500, err);
    }
  },

  async activateById(ctx) {
    const { id } = ctx.params;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.activateLicenseById(id);
    } catch (err) {
      if (err.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }
      ctx.throw(500, err);
    }
  },

  async deactivateById(ctx) {
    const { id } = ctx.params;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      return await licenseService.revokeLicense(id);
    } catch (err) {
      if (err.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }
      ctx.throw(500, err);
    }
  },

  async activate(ctx) {
    const { license_key, device_fingerprint, plugin_version, platform, csr, machine_id } =
      ctx.request.body;

    try {
      const licenseService = strapi.plugin("license-server").service("license");

      const result = await licenseService.activateLicense({
        licenseKey: license_key,
        deviceFingerprint: device_fingerprint,
        pluginVersion: plugin_version,
        platform,
        csr,
        machineId: machine_id,
        requestIp: ctx.request.ip || ctx.ip,
      });

      return result;
    } catch (err) {
      strapi.log.error("[License] Activation failed:", err.message);
      return ctx.badRequest(err.message);
    }
  },

  async validate(ctx) {
    try {
      const freshnessResult = await verifyRequestFreshness(ctx);
      if (freshnessResult !== true) {
        return freshnessResult;
      }

      let activation = ctx.state.licenseActivation;
      const headers = ctx.request?.headers || {};
      const requestSignature = headers["x-request-signature"];
      let requestPayload = {};

      // If activation not set by policy, look it up from request
      if (!activation) {
        const { activation_id, license_key, device_fingerprint } = ctx.query;

        if (!activation_id && !(license_key && device_fingerprint)) {
          return ctx.badRequest(
            "activation_id or (license_key + device_fingerprint) is required",
          );
        }

        if (activation_id) {
          if (!device_fingerprint && !requestSignature) {
            return ctx.badRequest(
              "device_fingerprint is required when activation_id is used without request signature",
            );
          }

          activation = await strapi.db
            .query("plugin::license-server.activation")
            .findOne({
              where: { id: activation_id },
            });
        } else if (license_key && device_fingerprint) {
          const license = await strapi.db
            .query("plugin::license-server.license")
            .findOne({
              where: { uid: license_key },
            });

          if (!license) {
            return ctx.notFound("License not found");
          }

          activation = await strapi.db
            .query("plugin::license-server.activation")
            .findOne({
              where: {
                license_id: license.id,
                device_fingerprint,
                revoked_at: null,
              },
            });

          if (!activation) {
            const pendingClaim = await findPendingClaimForDevice({
              license,
              deviceFingerprint: device_fingerprint,
            });

            if (pendingClaim) {
              return respondPendingApprovalConflict(ctx, pendingClaim);
            }
          }
        }

        if (!activation) {
          return ctx.notFound("Activation not found");
        }

        if (
          device_fingerprint &&
          activation.device_fingerprint &&
          activation.device_fingerprint !== device_fingerprint
        ) {
          return forbidActivationBindingMismatch(ctx);
        }

        requestPayload = activation_id
          ? { activation_id: String(activation_id) }
          : {
              license_key,
              device_fingerprint,
            };
      } else {
        const { activation_id, license_key, device_fingerprint } = ctx.query;

        if (
          device_fingerprint &&
          activation.device_fingerprint &&
          activation.device_fingerprint !== device_fingerprint
        ) {
          return forbidActivationBindingMismatch(ctx);
        }

        requestPayload = activation_id
          ? { activation_id: String(activation_id) }
          : license_key || device_fingerprint
            ? {
                license_key,
                device_fingerprint,
              }
            : {};
      }

      requestPayload = appendFreshnessFields(requestPayload, headers);

      const licenseService = strapi.plugin("license-server").service("license");
      const result = await licenseService.validateLicense(activation, {
        trustLevel: ctx.state.trustLevel,
        requestSignature,
        requestPayload,
      });
      return result;
    } catch (err) {
      strapi.log.error("[License] Validation failed:", err.message);
      return ctx.unauthorized(err.message);
    }
  },

  async deactivate(ctx) {
    const { license_key, device_fingerprint } = ctx.request.body;

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const result = await licenseService.deactivateLicense({
        licenseKey: license_key,
        deviceFingerprint: device_fingerprint,
      });
      return result;
    } catch (err) {
      if (err.message === "LICENSE_NOT_FOUND") {
        return ctx.notFound("License not found");
      }
      if (err.message === "ACTIVATION_NOT_FOUND") {
        return ctx.notFound("Activation not found");
      }
      ctx.throw(500, err.message);
    }
  },

  async getLicenseStatus(ctx) {
    const { license_key } = ctx.query;

    if (!license_key) {
      return ctx.badRequest("license_key is required");
    }

    const nonceValid = await verifyRequestNonce(ctx);
    if (nonceValid !== true) {
      return nonceValid;
    }

    try {
      const licenseService = strapi.plugin("license-server").service("license");
      const result = await licenseService.getLicenseStatus(license_key);

      if (!result) {
        return ctx.notFound("License not found");
      }

      return result;
    } catch (err) {
      ctx.throw(500, err.message);
    }
  },
};
