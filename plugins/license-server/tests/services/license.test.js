const nodeCrypto = require("crypto");
const forge = require("node-forge");

const createSignedPayload = (payload, privateKey) => {
  const cryptoService = require("../../server/services/crypto");
  const serializedPayload = cryptoService.serializePayloadForSignature(payload);

  return nodeCrypto
    .sign("RSA-SHA256", Buffer.from(serializedPayload, "utf8"), privateKey)
    .toString("base64");
};

/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:36
 * Last Updated: 2026-03-05 04:36
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

describe("License Service", () => {
  let licenseService;
  let mockStrapi;
  let fixtures;
  let mockCryptoService;
  let mockClaimService;

  beforeEach(() => {
    fixtures = require("../__fixtures__");
    mockCryptoService = {
      generateSerialNumber: jest.fn(() => "test-serial-123"),
      signCSR: jest.fn().mockResolvedValue(fixtures.mockCertificate),
      verifyRequestSignature: jest.fn(() => true),
      extractCertificateSerial: jest.fn(() => null),
      readCertificateMetadata: jest.fn(() => ({
        serial: fixtures.mockCertificate.serial,
        fingerprint: fixtures.mockCertificate.fingerprint,
        subjectCN: "client:new-device-fingerprint:test-key",
        notBefore: new Date("2026-03-06T00:00:00.000Z"),
        notAfter: new Date("2027-03-06T00:00:00.000Z"),
      })),
    };
    mockClaimService = {
      findOpenClaimForLicense: jest.fn().mockResolvedValue(null),
      computeFirstActivationRisk: jest.fn(() => ({
        score: 25,
        reasons: ["first_activation_requires_owner_confirmation"],
        decision: "pending_confirmation",
      })),
      createPendingClaim: jest.fn().mockResolvedValue(fixtures.firstActivationClaim),
      approveClaimAsAdmin: jest.fn().mockResolvedValue({
        status: "approved",
        activation_id: 77,
      }),
      incrementCompetingAttempt: jest.fn().mockResolvedValue(null),
    };

    mockStrapi = {
      config: {
        get: jest.fn((path, defaultValue) => {
          if (path === "plugin::license-server") {
            return {
              gracePeriodDays: 7,
              heartbeatIntervalHours: 24,
              mockAutoApproveFirstActivation: false,
            };
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
      plugin: jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") return mockCryptoService;
          if (name === "activation-claim") return mockClaimService;
          return {};
        }),
      })),
    };

    global.strapi = mockStrapi;
    licenseService = require("../../server/services/license");
  });

  describe("activateLicense", () => {
    it("should throw LICENSE_NOT_FOUND when license does not exist", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense(fixtures.activateRequest),
      ).rejects.toThrow("LICENSE_NOT_FOUND");
    });

    it("should throw LICENSE_REVOKED when license is revoked", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.revokedLicense),
          };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense(fixtures.activateRequest),
      ).rejects.toThrow("LICENSE_REVOKED");
    });

    it("should throw LICENSE_EXPIRED when license has expired", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.expiredLicense),
          };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense(fixtures.activateRequest),
      ).rejects.toThrow("LICENSE_EXPIRED");
    });

    it("should throw DEVICE_ALREADY_ACTIVATED when device is already activated", async () => {
      const licenseWithSameDevice = {
        ...fixtures.validLicense,
        activations: [
          { device_fingerprint: "new-device-fingerprint", revoked_at: null },
        ],
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(licenseWithSameDevice),
          };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense(fixtures.activateRequest),
      ).rejects.toThrow("DEVICE_ALREADY_ACTIVATED");
    });

    it("should throw ACTIVATION_LIMIT_EXCEEDED when limit is reached", async () => {
      const licenseAtLimit = {
        ...fixtures.validLicense,
        activation_limit: 2,
        activations: [
          { device_fingerprint: "device-1", revoked_at: null },
          { device_fingerprint: "device-2", revoked_at: null },
        ],
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(licenseAtLimit) };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense(fixtures.activateRequest),
      ).rejects.toThrow("ACTIVATION_LIMIT_EXCEEDED");
    });

    it("should create a pending first-activation claim when no activations exist", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.validLicense),
          };
        }
        return {};
      });

      const result = await licenseService.activateLicense(
        fixtures.activateRequest,
      );

      expect(result.status).toBe("pending_confirmation");
      expect(result.claim_id).toBe(fixtures.firstActivationClaim.id);
      expect(mockClaimService.createPendingClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          license: fixtures.validLicense,
          deviceFingerprint: fixtures.activateRequest.deviceFingerprint,
          pluginVersion: fixtures.activateRequest.pluginVersion,
          platform: fixtures.activateRequest.platform,
        }),
      );
      expect(mockStrapi.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("[Security] First activation claim created for license license-uuid-active"),
      );
      expect(mockClaimService.approveClaimAsAdmin).not.toHaveBeenCalled();
    });

    it("auto-approves the first activation claim in mock mode", async () => {
      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mockAutoApproveFirstActivation: true,
          };
        }
        return defaultValue;
      });
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.validLicense),
          };
        }
        return {};
      });

      const result = await licenseService.activateLicense(fixtures.activateRequest);

      expect(result).toEqual(expect.objectContaining({ status: "approved", activation_id: 77 }));
      expect(mockClaimService.createPendingClaim).toHaveBeenCalled();
      expect(mockClaimService.approveClaimAsAdmin).toHaveBeenCalledWith({
        claimId: fixtures.firstActivationClaim.id,
        actorUserId: null,
      });
    });

    it("auto-approves an existing matching pending claim in mock mode", async () => {
      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mockAutoApproveFirstActivation: true,
          };
        }
        return defaultValue;
      });
      mockClaimService.findOpenClaimForLicense.mockResolvedValue(fixtures.firstActivationClaim);
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.activateLicense(fixtures.activateRequest);

      expect(result).toEqual(expect.objectContaining({ status: "approved", activation_id: 77 }));
      expect(mockClaimService.approveClaimAsAdmin).toHaveBeenCalledWith({
        claimId: fixtures.firstActivationClaim.id,
        actorUserId: null,
      });
      expect(mockClaimService.createPendingClaim).not.toHaveBeenCalled();
    });

    it("returns the same pending claim for idempotent same-device retries", async () => {
      mockClaimService.findOpenClaimForLicense.mockResolvedValue(fixtures.firstActivationClaim);
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.activateLicense(fixtures.activateRequest);

      expect(result).toEqual(
        expect.objectContaining({
          status: "pending_confirmation",
          claim_id: fixtures.firstActivationClaim.id,
        }),
      );
      expect(mockClaimService.createPendingClaim).not.toHaveBeenCalled();
    });

    it("rejects a competing first-activation request for a different device", async () => {
      mockClaimService.findOpenClaimForLicense.mockResolvedValue(fixtures.firstActivationClaim);
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense({
          ...fixtures.activateRequest,
          deviceFingerprint: "competing-device",
        }),
      ).rejects.toThrow("FIRST_ACTIVATION_PENDING_CONFIRMATION");

      expect(mockClaimService.incrementCompetingAttempt).toHaveBeenCalledWith(
        fixtures.firstActivationClaim,
      );
    });

    it("does not auto-approve a competing pending claim in mock mode", async () => {
      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mockAutoApproveFirstActivation: true,
          };
        }
        return defaultValue;
      });
      mockClaimService.findOpenClaimForLicense.mockResolvedValue(fixtures.firstActivationClaim);
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.activateLicense({
          ...fixtures.activateRequest,
          deviceFingerprint: "mock-competing-device",
        }),
      ).rejects.toThrow("FIRST_ACTIVATION_PENDING_CONFIRMATION");

      expect(mockClaimService.incrementCompetingAttempt).toHaveBeenCalledWith(
        fixtures.firstActivationClaim,
      );
      expect(mockClaimService.approveClaimAsAdmin).not.toHaveBeenCalled();
    });

    it("still issues an activation immediately when this is not the first activation", async () => {
      const createActivation = jest.fn().mockResolvedValue({
        id: 100,
        ...fixtures.validActivation,
      });
      const licenseWithPriorActivation = {
        ...fixtures.validLicense,
        activations: [{ id: 9, device_fingerprint: "existing-device", revoked_at: null }],
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(licenseWithPriorActivation) };
        }
        if (model === "plugin::license-server.activation") {
          return { create: createActivation };
        }
        return {};
      });

      const result = await licenseService.activateLicense(fixtures.activateRequest);

      expect(result.status).toBe("approved");
      expect(result.activation_id).toBe(1);
      expect(createActivation).toHaveBeenCalled();
    });

    it("persists issued certificate material for immediate CSR activations", async () => {
      const originalForgeFns = {
        certificationRequestFromPem: forge.pki.certificationRequestFromPem,
        publicKeyToPem: forge.pki.publicKeyToPem,
        publicKeyToAsn1: forge.pki.publicKeyToAsn1,
        toDer: forge.asn1.toDer,
      };
      const createActivation = jest.fn().mockResolvedValue({
        id: 101,
        ...fixtures.validActivation,
        certificate_serial: fixtures.mockCertificate.serial,
        requires_mtls: true,
      });
      const createCertificateRecord = jest.fn().mockResolvedValue({ id: 9001 });
      const certificateQuery = {
        findOne: jest.fn().mockResolvedValue(null),
        create: createCertificateRecord,
      };
      const licenseWithPriorActivation = {
        ...fixtures.validLicense,
        activations: [{ id: 9, device_fingerprint: "existing-device", revoked_at: null }],
      };

      forge.pki.certificationRequestFromPem = jest.fn(() => ({ publicKey: { mocked: true } }));
      forge.pki.publicKeyToPem = jest.fn(() => "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----");
      forge.pki.publicKeyToAsn1 = jest.fn(() => ({ mockedAsn1: true }));
      forge.asn1.toDer = jest.fn(() => ({ getBytes: () => "DER_BYTES" }));

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(licenseWithPriorActivation) };
        }
        if (model === "plugin::license-server.activation") {
          return { create: createActivation };
        }
        if (model === "plugin::license-server.client-certificate") {
          return certificateQuery;
        }
        return {};
      });

      const result = await licenseService.activateLicense({
        ...fixtures.activateRequest,
        csr: Buffer.from("-----BEGIN CERTIFICATE REQUEST-----\nTEST\n-----END CERTIFICATE REQUEST-----").toString("base64"),
      });

      forge.pki.certificationRequestFromPem = originalForgeFns.certificationRequestFromPem;
      forge.pki.publicKeyToPem = originalForgeFns.publicKeyToPem;
      forge.pki.publicKeyToAsn1 = originalForgeFns.publicKeyToAsn1;
      forge.asn1.toDer = originalForgeFns.toDer;

      expect(result).toEqual(expect.objectContaining({
        status: "approved",
        certificate: fixtures.mockCertificate.certificate,
        ca_certificate: fixtures.mockCertificate.caCertificate,
        serial: fixtures.mockCertificate.serial,
      }));
      expect(createCertificateRecord).toHaveBeenCalledWith({
        data: expect.objectContaining({
          certificate_serial: fixtures.mockCertificate.serial,
          certificate_pem: fixtures.mockCertificate.certificate,
          ca_certificate_pem: fixtures.mockCertificate.caCertificate,
          fingerprint_sha256: fixtures.mockCertificate.fingerprint,
          machine_id: fixtures.activateRequest.deviceFingerprint,
          status: "active",
        }),
      });
    });
  });

  describe("validateLicense", () => {
    it("should return invalid when license not found", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(
        fixtures.validActivation,
      );

      expect(result.valid).toBe(false);
    });

    it("should return invalid when license is revoked", async () => {
      const activationWithRevokedLicense = {
        ...fixtures.validActivation,
        license: { id: fixtures.revokedLicense.id },
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.revokedLicense),
          };
        }
        return {};
      });

      const result = await licenseService.validateLicense(
        activationWithRevokedLicense,
      );

      expect(result.valid).toBe(false);
      expect(result.license_status).toBe("revoked");
    });

    it("should return valid for active license within grace period", async () => {
      const recentActivation = {
        ...fixtures.validActivation,
        last_checkin: new Date(),
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.validLicense),
          };
        }
        return {};
      });

      const result = await licenseService.validateLicense(recentActivation);

      expect(result.valid).toBe(true);
      expect(result.license_status).toBe("active");
    });
  });

  describe("deactivateLicense", () => {
    it("should throw LICENSE_NOT_FOUND when license does not exist", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      await expect(
        licenseService.deactivateLicense({
          licenseKey: "invalid-key",
          deviceFingerprint: "test-fingerprint",
        }),
      ).rejects.toThrow("LICENSE_NOT_FOUND");
    });

    it("should deactivate device successfully", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest
              .fn()
              .mockResolvedValue(fixtures.licenseWithActivations),
            update: jest.fn().mockResolvedValue({}),
          };
        }
        if (model === "plugin::license-server.activation") {
          return {
            findOne: jest
              .fn()
              .mockResolvedValue({ id: 1, device_fingerprint: "device-1" }),
            update: jest.fn().mockResolvedValue({}),
            count: jest.fn().mockResolvedValue(0),
          };
        }
        return {};
      });

      const result = await licenseService.deactivateLicense({
        licenseKey: "license-uuid-active",
        deviceFingerprint: "device-1",
      });

      expect(result.status).toBe("deactivated");
    });
  });

  describe("revokeOwnedActivation", () => {
    it("revokes a customer-owned activation and returns remaining slots", async () => {
      const ownedLicense = { ...fixtures.validLicense, id: 1, user: 7 };
      const ownedActivation = {
        ...fixtures.validActivation,
        id: 15,
        license_id: 1,
        certificate_serial: "CERT-15",
        revoked_at: null,
      };
      const activationUpdate = jest.fn().mockResolvedValue({});
      const certificateUpdate = jest.fn().mockResolvedValue({});
      const activationCount = jest.fn().mockResolvedValue(1);

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(ownedLicense) };
        }
        if (model === "plugin::license-server.activation") {
          return {
            findOne: jest.fn().mockResolvedValue(ownedActivation),
            update: activationUpdate,
            count: activationCount,
          };
        }
        if (model === "plugin::license-server.client-certificate") {
          return { update: certificateUpdate };
        }
        return {};
      });

      const result = await licenseService.revokeOwnedActivation({
        ownerUserId: 7,
        licenseId: 1,
        activationId: 15,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "revoked",
          license_id: 1,
          activation_id: 15,
          activations_remaining: 1,
        }),
      );
      expect(activationUpdate).toHaveBeenCalled();
      expect(certificateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { certificate_serial: "CERT-15" },
        }),
      );
    });
  });

  describe("revokeLicense", () => {
    it("should revoke license and delete activations", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(fixtures.validLicense),
            update: jest.fn().mockResolvedValue({}),
          };
        }
        if (model === "plugin::license-server.activation") {
          return {
            findMany: jest
              .fn()
              .mockResolvedValue(fixtures.licenseWithActivations.activations),
            update: jest.fn().mockResolvedValue({}),
          };
        }
        return {};
      });

      const result = await licenseService.revokeLicense(1);

      expect(result.success).toBe(true);
    });
  });

  describe("activateLicenseById", () => {
    it("should reactivate an existing license", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            update: jest.fn().mockResolvedValue({
              ...fixtures.revokedLicense,
              status: "active",
              revoked_at: null,
              revocation_reason: null,
            }),
          };
        }
        return {};
      });

      const result = await licenseService.activateLicenseById(1);

      expect(result.status).toBe("active");
      expect(result.revoked_at).toBeNull();
    });

    it("should throw LICENSE_NOT_FOUND when activating unknown license", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { update: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      await expect(licenseService.activateLicenseById(999)).rejects.toThrow(
        "LICENSE_NOT_FOUND",
      );
    });
  });

  describe("getLicenseStatus", () => {
    it("should return null for non-existent license", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      const result = await licenseService.getLicenseStatus("invalid-key");

      expect(result).toBeNull();
    });

    it("should return license status with activation count", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest
              .fn()
              .mockResolvedValue(fixtures.licenseWithActivations),
          };
        }
        return {};
      });

      const result = await licenseService.getLicenseStatus(
        "license-uuid-active",
      );

      expect(result.uid).toBe("license-uuid-active");
      expect(result.status).toBe("active");
      expect(result.activations_count).toBe(2);
    });
  });

  describe("hydrateLicenses", () => {
    it("should attach activations to licenses by license_id", async () => {
      const activations = [
        { id: 1, license_id: 1, device_fingerprint: "device-1", revoked_at: null },
        { id: 2, license_id: 1, device_fingerprint: "device-2", revoked_at: null },
      ];

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return {
            findMany: jest.fn().mockResolvedValue(activations),
          };
        }
        return {};
      });

      const [result] = await licenseService.hydrateLicenses([fixtures.validLicense]);

      expect(result.activations).toHaveLength(2);
      expect(result.activations[0].device_fingerprint).toBe("device-1");
    });
  });

  describe("hydrateActivations", () => {
    it("should attach populated license to activations by license_id", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findMany: jest.fn().mockResolvedValue([fixtures.validLicense]),
          };
        }
        return {};
      });

      const [result] = await licenseService.hydrateActivations([
        fixtures.validActivation,
      ]);

      expect(result.license).toBeDefined();
      expect(result.license.uid).toBe(fixtures.validLicense.uid);
    });
  });

  describe("heartbeat", () => {
    it("should return valid for recent checkin", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(fixtures.validActivation);

      expect(result.valid).toBe(true);
      expect(result.status).toBe("active");
    });

    it("should return invalid when license not found", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(fixtures.validActivation);

      expect(result.valid).toBe(false);
      expect(result.status).toBe("not_found");
    });

    it("should return invalid when license is revoked", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.revokedLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(fixtures.validActivation);

      expect(result.valid).toBe(false);
      expect(result.status).toBe("revoked");
    });

    it("should return grace_period status when checkin is old but within grace", async () => {
      const oldActivation = {
        ...fixtures.validActivation,
        last_checkin: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(oldActivation);

      // 25 hours > 24 hour heartbeat, but < 7 day grace period
      expect(result.valid).toBe(true);
      expect(result.status).toBe("active");
      expect(result.previous_status).toBe("grace_period");
      expect(result.recovered).toBe(true);
      expect(result.heartbeat_valid).toBe(true);
    });

    it("should detect mTLS downgrade", async () => {
      const mtlsActivation = {
        ...fixtures.validActivation,
        requires_mtls: true,
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(mtlsActivation, {
        trustLevel: 0, // No mTLS
      });

      expect(result.downgrade_detected).toBe(true);
      expect(result.security_alert).toBeDefined();
    });

    it("should not flag downgrade for optional-mTLS activations that have never used mTLS", async () => {
      const mtlsActivation = {
        ...fixtures.validActivation,
        requires_mtls: true,
        last_trust_level: licenseService.TRUST_LEVEL.API_KEY,
      };

      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mockAutoApproveFirstActivation: false,
            requireMtls: false,
          };
        }
        return defaultValue;
      });
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(mtlsActivation, {
        trustLevel: licenseService.TRUST_LEVEL.API_KEY,
      });

      expect(result.downgrade_detected).toBe(false);
      expect(result.security_alert).toBeUndefined();
    });

    it("should return MTLS_SIGNED trust level for valid signed mTLS heartbeat", async () => {
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.heartbeat(signedActivation, {
        trustLevel: licenseService.TRUST_LEVEL.MTLS,
        payloadSignature: "valid-signature",
        requestPayload: { activation_id: "1", heartbeat_nonce: "abc123" },
      });

      expect(result.valid).toBe(true);
      expect(result.trust_level).toBe(licenseService.TRUST_LEVEL.MTLS_SIGNED);
    });

    it("should require payload signature before refreshing a signed activation heartbeat over API key", async () => {
      const { publicKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const updateMock = jest.fn().mockResolvedValue({});
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: publicKey,
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: updateMock };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.heartbeat(signedActivation, {
          trustLevel: licenseService.TRUST_LEVEL.API_KEY,
          requestPayload: { activation_id: "1", heartbeat_nonce: "abc123" },
        }),
      ).rejects.toThrow("PAYLOAD_SIGNATURE_REQUIRED");

      expect(updateMock).not.toHaveBeenCalled();
    });

    it("should throw for invalid payload signature", async () => {
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
      };

      mockStrapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          verifyRequestSignature: jest.fn(() => false),
        })),
      }));
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.heartbeat(signedActivation, {
          trustLevel: licenseService.TRUST_LEVEL.MTLS,
          payloadSignature: "bad-signature",
          requestPayload: { activation_id: "1" },
        }),
      ).rejects.toThrow("INVALID_PAYLOAD_SIGNATURE");
    });
  });

  describe("bootstrapActivationCertificate", () => {
    it("returns the stored certificate bundle after signed proof-of-possession", async () => {
      const activation = {
        ...fixtures.validActivation,
        requires_mtls: true,
        client_public_key: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
        certificate_serial: fixtures.mockCertificate.serial,
      };
      const certificateRecord = {
        certificate_serial: fixtures.mockCertificate.serial,
        certificate_pem: fixtures.mockCertificate.certificate,
        ca_certificate_pem: fixtures.mockCertificate.caCertificate,
        fingerprint_sha256: fixtures.mockCertificate.fingerprint,
      };

      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mtlsEndpoint: "https://mtls.example.test",
          };
        }
        return defaultValue;
      });
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.client-certificate") {
          return { findOne: jest.fn().mockResolvedValue(certificateRecord) };
        }
        return {};
      });

      const result = await licenseService.bootstrapActivationCertificate(activation, {
        payloadSignature: "valid-signature",
        requestPayload: { activation_id: activation.id, request_nonce: "nonce", request_timestamp: "2026-03-06T00:00:00.000Z" },
      });

      expect(result).toEqual(expect.objectContaining({
        status: "approved",
        activation_id: activation.id,
        certificate: fixtures.mockCertificate.certificate,
        ca_certificate: fixtures.mockCertificate.caCertificate,
        serial: fixtures.mockCertificate.serial,
        mtls_endpoint: "https://mtls.example.test",
      }));
      expect(mockCryptoService.verifyRequestSignature).toHaveBeenCalled();
    });
  });

  describe("validateLicense extended", () => {
    it("should return expired status for expired license", async () => {
      const expiredLicense = {
        ...fixtures.validLicense,
        expires_at: new Date(Date.now() - 1000),
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn().mockResolvedValue(expiredLicense),
            update: jest.fn().mockResolvedValue({}),
          };
        }
        return {};
      });

      const result = await licenseService.validateLicense(fixtures.validActivation);

      expect(result.valid).toBe(false);
      expect(result.license_status).toBe("expired");
    });

    it("should return invalid for revoked activation", async () => {
      const revokedActivation = {
        ...fixtures.validActivation,
        revoked_at: new Date(),
      };

      const result = await licenseService.validateLicense(revokedActivation);

      expect(result.valid).toBe(false);
      expect(result.license_status).toBe("revoked");
    });

    it("should detect mTLS downgrade in validation", async () => {
      const mtlsActivation = {
        ...fixtures.validActivation,
        requires_mtls: true,
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(mtlsActivation, {
        trustLevel: 0,
      });

      expect(result.downgrade_detected).toBe(true);
    });

    it("should not surface mTLS downgrade during signed validation when mTLS is optional and never established", async () => {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const activation = {
        ...fixtures.validActivation,
        requires_mtls: true,
        last_trust_level: licenseService.TRUST_LEVEL.API_KEY,
        client_public_key: publicKey,
      };
      const requestPayload = {
        license_key: "license-uuid-active",
        device_fingerprint: "device-1",
      };
      const requestSignature = createSignedPayload(requestPayload, privateKey);

      mockStrapi.config.get = jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            mockAutoApproveFirstActivation: false,
            requireMtls: false,
          };
        }
        return defaultValue;
      });
      mockStrapi.plugin = jest.fn(() => ({
        service: jest.fn(() => require("../../server/services/crypto")),
      }));
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(activation, {
        trustLevel: licenseService.TRUST_LEVEL.API_KEY,
        requestSignature,
        requestPayload,
      });

      expect(result.valid).toBe(true);
      expect(result.trust_level).toBe(licenseService.TRUST_LEVEL.SIGNED);
      expect(result.downgrade_detected).toBe(false);
      expect(result.security_alert).toBeUndefined();
    });

    it("should set action for expired mTLS", async () => {
      const oldActivation = {
        ...fixtures.validActivation,
        requires_mtls: true,
        last_checkin: new Date(Date.now() - 100 * 60 * 60 * 1000), // 100 hours ago
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(oldActivation);

      expect(result.valid).toBe(true);
      expect(result.status).toBe("grace_period");
      expect(result.action).toBe("heartbeat_required");
    });

    it("should mark validation invalid when grace period has expired", async () => {
      const expiredActivation = {
        ...fixtures.validActivation,
        last_checkin: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(expiredActivation);

      expect(result.valid).toBe(false);
      expect(result.status).toBe("grace_period_expired");
      expect(result.action).toBe("heartbeat_required");
      expect(result.heartbeat_valid).toBe(false);
      expect(result.grace_period_remaining).toBe(0);
    });

    it("should surface grace_period status during validation when heartbeat is overdue but recoverable", async () => {
      const staleActivation = {
        ...fixtures.validActivation,
        last_checkin: new Date(Date.now() - 25 * 60 * 60 * 1000),
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(staleActivation);

      expect(result.valid).toBe(true);
      expect(result.status).toBe("grace_period");
      expect(result.action).toBe("heartbeat_required");
      expect(result.heartbeat_valid).toBe(false);
      expect(result.grace_period_remaining).toBeGreaterThan(0);
    });

    it("should return SIGNED trust level for valid signed validation", async () => {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: publicKey,
      };
      const requestPayload = {
        license_key: "license-uuid-active",
        device_fingerprint: "device-1",
      };
      const requestSignature = createSignedPayload(requestPayload, privateKey);

      mockStrapi.plugin = jest.fn(() => ({
        service: jest.fn(() => require("../../server/services/crypto")),
      }));
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      const result = await licenseService.validateLicense(signedActivation, {
        trustLevel: licenseService.TRUST_LEVEL.API_KEY,
        requestSignature,
        requestPayload,
      });

      expect(result.valid).toBe(true);
      expect(result.trust_level).toBe(licenseService.TRUST_LEVEL.SIGNED);
    });

    it("should require request signature for API-key validation of a signed activation", async () => {
      const { publicKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: publicKey,
      };

      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.validateLicense(signedActivation, {
          trustLevel: licenseService.TRUST_LEVEL.API_KEY,
          requestPayload: { activation_id: "1" },
        }),
      ).rejects.toThrow("REQUEST_SIGNATURE_REQUIRED");
    });

    it("should throw when request payload is tampered after signing", async () => {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const signedActivation = {
        ...fixtures.validActivation,
        client_public_key: publicKey,
      };
      const signedPayload = {
        license_key: "license-uuid-active",
        device_fingerprint: "device-1",
      };
      const requestSignature = createSignedPayload(signedPayload, privateKey);

      mockStrapi.plugin = jest.fn(() => ({
        service: jest.fn(() => require("../../server/services/crypto")),
      }));
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        return {};
      });

      await expect(
        licenseService.validateLicense(signedActivation, {
          trustLevel: licenseService.TRUST_LEVEL.API_KEY,
          requestSignature,
          requestPayload: {
            license_key: "license-uuid-other",
            device_fingerprint: "device-1",
          },
        }),
      ).rejects.toThrow("INVALID_REQUEST_SIGNATURE");
    });
  });

  describe("revokeClientCertificate", () => {
    it("should revoke client certificate", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.client-certificate") {
          return {
            findOne: jest.fn().mockResolvedValue({ id: 1, certificate_serial: "test-serial" }),
            update: jest.fn().mockResolvedValue({}),
          };
        }
        if (model === "plugin::license-server.activation") {
          return { update: jest.fn().mockResolvedValue({}) };
        }
        return {};
      });

      const result = await licenseService.revokeClientCertificate("test-serial");

      expect(result.success).toBe(true);
      expect(result.serial).toBe("test-serial");
    });

    it("should throw when certificate not found", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.client-certificate") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      await expect(
        licenseService.revokeClientCertificate("invalid-serial"),
      ).rejects.toThrow("CERTIFICATE_NOT_FOUND");
    });
  });

  describe("deactivateLicense error cases", () => {
    it("should throw ACTIVATION_NOT_FOUND when activation not found", async () => {
      mockStrapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
        }
        if (model === "plugin::license-server.activation") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return {};
      });

      await expect(
        licenseService.deactivateLicense({
          licenseKey: "license-uuid-active",
          deviceFingerprint: "unknown-device",
        }),
      ).rejects.toThrow("ACTIVATION_NOT_FOUND");
    });
  });

  describe("TRUST_LEVEL", () => {
    it("should have correct trust level values", () => {
      expect(licenseService.TRUST_LEVEL.NONE).toBe(0);
      expect(licenseService.TRUST_LEVEL.API_KEY).toBe(1);
      expect(licenseService.TRUST_LEVEL.MTLS).toBe(2);
      expect(licenseService.TRUST_LEVEL.SIGNED).toBe(3);
      expect(licenseService.TRUST_LEVEL.MTLS_SIGNED).toBe(4);
    });
  });
});
