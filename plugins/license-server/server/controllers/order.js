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

const decorateOrder = (purchaseService, order) =>
  typeof purchaseService?.decorateOrderExperience === "function"
    ? purchaseService.decorateOrderExperience({ order })
    : order;

const requireAuthenticatedUser = (ctx) => {
  if (ctx.state.user?.id) {
    return true;
  }

  ctx.unauthorized("Authentication required");
  return false;
};

const ORDER_SORTERS = {
  createdAt: (order) => order.createdAt || null,
  total_amount_cents: (order) => order.total_amount_cents || 0,
  status: (order) => order.status || "",
  customer: (order) => order.user?.email || order.user?.username || "",
  reference: (order) => order.order_reference || order.id || 0,
};

const filterOrders = ({ orders, searchTerm }) =>
  orders.filter((order) =>
    matchesSearch(searchTerm, [
      order.id,
      order.order_reference,
      order.payment_id,
      order.status,
      order.user?.email,
      order.user?.username,
      ...(order.items || []).map((item) => item.product?.name),
    ]),
  );

module.exports = {
  async find(ctx) {
    if (!requireAuthenticatedUser(ctx)) {
      return;
    }

    const userId = ctx.state.user?.id;
    const { status } = ctx.query;
    const searchTerm = normalizeSearchTerm(ctx.query?.search);
    const limit = parseQueryInt(ctx.query?.limit, 20);
    const offset = parseQueryInt(ctx.query?.offset, 0);
    const isAdmin = isAdminUser(ctx.state.user);
    const hasAdvancedFilters = Boolean(searchTerm || ctx.query?.sortBy || ctx.query?.sortDir);

    const where = userId && !isAdmin ? { user: userId } : {};
    if (status && status !== "all") where.status = status;

    try {
      const purchaseService = strapi.plugin("license-server").service("purchase");

      if (hasAdvancedFilters) {
        const sortBy = ORDER_SORTERS[ctx.query?.sortBy] ? ctx.query.sortBy : "createdAt";
        const sortDir = normalizeSortDirection(ctx.query?.sortDir, "desc");
        const allOrders = await strapi.db.query("plugin::license-server.order").findMany({
          where,
          populate: ["user", "items", "items.product", "items.license"],
        });
        const decoratedOrders = allOrders.map((order) =>
          decorateOrder(purchaseService, order),
        );
        const filteredOrders = filterOrders({ orders: decoratedOrders, searchTerm });
        const sortedOrders = sortItems(filteredOrders, ORDER_SORTERS[sortBy], sortDir);

        return {
          orders: sortedOrders.slice(offset, offset + limit),
          total: sortedOrders.length,
          limit,
          offset,
        };
      }

      const [orders, total] = await Promise.all([
        strapi.db.query("plugin::license-server.order").findMany({
          where,
          populate: ["user", "items", "items.product", "items.license"],
          limit,
          offset,
          orderBy: { createdAt: "desc" },
        }),
        strapi.db.query("plugin::license-server.order").count({ where }),
      ]);

      return {
        orders: orders.map((order) => decorateOrder(purchaseService, order)),
        total,
        limit,
        offset,
      };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findOne(ctx) {
    if (!requireAuthenticatedUser(ctx)) {
      return;
    }

    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const isAdmin = isAdminUser(ctx.state.user);

    try {
      const purchaseService = strapi.plugin("license-server").service("purchase");
      const where = { id };
      if (!isAdmin) {
        where.user = userId;
      }

      const order = await strapi.db
        .query("plugin::license-server.order")
        .findOne({
          where,
          populate: ["user", "items", "items.product", "items.license"],
        });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      return decorateOrder(purchaseService, order);
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async create(ctx) {
    const userId = ctx.state.user?.id;
    const { items, payment_method, coupon_code } = ctx.request.body;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return ctx.badRequest("Order must have at least one item");
    }

    try {
      let totalAmount = 0;
      const orderItems = [];
      const products = [];
      const orderQuery = strapi.db.query("plugin::license-server.order");
      const orderItemQuery = strapi.db.query("plugin::license-server.order-item");
      const purchaseService = strapi.plugin("license-server").service("purchase");
      const couponService = strapi.plugin("license-server").service("coupon");

      for (const item of items) {
        const product = await strapi.db
          .query("plugin::license-server.product")
          .findOne({
            where: { id: item.product_id },
          });

        if (!product) {
          return ctx.badRequest(`Product ${item.product_id} not found`);
        }

        if (!product.is_active) {
          return ctx.badRequest(`Product ${product.name} is not available`);
        }

        products.push(product);

        const priceAtPurchase = product.price_cents * (item.quantity || 1);
        totalAmount += priceAtPurchase;

        orderItems.push({
          product: product.id,
          price_at_purchase: product.price_cents,
          quantity: item.quantity || 1,
        });
      }

      await purchaseService.assertProductsDeliverable(products);

      const couponApplication = await couponService.resolveFullDiscountCoupon({
        couponCode: coupon_code,
        subtotalAmountCents: totalAmount,
      });
      const finalTotal = couponApplication?.total_amount_cents ?? totalAmount;
      const finalPaymentMethod = couponApplication?.payment_method ?? payment_method;

      const order = await orderQuery.create({
        data: {
          user: userId,
          total_amount_cents: finalTotal,
          subtotal_amount_cents: totalAmount,
          discount_amount_cents: couponApplication?.discount_amount_cents ?? 0,
          currency: "USD",
          status: "pending",
          payment_method: finalPaymentMethod,
          payment_id: couponApplication?.payment_id ?? null,
          coupon: couponApplication?.coupon?.id ?? null,
          coupon_code: couponApplication?.coupon_code ?? null,
        },
      });

      await Promise.all(
        orderItems.map((item) =>
          orderItemQuery.create({
            data: {
              ...item,
              order: order.id,
            },
          }),
        ),
      );

      if (couponApplication) {
        const fulfillment = await purchaseService.fulfillPaidOrder({
          orderId: order.id,
          paymentId: couponApplication.payment_id,
        });

        await couponService.markCouponRedeemed({ couponId: couponApplication.coupon.id });

        return fulfillment.order;
      }

      const createdOrder = await orderQuery.findOne({
        where: { id: order.id },
        populate: ["items", "items.product", "items.license", "coupon"],
      });

      return decorateOrder(purchaseService, createdOrder);
    } catch (err) {
      if (err.code === "PRODUCT_NOT_DELIVERABLE") {
        return ctx.badRequest(err.message);
      }
      if (["COUPON_INVALID", "COUPON_UNAVAILABLE", "COUPON_NOT_FULL_DISCOUNT"].includes(err.code)) {
        return ctx.badRequest(err.message);
      }
      ctx.throw(500, err);
    }
  },

  async redeemCoupon(ctx) {
    const userId = ctx.state.user?.id;
    const orderId = ctx.params?.id;
    const couponCode = String(ctx.request.body?.coupon_code || "").trim();

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    if (!couponCode) {
      return ctx.badRequest("Coupon code is required");
    }

    try {
      const orderQuery = strapi.db.query("plugin::license-server.order");
      const purchaseService = strapi.plugin("license-server").service("purchase");
      const couponService = strapi.plugin("license-server").service("coupon");
      const order = await orderQuery.findOne({
        where: { id: orderId, user: userId },
      });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      if (order.status !== "pending") {
        return ctx.badRequest("Only pending orders can accept a coupon");
      }

      if (order.coupon_code || order.payment_method === "coupon") {
        return ctx.badRequest("A coupon is already applied to this order");
      }

      const couponApplication = await couponService.resolveFullDiscountCoupon({
        couponCode,
        subtotalAmountCents: order.subtotal_amount_cents ?? order.total_amount_cents ?? 0,
      });

      await orderQuery.update({
        where: { id: order.id },
        data: {
          total_amount_cents: couponApplication.total_amount_cents,
          subtotal_amount_cents: order.subtotal_amount_cents ?? order.total_amount_cents ?? 0,
          discount_amount_cents: couponApplication.discount_amount_cents ?? 0,
          payment_method: couponApplication.payment_method,
          payment_id: couponApplication.payment_id,
          coupon: couponApplication.coupon?.id ?? null,
          coupon_code: couponApplication.coupon_code,
        },
      });

      const fulfillment = await purchaseService.fulfillPaidOrder({
        orderId: order.id,
        paymentId: couponApplication.payment_id,
      });

      await couponService.markCouponRedeemed({ couponId: couponApplication.coupon.id });

      return fulfillment.order;
    } catch (err) {
      if (["COUPON_INVALID", "COUPON_UNAVAILABLE", "COUPON_NOT_FULL_DISCOUNT"].includes(err.code)) {
        return ctx.badRequest(err.message);
      }
      if (err.code === "PRODUCT_NOT_DELIVERABLE") {
        return ctx.badRequest(err.message);
      }
      ctx.throw(500, err);
    }
  },

  async getItems(ctx) {
    if (!requireAuthenticatedUser(ctx)) {
      return;
    }

    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const isAdmin = isAdminUser(ctx.state.user);

    try {
      const where = { id };
      const orderItemQuery = strapi.db.query("plugin::license-server.order-item");
      if (!isAdmin) {
        where.user = userId;
      }

      const order = await strapi.db
        .query("plugin::license-server.order")
        .findOne({
          where,
          populate: ["items", "items.product", "items.license"],
        });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      const items = await orderItemQuery.findMany({
        where: { order: order.id },
        populate: ["product", "license"],
      });

      return { items };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async markAsPaid(ctx) {
    const { id } = ctx.params;
    const { payment_id } = ctx.request.body;

    try {
      return await strapi.plugin("license-server").service("purchase").fulfillPaidOrder({
        orderId: id,
        paymentId: payment_id,
      });
    } catch (err) {
      if (err.message === "ORDER_NOT_FOUND") {
        return ctx.notFound("Order not found");
      }
      if (err.message === "ORDER_NOT_PENDING") {
        return ctx.badRequest("Order is not pending");
      }
      if (err.code === "PRODUCT_NOT_DELIVERABLE") {
        return ctx.badRequest(err.message);
      }
      ctx.throw(500, err);
    }
  },

  async refund(ctx) {
    const { id } = ctx.params;
    const { reason } = ctx.request.body;

    try {
      const order = await strapi.db
        .query("plugin::license-server.order")
        .findOne({
          where: { id },
          populate: ["items"],
        });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      if (order.status !== "paid") {
        return ctx.badRequest("Only paid orders can be refunded");
      }

      const updatedOrder = await strapi.db
        .query("plugin::license-server.order")
        .update({
          where: { id },
          data: { status: "refunded", refund_reason: reason },
        });
      await strapi.plugin("license-server").service("purchase").revokeOrderLicenses({
        orderId: id,
        reason: `Refunded: ${reason || "No reason provided"}`,
      });

      return updatedOrder;
    } catch (err) {
      ctx.throw(500, err);
    }
  },
};
