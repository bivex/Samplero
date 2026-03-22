"use strict";

const mapClaimError = (ctx, err) => {
  if (["CLAIM_NOT_FOUND", "LICENSE_NOT_FOUND"].includes(err.message)) {
    return ctx.notFound("Activation claim not found");
  }

  if (err.message === "FORBIDDEN") {
    return (ctx.forbidden || ctx.unauthorized).call(ctx, "Forbidden");
  }

  if (
    [
      "CLAIM_NOT_PENDING",
      "CLAIM_EXPIRED",
      "CLAIM_LICENSE_MISMATCH",
      "FIRST_ACTIVATION_ALREADY_COMPLETED",
      "CLAIM_PROOF_MISMATCH",
    ].includes(err.message)
  ) {
    return ctx.badRequest(err.message);
  }

  return ctx.throw(500, err);
};

module.exports = {
  async listAdmin(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.listClaimsForAdmin({
        status: ctx.query?.status,
        limit: ctx.query?.limit,
        offset: ctx.query?.offset,
        search: ctx.query?.search,
        sortBy: ctx.query?.sortBy,
        sortDir: ctx.query?.sortDir,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },

  async listMine(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.listClaimsForOwner({
        ownerUserId: userId,
        licenseId: ctx.params.licenseId,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },

  async approve(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.approveClaim({
        claimId: ctx.params.claimId,
        licenseId: ctx.params.licenseId,
        actorUserId: userId,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },

  async approveAdmin(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.approveClaimAsAdmin({
        claimId: ctx.params.claimId,
        actorUserId: userId,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },

  async reject(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.rejectClaim({
        claimId: ctx.params.claimId,
        licenseId: ctx.params.licenseId,
        actorUserId: userId,
        reason: ctx.request.body?.reason,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },

  async rejectAdmin(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const service = strapi.plugin("license-server").service("activation-claim");
      return await service.rejectClaimAsAdmin({
        claimId: ctx.params.claimId,
        actorUserId: userId,
        reason: ctx.request.body?.reason,
      });
    } catch (err) {
      return mapClaimError(ctx, err);
    }
  },
};