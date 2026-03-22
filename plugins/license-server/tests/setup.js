/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:38
 * Last Updated: 2026-03-05 04:38
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

const mockStrapi = {
  config: {
    get: jest.fn((path, defaultValue) => defaultValue),
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
      verifyNonce: jest.fn().mockResolvedValue(false),
      setNonce: jest.fn().mockResolvedValue(true),
    })),
  })),
};

global.strapi = mockStrapi;

jest.mock("node-forge", () => {
  let callCount = 0;
  const mockKeyPair = { publicKey: {}, privateKey: {} };
  const mockCertificate = {
    subject: { attributes: [] },
    verify: jest.fn(() => true),
    validity: { notBefore: new Date(), notAfter: new Date() },
    serialNumber: "test-serial",
    publicKey: {},
    setSubject: jest.fn(),
    setIssuer: jest.fn(),
    setExtensions: jest.fn(),
    sign: jest.fn(),
  };

  return {
    pki: {
      certificateFromPem: jest.fn(() => ({ ...mockCertificate })),
      certificationRequestFromPem: jest.fn(() => ({
        subject: { attributes: [{ shortName: "CN", value: "test" }] },
        publicKey: { test: true },
      })),
      privateKeyFromPem: jest.fn(() => ({ test: true })),
      publicKeyToPem: jest.fn(
        () => "-----BEGIN PUBLIC KEY-----test-----END PUBLIC KEY-----",
      ),
      publicKeyFromPem: jest.fn(() => ({})),
      privateKeyToPem: jest.fn(
        () => "-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----",
      ),
      createCertificate: jest.fn(() => ({
        ...mockCertificate,
        validity: { notBefore: new Date(), notAfter: new Date() },
      })),
      certificateToPem: jest.fn(
        () => "-----BEGIN CERTIFICATE-----test-----END CERTIFICATE-----",
      ),
      createCertificationRequest: jest.fn(() => ({
        publicKey: {},
        setSubject: jest.fn(),
        sign: jest.fn(),
      })),
      certificationRequestToPem: jest.fn(
        () =>
          "-----BEGIN CERTIFICATE REQUEST-----test-----END CERTIFICATE REQUEST-----",
      ),
      rsa: {
        generateKeyPair: jest.fn((options, callback) => {
          const keys = { ...mockKeyPair };
          if (callback) {
            callback(null, keys);
          }
          return keys;
        }),
      },
    },
    md: {
      sha256: {
        create: jest.fn(() => ({
          update: jest.fn(),
          digest: jest.fn(() => "hash"),
        })),
      },
    },
    random: {
      getBytesSync: jest.fn(() => {
        callCount++;
        return `random-bytes-${callCount}`;
      }),
    },
    util: {
      bytesToHex: jest.fn((bytes) => {
        return `hex-${bytes.substring(0, 10)}`;
      }),
      verifyRSASSA_PKCS1_V1_5: jest.fn(() => true),
    },
  };
});

jest.mock("fs", () => ({
  readFileSync: jest.fn(
    () => "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
  ),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-uuid-1234"),
}));
