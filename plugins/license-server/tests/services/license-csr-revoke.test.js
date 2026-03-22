const forge = require("node-forge");

const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("License service CSR and revoke branches", () => {
  let fixtures;
  let licenseService;
  let mockStrapi;
  let originalForgeFns;

  beforeEach(() => {
    if (!forge.asn1) {
      forge.asn1 = {};
    }
    originalForgeFns = {
      certificationRequestFromPem: forge.pki.certificationRequestFromPem,
      publicKeyToPem: forge.pki.publicKeyToPem,
      publicKeyToAsn1: forge.pki.publicKeyToAsn1,
      toDer: forge.asn1.toDer,
    };
    fixtures = require("../__fixtures__");
    mockStrapi = {
      config: { get: jest.fn((path, defaultValue) => (path === "plugin::license-server" ? { gracePeriodDays: 7, mtlsEndpoint: "https://api" } : defaultValue)) },
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      db: { query: jest.fn() },
      plugin: jest.fn(),
    };
    global.strapi = mockStrapi;
    licenseService = freshRequire("../../server/services/license");
  });

  afterEach(() => {
    forge.pki.certificationRequestFromPem = originalForgeFns.certificationRequestFromPem;
    forge.pki.publicKeyToPem = originalForgeFns.publicKeyToPem;
    forge.pki.publicKeyToAsn1 = originalForgeFns.publicKeyToAsn1;
    forge.asn1.toDer = originalForgeFns.toDer;
  });

  it("processes a valid CSR and stores mTLS activation metadata", async () => {
    const signCSR = jest.fn().mockResolvedValue({ certificate: "CERT", caCertificate: "CA", fingerprint: "FP", serial: "ACTUAL-SERIAL" });
    const createActivation = jest.fn().mockResolvedValue({ id: 55 });
    const csrPem = "-----BEGIN CERTIFICATE REQUEST-----\nTEST\n-----END CERTIFICATE REQUEST-----";
    const licenseWithPriorActivation = {
      ...fixtures.validLicense,
      activations: [{ id: 10, device_fingerprint: "existing-device", revoked_at: null }],
    };

    forge.pki.certificationRequestFromPem = jest.fn(() => ({ publicKey: { mocked: true } }));
    forge.pki.publicKeyToPem = jest.fn(() => "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----");
    forge.pki.publicKeyToAsn1 = jest.fn(() => ({ mockedAsn1: true }));
    forge.asn1.toDer = jest.fn(() => ({ getBytes: () => "DER_BYTES" }));

    mockStrapi.plugin = jest.fn(() => ({
      service: jest.fn((name) => {
        if (name === "crypto") {
          return {
            generateSerialNumber: jest.fn(() => "SERIAL-123"),
            signCSR,
            extractCertificateSerial: jest.fn(() => null),
          };
        }

        if (name === "activation-claim") {
          return {
            findOpenClaimForLicense: jest.fn().mockResolvedValue(null),
            computeFirstActivationRisk: jest.fn(() => ({ score: 25, reasons: [], decision: "pending_confirmation" })),
            createPendingClaim: jest.fn(),
            incrementCompetingAttempt: jest.fn(),
          };
        }

        return {};
      }),
    }));
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(licenseWithPriorActivation) };
      if (model === "plugin::license-server.activation") return { create: createActivation };
      return {};
    });

    const result = await licenseService.activateLicense({
      ...fixtures.activateRequest,
      csr: Buffer.from(csrPem).toString("base64"),
    });

    const [decodedCsr, serial, machineId, keyHash] = signCSR.mock.calls[0];
    expect(decodedCsr).toContain("BEGIN CERTIFICATE REQUEST");
    expect(serial).toBe("SERIAL-123");
    expect(machineId).toBe(fixtures.activateRequest.deviceFingerprint);
    expect(keyHash).toMatch(/^[a-f0-9]{16}$/);
    expect(createActivation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ certificate_serial: "ACTUAL-SERIAL", requires_mtls: true, client_public_key: expect.stringContaining("BEGIN PUBLIC KEY") }) }));
    expect(result).toEqual(expect.objectContaining({ status: "approved", certificate: "CERT", ca_certificate: "CA", fingerprint: "FP", serial: "ACTUAL-SERIAL", mtls_endpoint: "https://api" }));
  });

  it("stores CSR public key without forcing mTLS when global mTLS is disabled", async () => {
    const signCSR = jest.fn();
    const createActivation = jest.fn().mockResolvedValue({ id: 77 });
    const csrPem = "-----BEGIN CERTIFICATE REQUEST-----\nTEST\n-----END CERTIFICATE REQUEST-----";

    mockStrapi.config.get = jest.fn((path, defaultValue) => (
      path === "plugin::license-server"
        ? { gracePeriodDays: 7, mtlsEndpoint: "https://api", requireMtls: false }
        : defaultValue
    ));

    forge.pki.certificationRequestFromPem = jest.fn(() => ({ publicKey: { mocked: true } }));
    forge.pki.publicKeyToPem = jest.fn(() => "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----");
    forge.pki.publicKeyToAsn1 = jest.fn(() => ({ mockedAsn1: true }));
    forge.asn1.toDer = jest.fn(() => ({ getBytes: () => "DER_BYTES" }));

    mockStrapi.plugin = jest.fn(() => ({
      service: jest.fn((name) => {
        if (name === "crypto") {
          return {
            generateSerialNumber: jest.fn(() => "SERIAL-123"),
            signCSR,
            extractCertificateSerial: jest.fn(() => null),
          };
        }

        if (name === "activation-claim") {
          return {
            findOpenClaimForLicense: jest.fn().mockResolvedValue(null),
            computeFirstActivationRisk: jest.fn(() => ({ score: 25, reasons: [], decision: "pending_confirmation" })),
            createPendingClaim: jest.fn(),
            incrementCompetingAttempt: jest.fn(),
          };
        }

        return {};
      }),
    }));
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ ...fixtures.validLicense, activations: [{ id: 10, device_fingerprint: "existing-device", revoked_at: null }] }) };
      if (model === "plugin::license-server.activation") return { create: createActivation };
      return {};
    });

    const result = await licenseService.activateLicense({
      ...fixtures.activateRequest,
      csr: Buffer.from(csrPem).toString("base64"),
    });

    expect(signCSR).not.toHaveBeenCalled();
    expect(createActivation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ certificate_serial: null, requires_mtls: false, client_public_key: expect.stringContaining("BEGIN PUBLIC KEY") }) }));
    expect(result).toEqual(expect.objectContaining({ status: "approved", activation_id: 77, certificate: null, ca_certificate: null, fingerprint: null, serial: null, mtls_endpoint: null }));
  });

  it("deactivateLicense ignores certificate revoke update failures", async () => {
    const certUpdate = jest.fn().mockRejectedValue(new Error("cert revoke failed"));
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
      if (model === "plugin::license-server.activation") return { findOne: jest.fn().mockResolvedValue({ id: 1, certificate_serial: "SER-1" }), update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(1) };
      if (model === "plugin::license-server.client-certificate") return { update: certUpdate };
      return {};
    });

    const result = await licenseService.deactivateLicense({ licenseKey: fixtures.validLicense.uid, deviceFingerprint: "device-1" });
    expect(certUpdate).toHaveBeenCalled();
    expect(result).toEqual({ status: "deactivated", activations_remaining: 1 });
  });

  it("revokeLicense ignores client certificate update failures for activations", async () => {
    const certUpdate = jest.fn().mockRejectedValue(new Error("cert revoke failed"));
    const activationUpdate = jest.fn().mockResolvedValue({});
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ id: 1, activations: [{ id: 11, certificate_serial: "SER-1" }, { id: 12 }] }), update: jest.fn().mockResolvedValue({}) };
      if (model === "plugin::license-server.activation") return { update: activationUpdate };
      if (model === "plugin::license-server.client-certificate") return { update: certUpdate };
      return {};
    });

    const result = await licenseService.revokeLicense(1);
    expect(result).toEqual({ success: true });
    expect(activationUpdate).toHaveBeenCalledTimes(2);
    expect(certUpdate).toHaveBeenCalledTimes(1);
  });

  it("revokeLicense throws when the license does not exist", async () => {
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(null) };
      return {};
    });

    await expect(licenseService.revokeLicense(999)).rejects.toThrow("LICENSE_NOT_FOUND");
  });

  it("heartbeat recovers an mTLS activation after grace period expiry once the client comes back online", async () => {
    const oldActivation = {
      id: 1,
      license_id: 1,
      requires_mtls: true,
      last_checkin: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    };

    mockStrapi.config.get = jest.fn((path, defaultValue) =>
      path === "plugin::license-server"
        ? { gracePeriodDays: 7, heartbeatIntervalHours: 24 }
        : defaultValue,
    );
    mockStrapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.activation") return { update: jest.fn().mockResolvedValue({}) };
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(fixtures.validLicense) };
      return {};
    });

    const result = await licenseService.heartbeat(oldActivation, { trustLevel: 0 });
    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        status: "active",
        previous_status: "grace_period_expired",
        recovered: true,
        heartbeat_valid: true,
      }),
    );
  });
});