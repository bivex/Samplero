"use strict";

const {
  matchesSearch,
  normalizeSearchTerm,
  parseQueryInt,
} = require("../utils/admin-list");

const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const createCouponError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getCouponStatus = (coupon) => {
  const now = Date.now();
  const startsAt = coupon?.starts_at ? new Date(coupon.starts_at).getTime() : null;
  const expiresAt = coupon?.expires_at ? new Date(coupon.expires_at).getTime() : null;
  const remaining = coupon?.max_redemptions == null
    ? null
    : Math.max(0, Number(coupon.max_redemptions || 0) - Number(coupon.redemption_count || 0));

  if (!coupon?.is_active) return "inactive";
  if (startsAt && startsAt > now) return "scheduled";
  if (expiresAt && expiresAt < now) return "expired";
  if (remaining !== null && remaining <= 0) return "exhausted";
  return "redeemable";
};

const serializeCoupon = (coupon) => {
  if (!coupon) return null;

  const remainingRedemptions = coupon.max_redemptions == null
    ? null
    : Math.max(0, Number(coupon.max_redemptions || 0) - Number(coupon.redemption_count || 0));

  return {
    ...coupon,
    code: normalizeCode(coupon.code),
    remaining_redemptions: remainingRedemptions,
    status_label: getCouponStatus(coupon),
    is_redeemable: getCouponStatus(coupon) === "redeemable",
  };
};

async function findCouponByCode(code) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  return strapi.db.query("plugin::license-server.coupon").findOne({
    where: { code: normalizedCode },
  });
}

module.exports = {
  normalizeCode,

  serializeCoupon,

  async listCoupons({ limit = 50, offset = 0, search = "", status = "all" } = {}) {
    const normalizedSearch = normalizeSearchTerm(search);
    const normalizedLimit = parseQueryInt(limit, 50);
    const normalizedOffset = parseQueryInt(offset, 0);
    const coupons = await strapi.db.query("plugin::license-server.coupon").findMany({
      orderBy: { createdAt: "desc" },
    });

    const serialized = coupons
      .map(serializeCoupon)
      .filter((coupon) => matchesSearch(normalizedSearch, [coupon.code, coupon.notes, coupon.status_label]))
      .filter((coupon) => status === "all" || coupon.status_label === status);

    return {
      coupons: serialized.slice(normalizedOffset, normalizedOffset + normalizedLimit),
      total: serialized.length,
      limit: normalizedLimit,
      offset: normalizedOffset,
    };
  },

  async createCoupon(data = {}) {
    const normalizedCode = normalizeCode(data.code);
    if (!normalizedCode) {
      throw createCouponError("Coupon code is required", "COUPON_CODE_REQUIRED");
    }

    const created = await strapi.db.query("plugin::license-server.coupon").create({
      data: {
        code: normalizedCode,
        is_active: data.is_active !== false,
        covers_full_amount: data.covers_full_amount !== false,
        max_redemptions: data.max_redemptions ?? null,
        redemption_count: data.redemption_count ?? 0,
        starts_at: data.starts_at || null,
        expires_at: data.expires_at || null,
        notes: data.notes || null,
      },
    });

    return serializeCoupon(created);
  },

  async updateCoupon(id, data = {}) {
    const updateData = { ...data };
    if (Object.prototype.hasOwnProperty.call(updateData, "code")) {
      updateData.code = normalizeCode(updateData.code);
      if (!updateData.code) {
        throw createCouponError("Coupon code is required", "COUPON_CODE_REQUIRED");
      }
    }

    const updated = await strapi.db.query("plugin::license-server.coupon").update({
      where: { id },
      data: updateData,
    });

    return serializeCoupon(updated);
  },

  async getCouponById(id) {
    const coupon = await strapi.db.query("plugin::license-server.coupon").findOne({
      where: { id },
    });
    return serializeCoupon(coupon);
  },

  async resolveFullDiscountCoupon({ couponCode, subtotalAmountCents }) {
    const normalizedCode = normalizeCode(couponCode);
    if (!normalizedCode) {
      return null;
    }

    const coupon = await findCouponByCode(normalizedCode);
    if (!coupon) {
      throw createCouponError("Coupon code is invalid", "COUPON_INVALID");
    }

    const statusLabel = getCouponStatus(coupon);
    if (statusLabel !== "redeemable") {
      const errorMessages = {
        inactive: "Coupon is not active",
        scheduled: "Coupon is not active yet",
        expired: "Coupon has expired",
        exhausted: "Coupon has no redemptions left",
      };
      throw createCouponError(errorMessages[statusLabel] || "Coupon cannot be used", "COUPON_UNAVAILABLE");
    }

    if (coupon.covers_full_amount === false) {
      throw createCouponError("Coupon does not cover the full amount", "COUPON_NOT_FULL_DISCOUNT");
    }

    return {
      coupon,
      coupon_code: normalizedCode,
      subtotal_amount_cents: subtotalAmountCents,
      discount_amount_cents: subtotalAmountCents,
      total_amount_cents: 0,
      payment_method: "coupon",
      payment_id: `coupon:${normalizedCode}`,
    };
  },

  async markCouponRedeemed({ couponId }) {
    const couponQuery = strapi.db.query("plugin::license-server.coupon");
    const existing = await couponQuery.findOne({ where: { id: couponId } });
    if (!existing) {
      throw createCouponError("Coupon not found", "COUPON_NOT_FOUND");
    }

    const updated = await couponQuery.update({
      where: { id: couponId },
      data: { redemption_count: Number(existing.redemption_count || 0) + 1 },
    });

    return serializeCoupon(updated);
  },
};