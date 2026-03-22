"use strict";

const {
  matchesSearch,
  normalizeSearchTerm,
  normalizeSortDirection,
  parseQueryInt,
  sortItems,
} = require("../utils/admin-list");

const CLAIM_STATUS = {
  PENDING_CONFIRMATION: "pending_confirmation",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
};

const DEFAULT_CLAIM_TTL_MS = 15 * 60 * 1000;
const CLAIM_POPULATE = ["license", "license.user", "license.product", "owner_user", "approved_by"];

const claimQuery = () => strapi.db.query("plugin::license-server.first-activation-claim");

const normalizeUserId = (value) => value?.id || value || null;

const serializeUser = (user) => {
  if (!user || typeof user !== "object") return null;
  return {
    id: normalizeUserId(user),
    email: user.email || null,
    username: user.username || null,
  };
};

const serializeLicense = (license) => {
  if (!license || typeof license !== "object") return null;
  return {
    id: license.id,
    uid: license.uid || null,
    status: license.status || null,
    user: serializeUser(license.user),
    product: license.product
      ? {
          id: license.product.id || license.product,
          name: license.product.name || null,
          slug: license.product.slug || null,
        }
      : null,
  };
};

const ensurePendingClaim = (claim) => {
  if (claim.status === CLAIM_STATUS.EXPIRED) {
    throw new Error("CLAIM_EXPIRED");
  }

  if (claim.status !== CLAIM_STATUS.PENDING_CONFIRMATION) {
    throw new Error("CLAIM_NOT_PENDING");
  }

  return claim;
};

const serializeClaim = (claim) => ({
  id: claim.id,
  status: claim.status,
  license_id: claim.license?.id || claim.license || null,
  owner_user_id: normalizeUserId(claim.owner_user),
  approved_by: normalizeUserId(claim.approved_by),
  device_fingerprint: claim.device_fingerprint,
  key_hash: claim.key_hash || null,
  csr_fingerprint: claim.csr_fingerprint || null,
  plugin_version: claim.plugin_version || null,
  platform: claim.platform || null,
  machine_id: claim.machine_id || null,
  request_ip: claim.request_ip || null,
  risk_score: claim.risk_score || 0,
  risk_reasons: claim.risk_reasons || [],
  attempt_count: claim.attempt_count || 0,
  expires_at: claim.expires_at,
  approved_at: claim.approved_at || null,
  rejected_at: claim.rejected_at || null,
  rejection_reason: claim.rejection_reason || null,
  created_at: claim.createdAt || claim.created_at || null,
  license: serializeLicense(claim.license),
  owner_user: serializeUser(claim.owner_user),
  approved_by_user: serializeUser(claim.approved_by),
});

const isExpired = (claim) => {
  if (!claim?.expires_at) {
    return false;
  }

  return new Date(claim.expires_at).getTime() <= Date.now();
};

const ensureLicenseOwnership = async ({ licenseId, ownerUserId }) => {
  const license = await strapi.db.query("plugin::license-server.license").findOne({
    where: { id: licenseId, user: ownerUserId },
    populate: ["user", "product"],
  });

  if (!license) {
    throw new Error("LICENSE_NOT_FOUND");
  }

  return license;
};

const CLAIM_SORTERS = {
  createdAt: (claim) => claim.createdAt || claim.created_at || null,
  expires_at: (claim) => claim.expires_at || null,
  risk_score: (claim) => claim.risk_score || 0,
  status: (claim) => claim.status || "",
  owner: (claim) => claim.owner_user?.email || claim.license?.user?.email || "",
  license: (claim) => claim.license?.uid || claim.license?.product?.name || claim.license_id || 0,
};

const filterAdminClaims = ({ claims, searchTerm }) =>
  claims.filter((claim) =>
    matchesSearch(searchTerm, [
      claim.id,
      claim.status,
      claim.device_fingerprint,
      claim.machine_id,
      claim.platform,
      claim.license?.uid,
      claim.license?.product?.name,
      claim.owner_user?.email,
      claim.owner_user?.username,
      claim.license?.user?.email,
    ]),
  );

module.exports = {
  CLAIM_STATUS,

  computeFirstActivationRisk({ hasOwnerSession = false, competingClaim = false }) {
    const reasons = [];
    let score = 0;

    if (!hasOwnerSession) {
      score += 25;
      reasons.push("first_activation_requires_owner_confirmation");
    }

    if (competingClaim) {
      score += 75;
      reasons.push("competing_pending_claim");
    }

    return {
      score,
      reasons,
      decision: score >= 60 ? "reject" : hasOwnerSession && score <= 0 ? "auto_approve" : "pending_confirmation",
    };
  },

  async expireClaimIfNeeded(claim) {
    if (!claim || claim.status !== CLAIM_STATUS.PENDING_CONFIRMATION || !isExpired(claim)) {
      return claim;
    }

    return await claimQuery().update({
      where: { id: claim.id },
      data: { status: CLAIM_STATUS.EXPIRED },
      populate: CLAIM_POPULATE,
    });
  },

  async findOpenClaimForLicense(licenseId) {
    const query = claimQuery();
    const claims = typeof query.findMany === "function"
      ? await query.findMany({
          where: {
            license: licenseId,
            status: CLAIM_STATUS.PENDING_CONFIRMATION,
          },
          populate: CLAIM_POPULATE,
          orderBy: [{ createdAt: "desc" }],
        })
      : [
          await query.findOne({
            where: {
              license: licenseId,
              status: CLAIM_STATUS.PENDING_CONFIRMATION,
            },
            populate: CLAIM_POPULATE,
          }),
        ].filter(Boolean);

    for (const claim of claims) {
      const normalized = await this.expireClaimIfNeeded(claim);
      if (normalized?.status === CLAIM_STATUS.PENDING_CONFIRMATION) {
        return normalized;
      }
    }

    return null;
  },

  async createPendingClaim({
    license,
    deviceFingerprint,
    keyHash,
    csrFingerprint,
    pluginVersion,
    platform,
    csr,
    machineId,
    requestIp,
    riskScore = 0,
    riskReasons = [],
  }) {
    const resolvedMachineId = machineId || deviceFingerprint || null;

    return await claimQuery().create({
      data: {
        license: license.id,
        owner_user: normalizeUserId(license.user),
        status: CLAIM_STATUS.PENDING_CONFIRMATION,
        device_fingerprint: deviceFingerprint,
        key_hash: keyHash || null,
        csr_fingerprint: csrFingerprint || null,
        plugin_version: pluginVersion || null,
        platform: platform || null,
        csr: csr || null,
        machine_id: resolvedMachineId,
        request_ip: requestIp || null,
        risk_score: riskScore,
        risk_reasons: riskReasons,
        attempt_count: 1,
        expires_at: new Date(Date.now() + DEFAULT_CLAIM_TTL_MS),
      },
      populate: CLAIM_POPULATE,
    });
  },

  async incrementCompetingAttempt(claim) {
    if (!claim?.id) {
      return null;
    }

    return await claimQuery().update({
      where: { id: claim.id },
      data: {
        attempt_count: Math.max(1, claim.attempt_count || 1) + 1,
      },
      populate: CLAIM_POPULATE,
    });
  },

  async listClaimsForOwner({ ownerUserId, licenseId }) {
    const resolvedLicenseId = Number(licenseId);
    await ensureLicenseOwnership({ licenseId: resolvedLicenseId, ownerUserId });
    const claims = await claimQuery().findMany({
      where: {
        license: resolvedLicenseId,
        owner_user: ownerUserId,
      },
      populate: CLAIM_POPULATE,
      orderBy: [{ createdAt: "desc" }],
    });

    return claims.map(serializeClaim);
  },

  async listClaimsForAdmin({
    status,
    limit = 20,
    offset = 0,
    search,
    sortBy,
    sortDir,
  }) {
    const normalizedLimit = parseQueryInt(limit, 20);
    const normalizedOffset = parseQueryInt(offset, 0);
    const where = status && status !== "all" ? { status } : {};
    const searchTerm = normalizeSearchTerm(search);
    const hasAdvancedFilters = Boolean(searchTerm || sortBy || sortDir);

    if (hasAdvancedFilters) {
      const resolvedSortBy = CLAIM_SORTERS[sortBy] ? sortBy : "createdAt";
      const resolvedSortDir = normalizeSortDirection(sortDir, "desc");
      const claims = await claimQuery().findMany({
        where,
        populate: CLAIM_POPULATE,
        orderBy: [{ createdAt: "desc" }],
      });
      const filteredClaims = filterAdminClaims({ claims, searchTerm });
      const sortedClaims = sortItems(
        filteredClaims,
        CLAIM_SORTERS[resolvedSortBy],
        resolvedSortDir,
      );

      return {
        claims: sortedClaims
          .slice(normalizedOffset, normalizedOffset + normalizedLimit)
          .map(serializeClaim),
        total: sortedClaims.length,
        limit: normalizedLimit,
        offset: normalizedOffset,
      };
    }

    const [claims, total] = await Promise.all([
      claimQuery().findMany({
        where,
        populate: CLAIM_POPULATE,
        limit: normalizedLimit,
        offset: normalizedOffset,
        orderBy: [{ createdAt: "desc" }],
      }),
      claimQuery().count({ where }),
    ]);

    return {
      claims: claims.map(serializeClaim),
      total,
      limit: normalizedLimit,
      offset: normalizedOffset,
    };
  },

  async approveClaim({ claimId, licenseId, actorUserId }) {
    const claim = await claimQuery().findOne({
      where: { id: claimId },
      populate: CLAIM_POPULATE,
    });

    if (!claim) {
      throw new Error("CLAIM_NOT_FOUND");
    }

    const normalizedClaim = ensurePendingClaim(await this.expireClaimIfNeeded(claim));

    if (Number(normalizedClaim.license?.id || normalizedClaim.license) !== Number(licenseId)) {
      throw new Error("CLAIM_LICENSE_MISMATCH");
    }

    if (Number(normalizeUserId(normalizedClaim.owner_user)) !== Number(actorUserId)) {
      throw new Error("FORBIDDEN");
    }

    const licenseService = strapi.plugin("license-server").service("license");
    const activationResult = await licenseService.finalizeFirstActivationClaim({
      claim: normalizedClaim,
    });

    await claimQuery().update({
      where: { id: normalizedClaim.id },
      data: {
        status: CLAIM_STATUS.APPROVED,
        approved_at: new Date(),
        approved_by: actorUserId,
      },
    });

    return activationResult;
  },

  async approveClaimAsAdmin({ claimId, actorUserId }) {
    const claim = await claimQuery().findOne({
      where: { id: claimId },
      populate: CLAIM_POPULATE,
    });

    if (!claim) {
      throw new Error("CLAIM_NOT_FOUND");
    }

    const normalizedClaim = ensurePendingClaim(await this.expireClaimIfNeeded(claim));
    const licenseService = strapi.plugin("license-server").service("license");
    const activationResult = await licenseService.finalizeFirstActivationClaim({
      claim: normalizedClaim,
    });

    await claimQuery().update({
      where: { id: normalizedClaim.id },
      data: {
        status: CLAIM_STATUS.APPROVED,
        approved_at: new Date(),
        approved_by: actorUserId,
      },
    });

    return activationResult;
  },

  async rejectClaim({ claimId, licenseId, actorUserId, reason }) {
    const claim = await claimQuery().findOne({
      where: { id: claimId },
      populate: CLAIM_POPULATE,
    });

    if (!claim) {
      throw new Error("CLAIM_NOT_FOUND");
    }

    const normalizedClaim = ensurePendingClaim(await this.expireClaimIfNeeded(claim));

    if (Number(normalizedClaim.license?.id || normalizedClaim.license) !== Number(licenseId)) {
      throw new Error("CLAIM_LICENSE_MISMATCH");
    }

    if (Number(normalizeUserId(normalizedClaim.owner_user)) !== Number(actorUserId)) {
      throw new Error("FORBIDDEN");
    }

    const rejected = await claimQuery().update({
      where: { id: normalizedClaim.id },
      data: {
        status: CLAIM_STATUS.REJECTED,
        rejected_at: new Date(),
        rejection_reason: reason || "owner_rejected",
      },
      populate: CLAIM_POPULATE,
    });

    return serializeClaim(rejected);
  },

  async rejectClaimAsAdmin({ claimId, actorUserId, reason }) {
    const claim = await claimQuery().findOne({
      where: { id: claimId },
      populate: CLAIM_POPULATE,
    });

    if (!claim) {
      throw new Error("CLAIM_NOT_FOUND");
    }

    const normalizedClaim = ensurePendingClaim(await this.expireClaimIfNeeded(claim));
    const rejected = await claimQuery().update({
      where: { id: normalizedClaim.id },
      data: {
        status: CLAIM_STATUS.REJECTED,
        rejected_at: new Date(),
        rejection_reason: reason || "admin_rejected",
        approved_by: actorUserId,
      },
      populate: CLAIM_POPULATE,
    });

    return serializeClaim(rejected);
  },
};