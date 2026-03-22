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

module.exports = {
  type: "admin",
  routes: [
  // License Admin
  {
    method: "GET",
    path: "/licenses",
    handler: "license.find",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/licenses/:id",
    handler: "license.findOne",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/licenses",
    handler: "license.create",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "PUT",
    path: "/licenses/:id",
    handler: "license.update",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/licenses/:id/revoke",
    handler: "license.revoke",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/licenses/:id/activate",
    handler: "license.activateById",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/licenses/:id/deactivate",
    handler: "license.deactivateById",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },

  // Activation Admin
  {
    method: "GET",
    path: "/activations",
    handler: "activation.find",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/activations/:id",
    handler: "activation.findOne",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/activations/:id/revoke",
    handler: "activation.revoke",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },

  // Activation Claim Admin
  {
    method: "GET",
    path: "/activation-claims",
    handler: "activation-claim.listAdmin",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/activation-claims/:claimId/approve",
    handler: "activation-claim.approveAdmin",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/activation-claims/:claimId/reject",
    handler: "activation-claim.rejectAdmin",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },

  // Product Admin
  {
    method: "GET",
    path: "/products",
    handler: "product.find",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/products/:id",
    handler: "product.findOne",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/products",
    handler: "product.create",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "PUT",
    path: "/products/:id",
    handler: "product.update",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "DELETE",
    path: "/products/:id",
    handler: "product.delete",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/products/:id/versions",
    handler: "product.getVersions",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/products/:id/versions",
    handler: "product.createVersion",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "PUT",
    path: "/products/:id/versions/:versionId",
    handler: "product.updateVersion",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "DELETE",
    path: "/products/:id/versions/:versionId",
    handler: "product.deleteVersion",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },

  // Coupon Admin
  {
    method: "GET",
    path: "/coupons",
    handler: "coupon.find",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/coupons/:id",
    handler: "coupon.findOne",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/coupons",
    handler: "coupon.create",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "PUT",
    path: "/coupons/:id",
    handler: "coupon.update",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },

  // Order Admin
  {
    method: "GET",
    path: "/orders",
    handler: "order.find",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "GET",
    path: "/orders/:id",
    handler: "order.findOne",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/orders/:id/mark-paid",
    handler: "order.markAsPaid",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  {
    method: "POST",
    path: "/orders/:id/refund",
    handler: "order.refund",
    config: { policies: ["admin::isAuthenticatedAdmin"] },
  },
  ],
};
