/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:52
 * Last Updated: 2026-03-22 02:32
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

module.exports = {
  validLicense: {
    id: 1,
    uid: 'license-uuid-1234',
    user: { id: 1, email: 'test@example.com' },
    product: { id: 1, name: 'Test Plugin' },
    status: 'active',
    activation_limit: 3,
    issued_at: new Date('2024-01-01'),
    expires_at: null,
    revoked_at: null,
    activations: [],
  },
  
  expiredLicense: {
    id: 2,
    uid: 'license-uuid-5678',
    user: { id: 1 },
    product: { id: 1 },
    status: 'expired',
    activation_limit: 3,
    issued_at: new Date('2023-01-01'),
    expires_at: new Date('2023-12-31'),
    revoked_at: null,
    activations: [],
  },
  
  revokedLicense: {
    id: 3,
    uid: 'license-uuid-9999',
    user: { id: 1 },
    product: { id: 1 },
    status: 'revoked',
    activation_limit: 3,
    issued_at: new Date('2024-01-01'),
    expires_at: null,
    revoked_at: new Date('2024-06-01'),
    activations: [],
  },
  
  licenseWithActivations: {
    id: 4,
    uid: 'license-uuid-active',
    user: { id: 1 },
    product: { id: 1 },
    status: 'active',
    activation_limit: 3,
    issued_at: new Date(),
    expires_at: null,
    revoked_at: null,
    activations: [
      { id: 1, device_fingerprint: 'device-1', revoked_at: null },
      { id: 2, device_fingerprint: 'device-2', revoked_at: null },
    ],
  },
  
  validActivation: {
    id: 10,
    license: { id: 1 },
    device_fingerprint: 'test-fingerprint',
    client_public_key: 'public-key-pem',
    certificate_serial: 'serial-12345',
    plugin_version: '1.0.0',
    platform: 'win',
    last_checkin: new Date(),
    revoked_at: null,
  },
  
  revokedActivation: {
    id: 11,
    license: { id: 1 },
    device_fingerprint: 'test-fingerprint-revoked',
    certificate_serial: 'serial-67890',
    plugin_version: '1.0.0',
    platform: 'win',
    last_checkin: new Date(),
    revoked_at: new Date(),
  },
  
  activateRequest: {
    license_key: 'license-uuid-1234',
    device_fingerprint: 'new-device-fingerprint',
    plugin_version: '1.0.0',
    platform: 'win',
    csr: 'base64-encoded-csr',
  },
  
  csrPem: `-----BEGIN CERTIFICATE REQUEST-----
MIICXTCCAUUCAQAwGDEWMBQGA1UEAwwNUGx1Z2luIFVzZXIwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQC7VJTUt9Us8cKjQ1fEoMvPZH2mKx1sHmfR7fV2
-----END CERTIFICATE REQUEST-----`,
};
