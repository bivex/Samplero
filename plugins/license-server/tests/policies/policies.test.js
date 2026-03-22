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

describe("Policies", () => {
  let fixtures;
  let mockStrapi;

  beforeEach(() => {
    fixtures = require("../__fixtures__");

    mockStrapi = {
      config: {
        get: jest.fn((path, defaultValue) => {
          if (path === "plugin::license-server") {
            return {};
          }
          return defaultValue;
        }),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      db: {
        query: jest.fn(),
      },
      plugin: jest.fn((name) => {
        if (name === "license-server") {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === "crypto") {
                return {
                  checkRevocation: jest.fn(() => ({ revoked: false })),
                  verifyNonce: jest.fn().mockResolvedValue(false),
                  setNonce: jest.fn().mockResolvedValue(true),
                };
              }
              return {};
            }),
          };
        }
        // Return null for redis (unavailable)
        return null;
      }),
    };

    global.strapi = mockStrapi;
  });

  describe("verify-mtls policy", () => {
    let verifyMtls;
    let mockCtx;

    beforeEach(() => {
      verifyMtls = require("../../server/policies/verify-mtls");

      mockCtx = {
        state: {},
        request: {
          headers: {},
          ip: "127.0.0.1",
        },
        unauthorized: jest.fn(() => "unauthorized"),
        forbidden: jest.fn(() => "forbidden"),
      };
    });

    it("should return true when no mTLS headers provided (mTLS optional)", async () => {
      mockCtx.request.headers = {};

      // Setup query mock to return empty for activation queries
      mockStrapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      }));

      const result = await verifyMtls(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe(true);
      expect(mockCtx.state.trustLevel).toBe(1); // API_KEY
    });

    it("should set trust level to MTLS when valid certificate provided", async () => {
      mockCtx.request.headers = {
        "x-ssl-verified": "SUCCESS",
        "x-client-cert-serial": "valid-serial",
        "x-client-cert-fingerprint": "sha256:abc123",
      };

      // Setup query mock to return a valid activation
      mockStrapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          revoked_at: null,
          requires_mtls: true,
          license: { id: 1, status: "active", revoked_at: null },
        }),
        update: jest.fn().mockResolvedValue({}),
      }));

      const result = await verifyMtls(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe(true);
      expect(mockCtx.state.trustLevel).toBe(2); // MTLS
      expect(mockCtx.state.certificateVerified).toBe(true);
    });

    it("should forbid when trusted proxy token is missing", async () => {
      mockCtx.request.headers = {};
      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return { proxySharedSecret: "proxy-secret" };
        }
        return defaultValue;
      });

      const result = await verifyMtls(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe("forbidden");
      expect(mockCtx.forbidden).toHaveBeenCalledWith(
        "Trusted proxy authentication required",
      );
    });
  });

  describe("verify-nonce policy", () => {
    let verifyNonce;
    let mockCtx;

    beforeEach(() => {
      verifyNonce = require("../../server/policies/verify-nonce");

      mockCtx = {
        request: {
          headers: {},
          ip: "127.0.0.1",
        },
        throw: jest.fn((status, message) => ({ status, message })),
        badRequest: jest.fn(() => "badRequest"),
        conflict: jest.fn(() => "conflict"),
      };
    });

    it("should return badRequest when nonce is missing", async () => {
      mockCtx.request.headers = {};

      const result = await verifyNonce(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toEqual({ status: 400, message: "x-request-nonce header is required" });
      expect(mockCtx.throw).toHaveBeenCalledWith(400, "x-request-nonce header is required");
    });

    it("should allow request when nonce is new", async () => {
      const mockNonce = "new-nonce";
      mockCtx.request.headers = {
        "x-request-nonce": mockNonce,
      };

      const result = await verifyNonce(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe(true);
    });
  });

  describe("verify-freshness policy", () => {
    let verifyFreshness;
    let mockCtx;

    beforeEach(() => {
      verifyFreshness = require("../../server/policies/verify-freshness");

      mockCtx = {
        request: {
          headers: {},
          path: "/api/license/validate",
        },
        throw: jest.fn((status, message) => ({ status, message })),
        badRequest: jest.fn(() => "badRequest"),
        conflict: jest.fn(() => "conflict"),
        serviceUnavailable: jest.fn(() => "serviceUnavailable"),
      };
    });

    it("should return badRequest when timestamp is missing", async () => {
      mockCtx.request.headers = { "x-request-nonce": "nonce-1" };

      const result = await verifyFreshness(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toEqual({ status: 400, message: "x-request-timestamp header is required" });
      expect(mockCtx.throw).toHaveBeenCalledWith(400, "x-request-timestamp header is required");
    });

    it("should allow fresh requests when nonce reserve succeeds", async () => {
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-2",
        "x-request-timestamp": new Date().toISOString(),
      };
      const reserveNonce = jest.fn().mockResolvedValue(true);
      mockStrapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({ reserveNonce })),
      }));

      const result = await verifyFreshness(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe(true);
      expect(reserveNonce).toHaveBeenCalledWith("nonce-2", "/api/license/validate");
    });
  });

  describe("rate-limit policy", () => {
    let rateLimit;
    let mockCtx;

    beforeEach(() => {
      rateLimit = require("../../server/policies/rate-limit");

      mockCtx = {
        request: {
          headers: {},
          ip: "127.0.0.1",
          path: "/test",
        },
        tooManyRequests: jest.fn(() => "tooManyRequests"),
      };
    });

    it("should allow request when Redis unavailable", async () => {
      // Redis plugin returns null (unavailable)
      const result = await rateLimit(mockCtx, {}, { strapi: mockStrapi });

      expect(result).toBe(true);
      expect(mockCtx.tooManyRequests).not.toHaveBeenCalled();
      expect(mockStrapi.log.warn).toHaveBeenCalledWith(
        "[RateLimit] Redis not available, skipping rate limit",
      );
    });

    it("should allow request when under limit", async () => {
      mockCtx.request.path = "/test";

      // Create a mock redis service
      const mockRedisService = {
        get: jest.fn().mockResolvedValue(null), // No requests yet
        set: jest.fn().mockResolvedValue("OK"),
      };

      // Override plugin mock to return redis service
      const strapiWithRedis = {
        ...mockStrapi,
        plugin: jest.fn((name) => {
          if (name === "redis") {
            return {
              service: jest.fn(() => mockRedisService),
            };
          }
          return mockStrapi.plugin(name);
        }),
      };

      const result = await rateLimit(
        mockCtx,
        { maxRequests: 100 },
        { strapi: strapiWithRedis },
      );

      expect(result).toBe(true);
      expect(mockCtx.tooManyRequests).not.toHaveBeenCalled();
    });

    it("should block when over limit", async () => {
      mockCtx.request.path = "/test";

      // Create a mock redis service
      const mockRedisService = {
        get: jest.fn().mockResolvedValue("150"), // Over limit
      };

      // Override plugin mock to return redis service
      const strapiWithRedis = {
        ...mockStrapi,
        plugin: jest.fn((name) => {
          if (name === "redis") {
            return {
              service: jest.fn(() => mockRedisService),
            };
          }
          return mockStrapi.plugin(name);
        }),
      };

      const result = await rateLimit(
        mockCtx,
        { maxRequests: 100 },
        { strapi: strapiWithRedis },
      );

      expect(result).toBe("tooManyRequests");
    });
  });
});
