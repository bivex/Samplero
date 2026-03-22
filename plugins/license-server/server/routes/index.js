"use strict";

module.exports = {
  admin: require("./admin"),
  "content-api": {
    type: "content-api",
    routes: [
      {
        method: "POST",
        path: "/license/activate",
        handler: "plugin::license-server.license.activate",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/license/validate",
        handler: "plugin::license-server.license.validate",
        config: {
          auth: false,
          policies: ["plugin::license-server.verify-mtls"],
        },
      },
      {
        method: "POST",
        path: "/license/deactivate",
        handler: "plugin::license-server.license.deactivate",
        config: {
          auth: false,
        },
      },
      {
        method: "POST",
        path: "/license/heartbeat",
        handler: "plugin::license-server.activation.heartbeat",
        config: {
          auth: false,
          policies: ["plugin::license-server.verify-mtls"],
        },
      },
      {
        method: "POST",
        path: "/license/bootstrap",
        handler: "plugin::license-server.activation.bootstrap",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/license/status",
        handler: "plugin::license-server.license.getLicenseStatus",
        config: {
          policies: ["rate-limit"],
          auth: false,
        },
      },
      {
        method: "POST",
        path: "/webhooks/payment",
        handler: "plugin::license-server.webhook.handlePayment",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/me/licenses",
        handler: "plugin::license-server.license.find",
        config: {},
      },
      {
        method: "GET",
        path: "/me/licenses/:licenseId/activation-claims",
        handler: "plugin::license-server.activation-claim.listMine",
        config: {},
      },
      {
        method: "POST",
        path: "/me/licenses/:licenseId/activations/:activationId/revoke",
        handler: "plugin::license-server.activation.revokeMine",
        config: {},
      },
      {
        method: "POST",
        path: "/me/licenses/:licenseId/activation-claims/:claimId/approve",
        handler: "plugin::license-server.activation-claim.approve",
        config: {},
      },
      {
        method: "POST",
        path: "/me/licenses/:licenseId/activation-claims/:claimId/reject",
        handler: "plugin::license-server.activation-claim.reject",
        config: {},
      },
      {
        method: "GET",
        path: "/me/orders",
        handler: "plugin::license-server.order.find",
        config: {},
      },
      {
        method: "POST",
        path: "/me/orders/:id/redeem-coupon",
        handler: "plugin::license-server.order.redeemCoupon",
        config: {},
      },
      {
        method: "GET",
        path: "/me/downloads",
        handler: "plugin::license-server.product.getMyDownloads",
        config: {},
      },
      {
        method: "GET",
        path: "/products",
        handler: "plugin::license-server.product.find",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/products/search",
        handler: "plugin::license-server.product.search",
        config: {
          auth: false,
          policies: [
            {
              name: "rate-limit",
              config: {
                maxRequests: 30,
                windowSeconds: 60,
              },
            },
          ],
        },
      },
      {
        method: "GET",
        path: "/products/:slug",
        handler: "plugin::license-server.product.findBySlug",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/products/:id/versions",
        handler: "plugin::license-server.product.getVersions",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/products/:id/versions/latest",
        handler: "plugin::license-server.product.getLatestVersion",
        config: {
          auth: false,
        },
      },
      {
        method: "GET",
        path: "/products/:productId/versions/:versionId/download",
        handler: "plugin::license-server.product.getDownloadUrl",
        config: {},
      },
      {
        method: "GET",
        path: "/orders",
        handler: "plugin::license-server.order.find",
        config: {},
      },
      {
        method: "GET",
        path: "/orders/:id",
        handler: "plugin::license-server.order.findOne",
        config: {},
      },
      {
        method: "POST",
        path: "/orders",
        handler: "plugin::license-server.order.create",
        config: {},
      },
      {
        method: "GET",
        path: "/orders/:id/items",
        handler: "plugin::license-server.order.getItems",
        config: {},
      },
    ],
  },
};
