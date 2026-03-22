"use strict";

const parseOptionalInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeBody = (body = {}) => {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "code")) payload.code = body.code;
  if (Object.prototype.hasOwnProperty.call(body, "is_active")) payload.is_active = body.is_active;
  if (Object.prototype.hasOwnProperty.call(body, "covers_full_amount")) payload.covers_full_amount = body.covers_full_amount;
  if (Object.prototype.hasOwnProperty.call(body, "max_redemptions")) {
    const maxRedemptions = parseOptionalInt(body.max_redemptions);
    payload.max_redemptions = maxRedemptions == null ? null : maxRedemptions;
  }
  if (Object.prototype.hasOwnProperty.call(body, "redemption_count")) payload.redemption_count = parseOptionalInt(body.redemption_count);
  if (Object.prototype.hasOwnProperty.call(body, "starts_at")) payload.starts_at = body.starts_at || null;
  if (Object.prototype.hasOwnProperty.call(body, "expires_at")) payload.expires_at = body.expires_at || null;
  if (Object.prototype.hasOwnProperty.call(body, "notes")) payload.notes = body.notes || null;

  return payload;
};

module.exports = {
  async find(ctx) {
    try {
      return await strapi.plugin("license-server").service("coupon").listCoupons({
        limit: ctx.query?.limit,
        offset: ctx.query?.offset,
        search: ctx.query?.search,
        status: ctx.query?.status,
      });
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findOne(ctx) {
    try {
      const coupon = await strapi.plugin("license-server").service("coupon").getCouponById(ctx.params.id);
      if (!coupon) {
        return ctx.notFound("Coupon not found");
      }
      return coupon;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async create(ctx) {
    try {
      return await strapi.plugin("license-server").service("coupon").createCoupon(
        normalizeBody(ctx.request.body),
      );
    } catch (err) {
      if (err.code === "COUPON_CODE_REQUIRED") {
        return ctx.badRequest(err.message);
      }
      ctx.throw(500, err);
    }
  },

  async update(ctx) {
    try {
      const coupon = await strapi.plugin("license-server").service("coupon").updateCoupon(
        ctx.params.id,
        normalizeBody(ctx.request.body),
      );
      if (!coupon) {
        return ctx.notFound("Coupon not found");
      }
      return coupon;
    } catch (err) {
      if (err.code === "COUPON_CODE_REQUIRED") {
        return ctx.badRequest(err.message);
      }
      ctx.throw(500, err);
    }
  },
};