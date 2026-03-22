/**
 * Test fixtures for license-server plugin tests
 */

const testCrypto = require("../utils/test-crypto");

let testCA = null;
let testClientCert = null;
let testCSR = null;

function getTestCA() {
  if (!testCA) {
    testCA = testCrypto.generateTestCACertificate({
      commonName: "Test License CA",
      validityDays: 365,
    });
  }
  return testCA;
}

function getTestClientCert() {
  if (!testClientCert) {
    testClientCert = testCrypto.generateTestClientCertificate({
      machineId: "test-machine-123",
      keyHash: "a1b2c3d4e5f6",
      serialNumber: "TESTCERT001",
    });
  }
  return testClientCert;
}

function getTestCSR() {
  if (!testCSR) {
    testCSR = testCrypto.generateTestCSR({
      subject: {
        CN: "test-client.example.com",
        O: "Test Organization",
        C: "US",
      },
    });
  }
  return testCSR;
}

// Temp file paths (will be populated when needed)
let tempCertPaths = null;

module.exports = {
  // Mock license data
  mockLicense: {
    id: 1,
    uid: "test-license-key-12345",
    status: "active",
    activation_limit: 3,
    issued_at: new Date("2026-01-01"),
    expires_at: null,
    product: { id: 1, name: "Test Product" },
    user: { id: 1, email: "test@example.com" },
    activations: [],
  },

  // Valid license for testing
  validLicense: {
    id: 1,
    uid: "license-uuid-active",
    status: "active",
    activation_limit: 3,
    issued_at: new Date("2026-01-01"),
    expires_at: null,
    product: { id: 1, name: "Test Product" },
    user: { id: 1, email: "test@example.com" },
    activations: [],
  },

  // Revoked license
  revokedLicense: {
    id: 2,
    uid: "license-uuid-revoked",
    status: "revoked",
    activation_limit: 3,
    issued_at: new Date("2026-01-01"),
    expires_at: null,
    revoked_at: new Date("2026-02-01"),
    product: { id: 1, name: "Test Product" },
    user: { id: 1, email: "test@example.com" },
    activations: [],
  },

  // Expired license
  expiredLicense: {
    id: 3,
    uid: "license-uuid-expired",
    status: "active",
    activation_limit: 3,
    issued_at: new Date("2025-01-01"),
    expires_at: new Date("2025-12-31"),
    product: { id: 1, name: "Test Product" },
    user: { id: 1, email: "test@example.com" },
    activations: [],
  },

  // License with multiple activations
  licenseWithActivations: {
    id: 4,
    uid: "license-uuid-active",
    status: "active",
    activation_limit: 3,
    issued_at: new Date("2026-01-01"),
    expires_at: null,
    product: { id: 1, name: "Test Product" },
    user: { id: 1, email: "test@example.com" },
    activations: [
      { id: 1, device_fingerprint: "device-1", revoked_at: null },
      { id: 2, device_fingerprint: "device-2", revoked_at: null },
    ],
  },

  // Mock activation data
  mockActivation: {
    id: 1,
    license_id: 1,
    device_fingerprint: "test-device-123",
    certificate_serial: "test-serial-123",
    client_public_key: null,
    plugin_version: "1.0.0",
    platform: "mac",
    last_checkin: new Date(),
    revoked_at: null,
    requires_mtls: false,
    last_trust_level: 0,
    license: {
      id: 1,
      uid: "test-license-key-12345",
      status: "active",
    },
  },

  // Valid activation for testing
  validActivation: {
    id: 1,
    license_id: 1,
    device_fingerprint: "device-1",
    certificate_serial: "cert-123",
    client_public_key: null,
    plugin_version: "1.0.0",
    platform: "mac",
    last_checkin: new Date(),
    revoked_at: null,
    requires_mtls: false,
    last_trust_level: 0,
    license: {
      id: 1,
      uid: "license-uuid-active",
      status: "active",
    },
  },

  // Activate request fixture
  activateRequest: {
    licenseKey: "license-uuid-active",
    deviceFingerprint: "new-device-fingerprint",
    pluginVersion: "1.0.0",
    platform: "mac",
  },

  // Activate request with CSR
  activateRequestWithCSR: {
    licenseKey: "license-uuid-active",
    deviceFingerprint: "new-device-fingerprint",
    pluginVersion: "1.0.0",
    platform: "mac",
    csr: Buffer.from(
      "-----BEGIN CERTIFICATE REQUEST-----\ntest-csr\n-----END CERTIFICATE REQUEST-----",
    ).toString("base64"),
  },

  firstActivationClaim: {
    id: 500,
    status: "pending_confirmation",
    license: { id: 1 },
    owner_user: { id: 1 },
    device_fingerprint: "new-device-fingerprint",
    key_hash: null,
    csr_fingerprint: null,
    plugin_version: "1.0.0",
    platform: "mac",
    csr: null,
    machine_id: null,
    request_ip: "127.0.0.1",
    risk_score: 25,
    risk_reasons: ["first_activation_requires_owner_confirmation"],
    attempt_count: 1,
    expires_at: new Date("2026-03-06T12:15:00.000Z"),
  },

  // Mock product data
  mockProduct: {
    id: 1,
    name: "Ultimate Synth Bundle",
    slug: "ultimate-synth-bundle",
    type: "plugin",
    description: "A collection of premium synthesizer plugins",
    price_cents: 9999,
    currency: "USD",
    is_active: true,
  },

  // Mock CSR (Certificate Signing Request)
  mockCSR: `-----BEGIN CERTIFICATE REQUEST-----
MIIBWzCBuQIBADALBgkqhkiG9w0BAQEwGjEYMBYGA1UEAwwPRXhhbXBsZSBDTEkg
VFMBXxNcBZTBgkqhkiG9w0BAQcw
-----END CERTIFICATE REQUEST-----`,

  // Mock certificate
  mockCertificate: {
    certificate: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
    caCertificate:
      "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----",
    fingerprint: "aa:bb:cc:dd",
    serial: "test-serial-123",
  },

  // Trust levels
  TRUST_LEVEL: {
    NONE: 0,
    API_KEY: 1,
    MTLS: 2,
    SIGNED: 3,
    MTLS_SIGNED: 4,
  },

  // License status enum
  LICENSE_STATUS: {
    ACTIVE: "active",
    REVOKED: "revoked",
    EXPIRED: "expired",
  },

  // Platform enum
  PLATFORM: {
    WIN: "win",
    MAC: "mac",
    LINUX: "linux",
  },

  // Mock strapi instance
  createMockStrapi() {
    return {
      config: {
        get: jest.fn((path, defaultValue) => {
          if (path === "plugin::license-server") {
            return {
              gracePeriodDays: 7,
              heartbeatIntervalHours: 24,
              mtlsEndpoint: "https://api",
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
        service: jest.fn(() => ({
          generateSerialNumber: jest.fn(() => "test-serial-123"),
          signCSR: jest.fn(() => ({
            certificate:
              "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
            caCertificate:
              "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----",
            fingerprint: "aa:bb:cc:dd",
            serial: "test-serial-123",
          })),
          checkRevocation: jest.fn(() => ({ revoked: false })),
        })),
      })),
    };
  },

  // Test certificates (generated at runtime)
  get testCACertificate() {
    return getTestCA().certPem;
  },

  get testCAKey() {
    return getTestCA().keyPem;
  },

  get testClientCertificate() {
    return getTestClientCert().certPem;
  },

  get testClientKey() {
    return getTestClientCert().keyPem;
  },

  get testClientCACertificate() {
    return getTestClientCert().caCertPem;
  },

  get testCSR() {
    return getTestCSR().csrPem;
  },

  get testCSRKey() {
    return getTestCSR().privateKeyPem;
  },

  get testCSRMachineId() {
    return "test-machine-123";
  },

  get testCSRKeyHash() {
    return "a1b2c3d4e5f6";
  },

  // Get or create temp certificate file paths
  async getTestCertificateFiles() {
    if (!tempCertPaths) {
      const { certPath: caCertPath, keyPath: caKeyPath } =
        await testCrypto.saveCertificateToDisk(
          getTestCA().certPem,
          getTestCA().keyPem,
          "test-license-ca",
        );
      const { certPath: clientCertPath } =
        await testCrypto.saveCertificateToDisk(
          getTestClientCert().certPem,
          null,
          "test-client-cert",
        );

      tempCertPaths = {
        caCertPath,
        caKeyPath,
        clientCertPath,
      };
    }
    return tempCertPaths;
  },

  // Cleanup temp files
  cleanupTestFiles() {
    if (tempCertPaths) {
      testCrypto.cleanupTestCertificates([
        tempCertPaths.caCertPath,
        tempCertPaths.caKeyPath,
        tempCertPaths.clientCertPath,
      ]);
      tempCertPaths = null;
    }
  },

  // Test crypto utilities export for direct use in tests
  testCrypto,
};
