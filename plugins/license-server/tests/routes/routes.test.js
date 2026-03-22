describe("License Server route wiring", () => {
  const freshRequire = (modulePath) => {
    const resolved = require.resolve(modulePath);
    if (require.cache?.[resolved]) delete require.cache[resolved];
    return require(modulePath);
  };

  it("exposes public activate/deactivate/status license endpoints", () => {
    const routes = freshRequire("../../server/routes");
    const contentRoutes = routes["content-api"].routes;
    const validateRoute = contentRoutes.find((route) => route.path === "/license/validate");
    const heartbeatRoute = contentRoutes.find((route) => route.path === "/license/heartbeat");
    const claimListRoute = contentRoutes.find(
      (route) => route.path === "/me/licenses/:licenseId/activation-claims",
    );
    const productSearchRoute = contentRoutes.find((route) => route.path === "/products/search");

    expect(contentRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "POST", path: "/license/activate", handler: "plugin::license-server.license.activate" }),
        expect.objectContaining({ method: "POST", path: "/license/deactivate", handler: "plugin::license-server.license.deactivate" }),
        expect.objectContaining({ method: "GET", path: "/license/status", handler: "plugin::license-server.license.getLicenseStatus" }),
        expect.objectContaining({ method: "POST", path: "/me/licenses/:licenseId/activations/:activationId/revoke", handler: "plugin::license-server.activation.revokeMine" }),
        expect.objectContaining({ method: "POST", path: "/me/licenses/:licenseId/activation-claims/:claimId/approve", handler: "plugin::license-server.activation-claim.approve" }),
        expect.objectContaining({ method: "POST", path: "/me/licenses/:licenseId/activation-claims/:claimId/reject", handler: "plugin::license-server.activation-claim.reject" }),
        expect.objectContaining({ method: "POST", path: "/me/orders/:id/redeem-coupon", handler: "plugin::license-server.order.redeemCoupon" }),
      ]),
    );
    expect(claimListRoute.handler).toBe("plugin::license-server.activation-claim.listMine");
    expect(claimListRoute.config).toEqual({});
    expect(productSearchRoute).toEqual(
      expect.objectContaining({
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
      }),
    );
    expect(validateRoute.config.policies).toEqual(["plugin::license-server.verify-mtls"]);
    expect(heartbeatRoute.config.policies).toEqual(["plugin::license-server.verify-mtls"]);
  });

  it("exposes admin activate/deactivate/revoke license endpoints", () => {
    const adminRoutes = freshRequire("../../server/routes/admin");

    expect(adminRoutes.type).toBe("admin");
    expect(adminRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "POST", path: "/licenses/:id/revoke", handler: "license.revoke" }),
        expect.objectContaining({ method: "POST", path: "/licenses/:id/activate", handler: "license.activateById" }),
        expect.objectContaining({ method: "POST", path: "/licenses/:id/deactivate", handler: "license.deactivateById" }),
        expect.objectContaining({ method: "GET", path: "/activation-claims", handler: "activation-claim.listAdmin" }),
        expect.objectContaining({ method: "POST", path: "/activation-claims/:claimId/approve", handler: "activation-claim.approveAdmin" }),
        expect.objectContaining({ method: "POST", path: "/activation-claims/:claimId/reject", handler: "activation-claim.rejectAdmin" }),
        expect.objectContaining({ method: "GET", path: "/coupons", handler: "coupon.find" }),
        expect.objectContaining({ method: "POST", path: "/coupons", handler: "coupon.create" }),
        expect.objectContaining({ method: "PUT", path: "/coupons/:id", handler: "coupon.update" }),
        expect.objectContaining({ method: "GET", path: "/products/:id/versions", handler: "product.getVersions" }),
        expect.objectContaining({ method: "POST", path: "/products/:id/versions", handler: "product.createVersion" }),
        expect.objectContaining({ method: "PUT", path: "/products/:id/versions/:versionId", handler: "product.updateVersion" }),
        expect.objectContaining({ method: "DELETE", path: "/products/:id/versions/:versionId", handler: "product.deleteVersion" }),
      ]),
    );
  });
});