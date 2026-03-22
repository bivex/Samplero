/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 05:08
 * Last Updated: 2026-03-05 15:34
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

describe("License Controller", () => {
  let licenseController;
  let mockCtx;
  let fixtures;

  beforeEach(() => {
    fixtures = require("../__fixtures__");

    mockCtx = {
      params: {},
      query: {},
      request: { body: {}, headers: {} },
      state: {},
      throw: jest.fn(),
      notFound: jest.fn((msg) => ({ message: msg })),
      badRequest: jest.fn(),
      conflict: jest.fn((msg) => ({ message: msg })),
      forbidden: jest.fn((msg) => ({ message: msg })),
      serviceUnavailable: jest.fn((msg) => ({ message: msg })),
      unauthorized: jest.fn((msg) => ({ message: msg })),
    };

    const purchaseService = {
      getCustomerLicenses: jest.fn(async (userId) => [
        { id: 1, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU", owner_id: userId },
      ]),
    };
    const licenseService = {
      activateLicense: jest.fn(),
      validateLicense: jest.fn(),
      deactivateLicense: jest.fn(),
      hydrateLicenses: jest.fn(async (value) => value),
      hydrateLicense: jest.fn(async (value) => value),
      generateLicenseKey: jest.fn(() => "VST-ABCDE-FGHIJ-KLMNP-QRSTU"),
    };

    global.strapi = {
      config: {
        get: jest.fn(() => ({
          freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
          requireFreshnessStore: false,
        })),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      db: {
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          deleteMany: jest.fn(),
        })),
      },
      plugin: jest.fn(() => ({
        service: jest.fn((name) =>
          name === "purchase" ? purchaseService : licenseService,
        ),
      })),
    };

    licenseController = require("../../server/controllers/license");
  });

  describe("find", () => {
    it("should return all licenses for admin users", async () => {
      const licenses = [fixtures.validLicense, fixtures.expiredLicense];
      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue(licenses),
      }));
      mockCtx.state = { user: { id: 1, role: { type: "admin" } } };

      const result = await licenseController.find(mockCtx);

      expect(result).toEqual(licenses);
    });

    it("should require authentication for customer license listings", async () => {
      const result = await licenseController.find(mockCtx);

      expect(mockCtx.unauthorized).toHaveBeenCalledWith("Authentication required");
      expect(result).toEqual({ message: "Authentication required" });
    });

    it("should scope non-admin users to customer licenses", async () => {
      mockCtx.state = { user: { id: 7, role: { type: "authenticated" } } };

      const result = await licenseController.find(mockCtx);

      expect(result).toEqual([
        expect.objectContaining({ owner_id: 7, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU" }),
      ]);
    });

    it("should treat admin-panel users with admin roles arrays as admins", async () => {
      const licenses = [fixtures.validLicense, fixtures.expiredLicense];
      const findMany = jest.fn().mockResolvedValue(licenses);
      strapi.db.query = jest.fn(() => ({ findMany, count: jest.fn() }));
      mockCtx.state = {
        user: {
          id: 1,
          email: "admin@example.com",
          roles: [{ id: 1, code: "strapi-super-admin", name: "Super Admin" }],
        },
      };

      const result = await licenseController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith({ populate: ["user", "product"] });
      expect(result).toEqual(licenses);
    });

    it("should return paginated licenses when limit or offset is provided", async () => {
      mockCtx.query = { limit: "1", offset: "1" };
      mockCtx.state = { user: { id: 1, role: { type: "admin" } } };
      const licenses = [fixtures.expiredLicense];
      const findMany = jest.fn().mockResolvedValue(licenses);
      const count = jest.fn().mockResolvedValue(2);
      strapi.db.query = jest.fn(() => ({ findMany, count }));

      const result = await licenseController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith({
        populate: ["user", "product"],
        limit: 1,
        offset: 1,
        orderBy: { id: "asc" },
      });
      expect(count).toHaveBeenCalledWith({});
      expect(result).toEqual({
        licenses,
        total: 2,
        limit: 1,
        offset: 1,
      });
    });

    it("should filter and sort paginated licenses for admin search views", async () => {
      mockCtx.query = {
        limit: "1",
        offset: "0",
        search: "bob",
        status: "revoked",
        sortBy: "user",
        sortDir: "desc",
      };
      mockCtx.state = { user: { id: 1, role: { type: "admin" } } };

      const licenses = [
        {
          id: 1,
          uid: "license-1",
          status: "active",
          user: { id: 11, email: "alice@example.com" },
          product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
          activations: [{ id: 1001 }],
        },
        {
          id: 2,
          uid: "license-2",
          status: "revoked",
          user: { id: 12, email: "bob@example.com" },
          product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
          activations: [],
        },
      ];
      const findMany = jest.fn().mockResolvedValue(licenses);
      const hydrateLicenses = jest.fn(async (value) => value);
      strapi.db.query = jest.fn(() => ({ findMany, count: jest.fn() }));
      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "purchase") return { getCustomerLicenses: jest.fn() };
          return { hydrateLicenses, hydrateLicense: jest.fn(), generateLicenseKey: jest.fn() };
        }),
      }));

      const result = await licenseController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith({ populate: ["user", "product"] });
      expect(result).toEqual({
        licenses: [expect.objectContaining({ id: 2, uid: "license-2" })],
        total: 1,
        limit: 1,
        offset: 0,
      });
    });

    it("should throw on error", async () => {
      mockCtx.state = { user: { id: 1, role: { type: "admin" } } };
      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockRejectedValue(new Error("DB error")),
      }));

      await licenseController.find(mockCtx);

      expect(mockCtx.throw).toHaveBeenCalledWith(500, expect.any(Error));
    });
  });

  describe("findOne", () => {
    it("should return license by id", async () => {
      mockCtx.params = { id: 1 };
      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(fixtures.validLicense),
      }));

      const result = await licenseController.findOne(mockCtx);

      expect(result.uid).toBe("license-uuid-active");
    });

    it("should allow admin-panel users with admin roles arrays to access any license", async () => {
      mockCtx.params = { id: 1 };
      const findOne = jest.fn().mockResolvedValue(fixtures.validLicense);
      strapi.db.query = jest.fn(() => ({ findOne }));
      mockCtx.state = {
        user: {
          id: 1,
          email: "admin@example.com",
          roles: [{ id: 1, code: "strapi-super-admin", name: "Super Admin" }],
        },
      };

      const result = await licenseController.findOne(mockCtx);

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        populate: ["user", "product"],
      });
      expect(result.uid).toBe("license-uuid-active");
    });

    it("should return notFound for non-existent license", async () => {
      mockCtx.params = { id: 999 };
      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));

      const result = await licenseController.findOne(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("License not found");
    });
  });

  describe("create", () => {
    it("should create license with generated UID", async () => {
      mockCtx.request.body = {
        user: 1,
        product: 1,
        activation_limit: 3,
      };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({ id: 1, type: "plugin" }),
        create: jest.fn().mockResolvedValue(fixtures.validLicense),
      }));

      const result = await licenseController.create(mockCtx);

      expect(result.uid).toBeDefined();
      expect(result.status).toBe("active");
    });
  });

  describe("revoke", () => {
    it("should revoke license and delete activations", async () => {
      mockCtx.params = { id: 1 };
      const revokeMock = jest.fn().mockResolvedValue({ success: true });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({ revokeLicense: revokeMock })),
      }));

      const result = await licenseController.revoke(mockCtx);

      expect(revokeMock).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });
  });

  describe("activateById", () => {
    it("should activate a license by id via service", async () => {
      mockCtx.params = { id: 1 };

      const activateByIdMock = jest.fn().mockResolvedValue({
        ...fixtures.validLicense,
        status: "active",
        revoked_at: null,
      });

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({ activateLicenseById: activateByIdMock })),
      }));

      const result = await licenseController.activateById(mockCtx);

      expect(activateByIdMock).toHaveBeenCalledWith(1);
      expect(result.status).toBe("active");
    });
  });

  describe("deactivateById", () => {
    it("should deactivate a license by id via service", async () => {
      mockCtx.params = { id: 1 };

      const revokeMock = jest.fn().mockResolvedValue({ success: true });

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({ revokeLicense: revokeMock })),
      }));

      const result = await licenseController.deactivateById(mockCtx);

      expect(revokeMock).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });
  });

  describe("activate", () => {
    it("should call license service to activate", async () => {
      mockCtx.request.body = {
        license_key: "license-uuid-active",
        device_fingerprint: "new-device-fingerprint",
        machine_id: "tauri-hwid-1",
        plugin_version: "1.0.0",
        platform: "mac",
        csr: "csr-base64",
      };

      const activateMock = jest.fn().mockResolvedValue({
        status: "approved",
        certificate: "cert",
        ttl: 86400,
      });

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          activateLicense: activateMock,
        })),
      }));

      const result = await licenseController.activate(mockCtx);

      expect(activateMock).toHaveBeenCalledWith({
        licenseKey: "license-uuid-active",
        deviceFingerprint: "new-device-fingerprint",
        pluginVersion: "1.0.0",
        platform: "mac",
        csr: "csr-base64",
        machineId: "tauri-hwid-1",
        requestIp: undefined,
      });
    });

    it("should return error when activation fails", async () => {
      mockCtx.request.body = fixtures.activateRequest;

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          activateLicense: jest
            .fn()
            .mockRejectedValue(new Error("ACTIVATION_LIMIT_EXCEEDED")),
        })),
      }));

      await licenseController.activate(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "ACTIVATION_LIMIT_EXCEEDED",
      );
    });
  });

  describe("validate", () => {
    it("should validate license via service", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 1,
      };
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-validate-1",
        "x-request-timestamp": "2026-03-06T06:00:00.000Z",
      };

      const validateMock = jest.fn().mockResolvedValue({
        valid: true,
        license_status: "active",
      });

      // Update the service mock to return our validate mock
      global.strapi.plugin = jest.fn(() => ({
        service: jest.fn((serviceName) => {
          if (serviceName === "license") {
            return { validateLicense: validateMock };
          }
          return {};
        }),
      }));

      // Reload controller to pick up the new mock

      licenseController = require("../../server/controllers/license");

      const result = await licenseController.validate(mockCtx);

      expect(validateMock).toHaveBeenCalledWith(fixtures.validActivation, {
        trustLevel: 1,
        requestSignature: undefined,
        requestPayload: {
          request_nonce: "nonce-validate-1",
          request_timestamp: "2026-03-06T06:00:00.000Z",
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should forward x-request-signature and canonical query payload", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 1,
      };
      mockCtx.query = {
        license_key: "license-uuid-active",
        device_fingerprint: "device-1",
      };
      mockCtx.request.headers = {
        "x-request-signature": "signed-validate-header",
        "x-request-nonce": "nonce-validate-2",
        "x-request-timestamp": "2026-03-06T06:01:00.000Z",
      };

      const validateMock = jest.fn().mockResolvedValue({ valid: true });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          validateLicense: validateMock,
        })),
      }));

      licenseController = require("../../server/controllers/license");

      await licenseController.validate(mockCtx);

      expect(validateMock).toHaveBeenCalledWith(fixtures.validActivation, {
        trustLevel: 1,
        requestSignature: "signed-validate-header",
        requestPayload: {
          license_key: "license-uuid-active",
          device_fingerprint: "device-1",
          request_nonce: "nonce-validate-2",
          request_timestamp: "2026-03-06T06:01:00.000Z",
        },
      });
    });

    it("should bind freshness headers into the signed validation payload", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 1,
      };
      mockCtx.query = {
        activation_id: "1",
      };
      mockCtx.request.headers = {
        "x-request-signature": "signed-validate-header",
        "x-request-nonce": "nonce-123",
        "x-request-timestamp": "2026-03-06T06:00:00.000Z",
      };

      const validateMock = jest.fn().mockResolvedValue({ valid: true });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          validateLicense: validateMock,
        })),
      }));

      licenseController = require("../../server/controllers/license");

      await licenseController.validate(mockCtx);

      expect(validateMock).toHaveBeenCalledWith(fixtures.validActivation, {
        trustLevel: 1,
        requestSignature: "signed-validate-header",
        requestPayload: {
          activation_id: "1",
          request_nonce: "nonce-123",
          request_timestamp: "2026-03-06T06:00:00.000Z",
        },
      });
    });

    it("returns controller-level freshness and replay errors before validation", async () => {
      mockCtx.query = { activation_id: "1", device_fingerprint: "device-1" };

      await licenseController.validate(mockCtx);
      expect(mockCtx.badRequest).toHaveBeenCalledWith("x-request-nonce header is required");

      mockCtx.badRequest.mockClear();
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-validate-replay",
        "x-request-timestamp": "2026-03-06T06:02:00.000Z",
      };

      const validateLicense = jest.fn();
      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") return { reserveNonce: jest.fn().mockResolvedValue(false) };
          return { validateLicense };
        }),
      }));

      licenseController = require("../../server/controllers/license");

      const replayResult = await licenseController.validate(mockCtx);

      expect(mockCtx.conflict).toHaveBeenCalledWith("Nonce already used");
      expect(replayResult).toEqual({ message: "Nonce already used" });
      expect(validateLicense).not.toHaveBeenCalled();
    });

    it("requires device binding for unsigned activation_id lookups and rejects mismatches", async () => {
      mockCtx.query = { activation_id: "1" };
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-validate-3",
        "x-request-timestamp": "2026-03-06T06:03:00.000Z",
      };

      await licenseController.validate(mockCtx);
      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "device_fingerprint is required when activation_id is used without request signature",
      );

      mockCtx.badRequest.mockClear();
      mockCtx.query = { activation_id: "1", device_fingerprint: "wrong-device" };
      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(fixtures.validActivation),
      }));

      const mismatchResult = await licenseController.validate(mockCtx);

      expect(mockCtx.forbidden).toHaveBeenCalledWith("Activation does not match device_fingerprint");
      expect(mismatchResult).toEqual({ message: "Activation does not match device_fingerprint" });
    });

    it("returns pending_confirmation details when first activation is awaiting owner approval", async () => {
      mockCtx.query = {
        license_key: "license-uuid-active",
        device_fingerprint: "device-pending",
      };
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-validate-pending",
        "x-request-timestamp": "2026-03-06T06:04:00.000Z",
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue({ id: 55, uid: "license-uuid-active" }),
          };
        }

        if (model === "plugin::license-server.activation") {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }

        return {
          findOne: jest.fn(),
        };
      });

      const pendingClaim = {
        id: 19,
        device_fingerprint: "device-pending",
        expires_at: "2026-03-06T06:19:00.000Z",
      };

      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") return { reserveNonce: jest.fn().mockResolvedValue(true) };
          if (name === "activation-claim") {
            return { findOpenClaimForLicense: jest.fn().mockResolvedValue(pendingClaim) };
          }
          return { validateLicense: jest.fn() };
        }),
      }));

      licenseController = require("../../server/controllers/license");

      const result = await licenseController.validate(mockCtx);

      expect(mockCtx.status).toBe(409);
      expect(result).toEqual({
        status: "pending_confirmation",
        action: "awaiting_approval",
        claim_id: 19,
        expires_at: "2026-03-06T06:19:00.000Z",
        next_step: "approve_in_account",
      });
      expect(mockCtx.notFound).not.toHaveBeenCalled();
    });
  });

  describe("getLicenseStatus", () => {
    it("requires license_key and nonce before returning status", async () => {
      await licenseController.getLicenseStatus(mockCtx);
      expect(mockCtx.badRequest).toHaveBeenCalledWith("license_key is required");

      mockCtx.query = { license_key: "test-key" };
      mockCtx.badRequest.mockClear();

      await licenseController.getLicenseStatus(mockCtx);
      expect(mockCtx.badRequest).toHaveBeenCalledWith("x-request-nonce header is required");
    });

    it("blocks replayed nonces and returns controller status for fresh requests", async () => {
      const reserveNonce = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const getLicenseStatus = jest.fn().mockResolvedValue({ valid: true, status: "active" });

      mockCtx.query = { license_key: "test-key" };
      mockCtx.request.path = "/api/license-server/license/status";
      mockCtx.request.headers = { "x-request-nonce": "nonce-1" };

      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") return { reserveNonce };
          if (name === "license") return { getLicenseStatus };
          return { getCustomerLicenses: jest.fn() };
        }),
      }));

      const replayResult = await licenseController.getLicenseStatus(mockCtx);
      expect(mockCtx.conflict).toHaveBeenCalledWith("Nonce already used");
      expect(replayResult).toEqual({ message: "Nonce already used" });

      mockCtx.conflict.mockClear();
      mockCtx.request.headers = { "x-request-nonce": "nonce-2" };

      const success = await licenseController.getLicenseStatus(mockCtx);
      expect(reserveNonce).toHaveBeenCalledWith("nonce-2", "/api/license-server/license/status");
      expect(getLicenseStatus).toHaveBeenCalledWith("test-key");
      expect(success).toEqual({ valid: true, status: "active" });
    });
  });

  describe("deactivate", () => {
    it("should deactivate via service", async () => {
      mockCtx.request.body = {
        license_key: "test-key",
        device_fingerprint: "test-fp",
      };

      const deactivateMock = jest.fn().mockResolvedValue({
        status: "deactivated",
        activations_remaining: 2,
      });

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          deactivateLicense: deactivateMock,
        })),
      }));

      const result = await licenseController.deactivate(mockCtx);

      expect(deactivateMock).toHaveBeenCalled();
      expect(result.status).toBe("deactivated");
    });
  });
});

describe("Activation Controller", () => {
  let activationController;
  let mockCtx;
  let fixtures;

  beforeEach(() => {
    fixtures = require("../__fixtures__");

    mockCtx = {
      params: {},
      state: {},
      request: { body: {}, headers: {} },
      throw: jest.fn(),
      badRequest: jest.fn((msg) => ({ message: msg })),
      conflict: jest.fn((msg) => ({ message: msg })),
      forbidden: jest.fn((msg) => ({ message: msg })),
      serviceUnavailable: jest.fn((msg) => ({ message: msg })),
      unauthorized: jest.fn((msg) => ({ message: msg })),
      notFound: jest.fn((msg) => ({ message: msg })),
    };

    global.strapi = {
      config: {
        get: jest.fn(() => ({
          freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
          requireFreshnessStore: false,
        })),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      db: {
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          update: jest.fn(),
        })),
      },
      plugin: jest.fn(() => ({
        service: jest.fn(() => ({
          validateLicense: jest.fn(),
          hydrateActivations: jest.fn(async (value) => value),
          hydrateActivation: jest.fn(async (value) => value),
        })),
      })),
    };

    activationController = require("../../server/controllers/activation");
  });

  describe("find", () => {
    it("should return all activations", async () => {
      const activations = [
        fixtures.validActivation,
        fixtures.revokedActivation,
      ];
      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue(activations),
      }));

      const result = await activationController.find(mockCtx);

      expect(result).toEqual(activations);
    });

    it("should return paginated activations when limit or offset is provided", async () => {
      mockCtx.query = { limit: "1", offset: "1" };
      const activations = [fixtures.revokedActivation];
      const findMany = jest.fn().mockResolvedValue(activations);
      const count = jest.fn().mockResolvedValue(2);
      strapi.db.query = jest.fn(() => ({ findMany, count }));

      const result = await activationController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith({
        limit: 1,
        offset: 1,
        orderBy: { id: "asc" },
      });
      expect(count).toHaveBeenCalledWith({});
      expect(result).toEqual({
        activations,
        total: 2,
        limit: 1,
        offset: 1,
      });
    });

    it("should filter and sort paginated activations for admin search views", async () => {
      mockCtx.query = {
        limit: "1",
        offset: "0",
        search: "device-beta",
        status: "active",
        sortBy: "last_checkin",
        sortDir: "desc",
      };

      const activations = [
        {
          id: 1001,
          device_fingerprint: "device-alpha",
          certificate_serial: "CERT-ALPHA",
          platform: "mac",
          revoked_at: null,
          last_checkin: "2026-03-01T10:00:00.000Z",
          license: {
            id: 1,
            uid: "license-http-1",
            user: { id: 11, email: "alice@example.com" },
            product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
          },
        },
        {
          id: 1002,
          device_fingerprint: "device-beta",
          certificate_serial: "CERT-BETA",
          platform: "win",
          revoked_at: null,
          last_checkin: "2026-03-02T10:00:00.000Z",
          license: {
            id: 2,
            uid: "license-http-2",
            user: { id: 12, email: "bob@example.com" },
            product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
          },
        },
      ];
      const findMany = jest.fn().mockResolvedValue(activations);
      const hydrateActivations = jest.fn(async (value) => value);
      strapi.db.query = jest.fn(() => ({ findMany, count: jest.fn() }));
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          validateLicense: jest.fn(),
          hydrateActivations,
          hydrateActivation: jest.fn(async (value) => value),
        })),
      }));

      const result = await activationController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith();
      expect(result).toEqual({
        activations: [expect.objectContaining({ id: 1002, device_fingerprint: "device-beta" })],
        total: 1,
        limit: 1,
        offset: 0,
      });
    });
  });

  describe("heartbeat", () => {
    it("should delegate heartbeat validation without mutating activation before verification", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 1,
      };
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-heartbeat-1",
        "x-request-timestamp": "2026-03-06T06:10:00.000Z",
      };

      strapi.db.query = jest.fn();

      const heartbeatMock = jest.fn().mockResolvedValue({
        valid: true,
        status: "active",
      });

      global.strapi.plugin = jest.fn(() => ({
        service: jest.fn((serviceName) => {
          if (serviceName === "license") {
            return { heartbeat: heartbeatMock };
          }
          return {};
        }),
      }));

      // Reload controller to pick up the new mock

      activationController = require("../../server/controllers/activation");

      const result = await activationController.heartbeat(mockCtx);

      expect(result.valid).toBe(true);
      expect(strapi.db.query).not.toHaveBeenCalled();
    });

    it("should forward x-payload-signature and request body payload", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 2,
      };
      mockCtx.request = {
        headers: {
          "x-payload-signature": "signed-heartbeat-header",
          "x-request-nonce": "nonce-heartbeat-2",
          "x-request-timestamp": "2026-03-06T06:11:00.000Z",
        },
        body: { activation_id: "1", heartbeat_nonce: "abc123" },
      };

      const heartbeatMock = jest.fn().mockResolvedValue({ valid: true });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          heartbeat: heartbeatMock,
        })),
      }));

      activationController = require("../../server/controllers/activation");

      await activationController.heartbeat(mockCtx);

      expect(heartbeatMock).toHaveBeenCalledWith(fixtures.validActivation, {
        trustLevel: 2,
        payloadSignature: "signed-heartbeat-header",
        requestPayload: {
          activation_id: "1",
          heartbeat_nonce: "abc123",
          request_nonce: "nonce-heartbeat-2",
          request_timestamp: "2026-03-06T06:11:00.000Z",
        },
      });
    });

    it("should bind freshness headers into the signed heartbeat payload", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 2,
      };
      mockCtx.request = {
        headers: {
          "x-payload-signature": "signed-heartbeat-header",
          "x-request-nonce": "nonce-456",
          "x-request-timestamp": "2026-03-06T06:05:00.000Z",
        },
        body: { activation_id: "1", heartbeat_nonce: "abc123" },
      };

      const heartbeatMock = jest.fn().mockResolvedValue({ valid: true });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          heartbeat: heartbeatMock,
        })),
      }));

      activationController = require("../../server/controllers/activation");

      await activationController.heartbeat(mockCtx);

      expect(heartbeatMock).toHaveBeenCalledWith(fixtures.validActivation, {
        trustLevel: 2,
        payloadSignature: "signed-heartbeat-header",
        requestPayload: {
          activation_id: "1",
          heartbeat_nonce: "abc123",
          request_nonce: "nonce-456",
          request_timestamp: "2026-03-06T06:05:00.000Z",
        },
      });
    });

    it("should return unauthorized for heartbeat signature failures", async () => {
      mockCtx.state = {
        licenseActivation: fixtures.validActivation,
        trustLevel: 1,
      };
      mockCtx.unauthorized = jest.fn((msg) => ({ message: msg }));
      mockCtx.request = {
        headers: {
          "x-request-nonce": "nonce-heartbeat-3",
          "x-request-timestamp": "2026-03-06T06:12:00.000Z",
        },
        body: { activation_id: "1" },
      };

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          heartbeat: jest.fn().mockRejectedValue(new Error("PAYLOAD_SIGNATURE_REQUIRED")),
        })),
      }));

      activationController = require("../../server/controllers/activation");

      const result = await activationController.heartbeat(mockCtx);

      expect(mockCtx.unauthorized).toHaveBeenCalledWith("PAYLOAD_SIGNATURE_REQUIRED");
      expect(result).toEqual({ message: "PAYLOAD_SIGNATURE_REQUIRED" });
      expect(mockCtx.throw).not.toHaveBeenCalled();
    });

    it("requires device binding for unsigned activation_id heartbeat lookups", async () => {
      mockCtx.request = {
        headers: {
          "x-request-nonce": "nonce-heartbeat-4",
          "x-request-timestamp": "2026-03-06T06:13:00.000Z",
        },
        body: { activation_id: "1" },
      };

      const result = await activationController.heartbeat(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "device_fingerprint is required when activation_id is used without payload signature",
      );
      expect(result).toEqual({ message: "device_fingerprint is required when activation_id is used without payload signature" });
    });

    it("rejects mismatched device_fingerprint during heartbeat lookups", async () => {
      mockCtx.request = {
        headers: {
          "x-request-nonce": "nonce-heartbeat-5",
          "x-request-timestamp": "2026-03-06T06:14:00.000Z",
        },
        body: { activation_id: "1", device_fingerprint: "wrong-device" },
      };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(fixtures.validActivation),
      }));

      const result = await activationController.heartbeat(mockCtx);

      expect(mockCtx.forbidden).toHaveBeenCalledWith("Activation does not match device_fingerprint");
      expect(result).toEqual({ message: "Activation does not match device_fingerprint" });
    });
  });

  describe("bootstrap", () => {
    it("should resolve activation and delegate signed certificate bootstrap", async () => {
      mockCtx.request = {
        headers: {
          "x-payload-signature": "signed-bootstrap-header",
          "x-request-nonce": "nonce-789",
          "x-request-timestamp": "2026-03-06T06:06:00.000Z",
        },
        body: { activation_id: "1" },
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validActivation) };
        }
        return {};
      });

      const bootstrapMock = jest.fn().mockResolvedValue({ status: "approved" });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          bootstrapActivationCertificate: bootstrapMock,
        })),
      }));

      activationController = require("../../server/controllers/activation");

      const result = await activationController.bootstrap(mockCtx);

      expect(result).toEqual({ status: "approved" });
      expect(bootstrapMock).toHaveBeenCalledWith(fixtures.validActivation, {
        payloadSignature: "signed-bootstrap-header",
        requestPayload: {
          activation_id: "1",
          request_nonce: "nonce-789",
          request_timestamp: "2026-03-06T06:06:00.000Z",
        },
      });
    });

    it("should return unauthorized for bootstrap signature failures", async () => {
      mockCtx.unauthorized = jest.fn((msg) => ({ message: msg }));
      mockCtx.request = {
        headers: {
          "x-payload-signature": "signed-bootstrap-header",
          "x-request-nonce": "nonce-bootstrap-2",
          "x-request-timestamp": "2026-03-06T06:16:00.000Z",
        },
        body: { activation_id: "1" },
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validActivation) };
        }
        return {};
      });
      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          bootstrapActivationCertificate: jest.fn().mockRejectedValue(new Error("PAYLOAD_SIGNATURE_REQUIRED")),
        })),
      }));

      activationController = require("../../server/controllers/activation");

      const result = await activationController.bootstrap(mockCtx);

      expect(mockCtx.unauthorized).toHaveBeenCalledWith("PAYLOAD_SIGNATURE_REQUIRED");
      expect(result).toEqual({ message: "PAYLOAD_SIGNATURE_REQUIRED" });
    });
  });

  describe("revoke", () => {
    it("should revoke activation", async () => {
      mockCtx.params = { id: 1 };
      strapi.db.query = jest.fn(() => ({
        update: jest
          .fn()
          .mockResolvedValue({
            ...fixtures.validActivation,
            revoked_at: new Date(),
          }),
      }));

      const result = await activationController.revoke(mockCtx);

      expect(result.revoked_at).toBeDefined();
    });
  });

  describe("revokeMine", () => {
    it("requires authentication", async () => {
      mockCtx.params = { licenseId: 10, activationId: 20 };

      const result = await activationController.revokeMine(mockCtx);

      expect(mockCtx.unauthorized).toHaveBeenCalledWith("Authentication required");
      expect(result).toEqual({ message: "Authentication required" });
    });

    it("delegates owned-activation revocation to the license service", async () => {
      mockCtx.state = { user: { id: 7 } };
      mockCtx.params = { licenseId: 10, activationId: 20 };
      const revokeOwnedActivation = jest.fn().mockResolvedValue({ status: "revoked" });

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          revokeOwnedActivation,
        })),
      }));

      activationController = require("../../server/controllers/activation");

      const result = await activationController.revokeMine(mockCtx);

      expect(revokeOwnedActivation).toHaveBeenCalledWith({
        ownerUserId: 7,
        licenseId: 10,
        activationId: 20,
      });
      expect(result).toEqual({ status: "revoked" });
    });
  });
});
