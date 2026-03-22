const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("License and Activation controller error paths", () => {
  const makeLog = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

  describe("Activation controller", () => {
    let controller;
    let ctx;

    beforeEach(() => {
      ctx = { params: {}, request: { body: {}, headers: {} }, state: {}, throw: jest.fn(), badRequest: jest.fn(), conflict: jest.fn(), serviceUnavailable: jest.fn(), forbidden: jest.fn(), notFound: jest.fn() };
      global.strapi = {
        config: {
          get: jest.fn(() => ({
            freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
            requireFreshnessStore: false,
          })),
        },
        log: makeLog(),
        db: { query: jest.fn() },
        plugin: jest.fn(() => ({
          service: jest.fn(() => ({
            hydrateActivations: jest.fn(async (value) => value),
            hydrateActivation: jest.fn(async (value) => value),
          })),
        })),
      };
      controller = freshRequire("../../server/controllers/activation");
    });

    it("passes find errors to ctx.throw", async () => {
      const err = new Error("activation find failed");
      global.strapi.db.query = jest.fn(() => ({ findMany: jest.fn().mockRejectedValue(err) }));
      await controller.find(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("passes findOne errors to ctx.throw", async () => {
      const err = new Error("activation findOne failed");
      ctx.params = { id: 1 };
      global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
      await controller.findOne(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("passes revoke errors to ctx.throw", async () => {
      const err = new Error("activation revoke failed");
      ctx.params = { id: 1 };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockRejectedValue(err) }));
      await controller.revoke(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("returns notFound when revoke target does not exist", async () => {
      ctx.params = { id: 999 };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockResolvedValue(null) }));
      await controller.revoke(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("Activation not found");
    });

    it("logs and throws heartbeat failures", async () => {
      const err = new Error("heartbeat failed");
      ctx.state = { licenseActivation: { id: 1 }, trustLevel: 1 };
      ctx.request.headers = {
        "x-request-nonce": "nonce-error-heartbeat",
        "x-request-timestamp": "2026-03-06T06:20:00.000Z",
      };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockResolvedValue({}) }));
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ heartbeat: jest.fn().mockRejectedValue(err) })) }));
      await controller.heartbeat(ctx);
      expect(global.strapi.log.error).toHaveBeenCalledWith("[Heartbeat] Error:", err);
      expect(ctx.throw).toHaveBeenCalledWith(500, "heartbeat failed");
    });
  });

  describe("License controller", () => {
    let controller;
    let ctx;

    beforeEach(() => {
      ctx = { params: {}, query: {}, request: { body: {}, headers: {} }, state: {}, throw: jest.fn(), badRequest: jest.fn(), conflict: jest.fn(), serviceUnavailable: jest.fn(), forbidden: jest.fn(), notFound: jest.fn(), unauthorized: jest.fn() };
      global.strapi = {
        config: {
          get: jest.fn(() => ({
            freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
            requireFreshnessStore: false,
          })),
        },
        log: makeLog(),
        db: { query: jest.fn() },
        plugin: jest.fn(() => ({
          service: jest.fn(() => ({
            hydrateLicenses: jest.fn(async (value) => value),
            hydrateLicense: jest.fn(async (value) => value),
          })),
        })),
      };
      controller = freshRequire("../../server/controllers/license");
    });

    it("passes findOne errors to ctx.throw", async () => {
      const err = new Error("license findOne failed");
      ctx.params = { id: 1 };
      global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
      await controller.findOne(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("passes create errors to ctx.throw", async () => {
      const err = new Error("license create failed");
      ctx.request.body = { user: 1, product: 1 };
      global.strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          generateLicenseKey: jest.fn(() => "VST-ABCDE-FGHIJ-KLMNP-QRSTU"),
          hydrateLicense: jest.fn(async (value) => value),
        })),
      }));
      global.strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.product") {
          return { findOne: jest.fn().mockResolvedValue({ id: 1, type: "plugin" }) };
        }
        return { create: jest.fn().mockRejectedValue(err) };
      });
      await controller.create(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("returns notFound when update target does not exist", async () => {
      ctx.params = { id: 999 };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockResolvedValue(null) }));
      await controller.update(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("License not found");
    });

    it("passes update errors to ctx.throw", async () => {
      const err = new Error("license update failed");
      ctx.params = { id: 1 };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockRejectedValue(err) }));
      await controller.update(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("passes revoke errors to ctx.throw", async () => {
      const err = new Error("license revoke failed");
      ctx.params = { id: 1 };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ revokeLicense: jest.fn().mockRejectedValue(err) })) }));
      await controller.revoke(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, err);
    });

    it("returns notFound when revoke service cannot find license", async () => {
      ctx.params = { id: 999 };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ revokeLicense: jest.fn().mockRejectedValue(new Error("LICENSE_NOT_FOUND")) })) }));
      await controller.revoke(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("License not found");
    });

    it("returns notFound when validate lookup cannot find license", async () => {
      ctx.query = { license_key: "missing", device_fingerprint: "fp" };
      ctx.request.headers = {
        "x-request-nonce": "nonce-error-validate-1",
        "x-request-timestamp": "2026-03-06T06:21:00.000Z",
      };
      global.strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(null) };
        return { findOne: jest.fn() };
      });
      await controller.validate(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("License not found");
    });

    it("returns notFound when validate lookup cannot find activation", async () => {
      ctx.query = { license_key: "key", device_fingerprint: "fp" };
      ctx.request.headers = {
        "x-request-nonce": "nonce-error-validate-2",
        "x-request-timestamp": "2026-03-06T06:22:00.000Z",
      };
      global.strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ id: 10 }) };
        return { findOne: jest.fn().mockResolvedValue(null) };
      });
      await controller.validate(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("Activation not found");
    });

    it("returns unauthorized when validate service throws", async () => {
      ctx.state = { licenseActivation: { id: 1 }, trustLevel: 2 };
      ctx.request.headers = {
        "x-request-nonce": "nonce-error-validate-3",
        "x-request-timestamp": "2026-03-06T06:23:00.000Z",
      };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ validateLicense: jest.fn().mockRejectedValue(new Error("INVALID_SIGNATURE")) })) }));
      await controller.validate(ctx);
      expect(global.strapi.log.error).toHaveBeenCalledWith("[License] Validation failed:", "INVALID_SIGNATURE");
      expect(ctx.unauthorized).toHaveBeenCalledWith("INVALID_SIGNATURE");
    });

    it("returns notFound when deactivate service cannot find license or activation", async () => {
      ctx.request.body = { license_key: "key", device_fingerprint: "fp" };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ deactivateLicense: jest.fn().mockRejectedValue(new Error("LICENSE_NOT_FOUND")) })) }));
      await controller.deactivate(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("License not found");

      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ deactivateLicense: jest.fn().mockRejectedValue(new Error("ACTIVATION_NOT_FOUND")) })) }));
      await controller.deactivate(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("Activation not found");
    });

    it("passes unexpected deactivate service errors to ctx.throw", async () => {
      ctx.request.body = { license_key: "key", device_fingerprint: "fp" };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ deactivateLicense: jest.fn().mockRejectedValue(new Error("deactivate failed")) })) }));
      await controller.deactivate(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, "deactivate failed");
    });

    it("returns updated license when update succeeds", async () => {
      const updated = { id: 1, status: "active" };
      ctx.params = { id: 1 };
      global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockResolvedValue(updated) }));
      const result = await controller.update(ctx);
      expect(result).toEqual(updated);
    });

    it("activates a license by id via service", async () => {
      ctx.params = { id: 5 };
      const updated = { id: 5, status: "active", revoked_at: null };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ activateLicenseById: jest.fn().mockResolvedValue(updated) })) }));
      const result = await controller.activateById(ctx);
      expect(result).toEqual(updated);
    });

    it("returns notFound when activateById service cannot find license", async () => {
      ctx.params = { id: 5 };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ activateLicenseById: jest.fn().mockRejectedValue(new Error("LICENSE_NOT_FOUND")) })) }));
      await controller.activateById(ctx);
      expect(ctx.notFound).toHaveBeenCalledWith("License not found");
    });

    it("deactivates a license by id via service", async () => {
      ctx.params = { id: 5 };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ revokeLicense: jest.fn().mockResolvedValue({ success: true }) })) }));
      const result = await controller.deactivateById(ctx);
      expect(result).toEqual({ success: true });
    });

    it("passes getLicenseStatus service errors to ctx.throw", async () => {
      ctx.query = { license_key: "key" };
      ctx.request.headers = { "x-request-nonce": "nonce-status-error" };
      global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ getLicenseStatus: jest.fn().mockRejectedValue(new Error("status failed")) })) }));
      await controller.getLicenseStatus(ctx);
      expect(ctx.throw).toHaveBeenCalledWith(500, "status failed");
    });
  });
});