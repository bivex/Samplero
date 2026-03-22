const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

const forge = require("node-forge");
const nodeCrypto = require("crypto");
const fs = require("fs");

describe("Crypto service remote signer", () => {
  let cryptoService;
  let mockStrapi;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockStrapi = {
      config: {
        get: jest.fn((path, fallback) => {
          if (path === "plugin::license-server") {
            return {
              signerMode: "remote",
              signerUrl: "http://signer.internal",
              signerAuthToken: "secret-token",
              signerSharedSecret: "shared-secret",
              signerFreshnessMaxSkewSeconds: 60,
              certificateValidityDays: 365,
            };
          }
          if (path === "plugin::license-server.signerTimeoutMs") {
            return 5000;
          }
          return fallback;
        }),
      },
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
    global.strapi = mockStrapi;
    cryptoService = freshRequire("../../server/services/crypto");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (typeof jest.restoreAllMocks === "function") {
      jest.restoreAllMocks();
    }
  });

  it("delegates CSR signing to the remote signer service", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    jest.spyOn(nodeCrypto, "randomUUID").mockReturnValue("nonce-123");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ certificate: "CERT", ca_certificate: "CA", fingerprint: "FP", subject_cn: "client:dev:hash", serial: "SER-REMOTE" }),
    });

    const result = await cryptoService.signCSR("CSR", "SERIAL-1", "dev", "hash");
    const expectedBody = JSON.stringify({ csr_pem: "CSR", serial_number: "SERIAL-1", machine_id: "dev", key_hash: "hash" });
    const expectedSignature = nodeCrypto
      .createHmac("sha256", "shared-secret")
      .update(`1710000000.nonce-123.${expectedBody}`)
      .digest("hex");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://signer.internal/v1/certificates/issue",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "x-signer-timestamp": "1710000000",
          "x-signer-nonce": "nonce-123",
          "x-signer-signature": expectedSignature,
        }),
        body: expectedBody,
      }),
    );
    expect(result).toEqual({ certificate: "CERT", caCertificate: "CA", fingerprint: "FP", subjectCN: "client:dev:hash", serial: "SER-REMOTE" });
  });

  it("throws when the remote signer returns an error payload", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "bad csr" }) });

    await expect(cryptoService.signCSR("CSR", "SERIAL-1", "dev", "hash")).rejects.toThrow("Remote signer error: bad csr");
  });

  it("builds mTLS request options for https signer endpoints", () => {
    jest.spyOn(fs, "readFileSync").mockImplementation((path) => {
      if (path === "/tls/ca.crt") return "CA-CERT";
      if (path === "/tls/client.crt") return "CLIENT-CERT";
      if (path === "/tls/client.key") return "CLIENT-KEY";
      throw new Error(`unexpected path ${path}`);
    });

    const options = cryptoService.buildRemoteSignerMtlsRequestOptions(
      "https://cert-signer.internal:8081/v1/certificates/issue",
      { Authorization: "Bearer secret-token" },
      "{}",
      {
        signerTimeoutMs: 5000,
        signerTlsCaPath: "/tls/ca.crt",
        signerTlsCertPath: "/tls/client.crt",
        signerTlsKeyPath: "/tls/client.key",
      },
    );

    expect(options).toEqual(
      expect.objectContaining({
        hostname: "cert-signer.internal",
        port: "8081",
        path: "/v1/certificates/issue",
        ca: "CA-CERT",
        cert: "CLIENT-CERT",
        key: "CLIENT-KEY",
        rejectUnauthorized: true,
      }),
    );
  });

  it("requires mTLS files for https signer endpoints", async () => {
    mockStrapi.config.get = jest.fn((path, fallback) => {
      if (path === "plugin::license-server") {
        return {
          signerMode: "remote",
          signerUrl: "https://signer.internal",
          signerAuthToken: "secret-token",
          signerSharedSecret: "shared-secret",
          signerTimeoutMs: 5000,
        };
      }
      return fallback;
    });
    cryptoService = freshRequire("../../server/services/crypto");

    await expect(cryptoService.signCSR("CSR", "SERIAL-1", "dev", "hash")).rejects.toThrow(
      "Remote signer CA certificate not configured",
    );
  });

  it("returns the issued serial in local signer mode", async () => {
    const originalForgeFns = {
      certificateFromPem: forge.pki.certificateFromPem,
      privateKeyFromPem: forge.pki.privateKeyFromPem,
      certificationRequestFromPem: forge.pki.certificationRequestFromPem,
      createCertificate: forge.pki.createCertificate,
      certificateToPem: forge.pki.certificateToPem,
    };

    mockStrapi.config.get = jest.fn((path, fallback) => {
      if (path === "plugin::license-server") {
        return {
          signerMode: "local",
          certificateValidityDays: 365,
          caKeyPath: "/tmp/test-ca.key",
          caCertPath: "/tmp/test-ca.crt",
        };
      }
      if (path === "plugin::license-server.caKeyPath") {
        return "/tmp/test-ca.key";
      }
      return fallback;
    });

    cryptoService.loadCACert = jest.fn(
      async () => "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----",
    );
    cryptoService.loadCAKey = jest.fn(
      async () => "-----BEGIN PRIVATE KEY-----\nTEST-KEY\n-----END PRIVATE KEY-----",
    );
    cryptoService.computeFingerprint = jest.fn(() => "FP-LOCAL");

    forge.pki.certificateFromPem = jest.fn(() => ({ subject: { attributes: [] } }));
    forge.pki.privateKeyFromPem = jest.fn(() => ({ mocked: true }));
    forge.pki.certificationRequestFromPem = jest.fn(() => ({
      publicKey: { mocked: true },
      subject: { attributes: [{ shortName: "CN", value: "ignored" }] },
    }));
    forge.pki.createCertificate = jest.fn(() => ({
      serialNumber: null,
      validity: { notBefore: new Date(), notAfter: new Date() },
      setSubject: jest.fn(),
      setIssuer: jest.fn(),
      setExtensions: jest.fn(),
      sign: jest.fn(),
    }));
    forge.pki.certificateToPem = jest.fn(
      () => "-----BEGIN CERTIFICATE-----\nLOCAL\n-----END CERTIFICATE-----",
    );

    try {
      const result = await cryptoService.signCSR(
        "-----BEGIN CERTIFICATE REQUEST-----\nTEST\n-----END CERTIFICATE REQUEST-----",
        "SERIAL-LOCAL",
        "dev-machine",
        "hash1234",
      );

      expect(result.serial).toBe("SERIAL-LOCAL");
      expect(result.subjectCN).toBe("client:dev-machine:hash1234");
      expect(result.fingerprint).toBe("FP-LOCAL");
    } finally {
      forge.pki.certificateFromPem = originalForgeFns.certificateFromPem;
      forge.pki.privateKeyFromPem = originalForgeFns.privateKeyFromPem;
      forge.pki.certificationRequestFromPem =
        originalForgeFns.certificationRequestFromPem;
      forge.pki.createCertificate = originalForgeFns.createCertificate;
      forge.pki.certificateToPem = originalForgeFns.certificateToPem;
    }
  });

  it("normalizes certificate serials for proxy/header lookup edge cases", () => {
    expect(cryptoService.normalizeCertificateSerial("008d5c397a7d5cac9200c05ed2363bf915")).toBe(
      "8D5C397A7D5CAC9200C05ED2363BF915",
    );
    expect(cryptoService.normalizeCertificateSerial("0000")).toBe("00");
    expect(cryptoService.normalizeCertificateSerial("ser-local")).toBe("SER-LOCAL");
    expect(cryptoService.normalizeCertificateSerial(null)).toBeNull();
  });

  it("extractCertificateSerial returns normalized uppercase serials from certs", () => {
    const originalCertificateFromPem = forge.pki.certificateFromPem;
    forge.pki.certificateFromPem = jest.fn(() => ({ serialNumber: "00abc123" }));

    try {
      expect(cryptoService.extractCertificateSerial("CERT")).toBe("ABC123");
    } finally {
      forge.pki.certificateFromPem = originalCertificateFromPem;
    }
  });
});

describe("Crypto service nonce storage", () => {
  let cryptoService;
  let mockStrapi;
  let nonceQuery;

  beforeEach(() => {
    nonceQuery = {
      create: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    };

    mockStrapi = {
      config: {
        get: jest.fn((path, fallback) => {
          if (path === "plugin::license-server") {
            return { nonceTtl: 300 };
          }
          return fallback;
        }),
      },
      db: {
        query: jest.fn((uid) => {
          if (uid === "plugin::license-server.request-nonce") {
            return nonceQuery;
          }
          throw new Error(`Unexpected model ${uid}`);
        }),
      },
      plugin: jest.fn(() => undefined),
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };

    global.strapi = mockStrapi;
    cryptoService = freshRequire("../../server/services/crypto");
  });

  it("uses the database-backed nonce store when Redis is unavailable", async () => {
    nonceQuery.findMany.mockResolvedValue([]);
    nonceQuery.create.mockResolvedValue({ id: 1 });

    await expect(cryptoService.reserveNonce("nonce-a", "/api/license/validate")).resolves.toBe(true);
    expect(cryptoService.hasNonceStore()).toBe(true);
    expect(nonceQuery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: "nonce:/api/license/validate:nonce-a",
        scope: "/api/license/validate",
        nonce: "nonce-a",
      }),
    });
  });

  it("returns false when the database nonce already exists and is still fresh", async () => {
    nonceQuery.findMany.mockResolvedValue([{
      id: 7,
      key: "nonce:/api/license/validate:nonce-b",
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    }]);

    await expect(cryptoService.reserveNonce("nonce-b", "/api/license/validate")).resolves.toBe(false);
    expect(nonceQuery.create).not.toHaveBeenCalled();
    expect(nonceQuery.delete).not.toHaveBeenCalled();
  });

  it("reclaims expired database nonces and reserves them again", async () => {
    nonceQuery.findMany.mockResolvedValue([{
      id: 8,
      key: "nonce:/api/license/validate:nonce-c",
      expires_at: new Date(Date.now() - 30_000).toISOString(),
    }]);
    nonceQuery.delete.mockResolvedValue({ id: 8 });
    nonceQuery.create.mockResolvedValue({ id: 8 });

    await expect(cryptoService.reserveNonce("nonce-c", "/api/license/validate")).resolves.toBe(true);
    expect(nonceQuery.delete).toHaveBeenCalledWith({ where: { id: 8 } });
    expect(nonceQuery.create).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate nonces even when the backing schema is missing a unique index", async () => {
    const records = new Map();

    nonceQuery.findMany.mockImplementation(async ({ where: { key } }) =>
      Array.from(records.values()).filter((record) => record.key === key));
    nonceQuery.delete.mockImplementation(async ({ where: { id } }) => {
      records.delete(id);
      return { id };
    });
    nonceQuery.create.mockImplementation(async ({ data }) => {
      const record = { id: records.size + 1, ...data };
      records.set(record.id, record);
      return record;
    });

    await expect(cryptoService.reserveNonce("nonce-no-unique", "/api/license/validate")).resolves.toBe(true);
    await expect(cryptoService.reserveNonce("nonce-no-unique", "/api/license/validate")).resolves.toBe(false);
    expect(Array.from(records.values())).toHaveLength(1);
  });

  it("verifyNonce returns true only for fresh legacy DB nonce records", async () => {
    nonceQuery.findOne
      .mockResolvedValueOnce({
        id: 11,
        key: "nonce:nonce-fresh",
        expires_at: new Date(Date.now() + 30_000).toISOString(),
      })
      .mockResolvedValueOnce({
        id: 12,
        key: "nonce:nonce-expired",
        expires_at: new Date(Date.now() - 30_000).toISOString(),
      });

    await expect(cryptoService.verifyNonce("nonce-fresh")).resolves.toBe(true);
    await expect(cryptoService.verifyNonce("nonce-expired")).resolves.toBe(false);
  });

  it("setNonce stores a legacy nonce key that verifyNonce can read via DB fallback", async () => {
    const records = new Map();

    nonceQuery.create.mockImplementation(async ({ data }) => {
      records.set(data.key, { id: records.size + 1, ...data });
      return records.get(data.key);
    });
    nonceQuery.findOne.mockImplementation(async ({ where: { key } }) => records.get(key) || null);

    await expect(cryptoService.setNonce("nonce-roundtrip")).resolves.toBeUndefined();
    expect(nonceQuery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: "nonce:nonce-roundtrip",
        scope: "legacy",
        nonce: "nonce-roundtrip",
      }),
    });
    await expect(cryptoService.verifyNonce("nonce-roundtrip")).resolves.toBe(true);
  });
});

