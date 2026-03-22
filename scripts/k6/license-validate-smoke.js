/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:32
 * Last Updated: 2026-03-22 02:32
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'https://localhost:8443').replace(/\/$/, '');
const apiPrefix = (__ENV.API_PREFIX || '/api/license').replace(/\/$/, '');
const requestPathOverride = __ENV.REQUEST_PATH_OVERRIDE || '';
const licenseKey = __ENV.LICENSE_KEY;
const deviceFingerprint = __ENV.DEVICE_FINGERPRINT;
const signature = __ENV.REQUEST_SIGNATURE;
const clientCertPath = __ENV.CLIENT_CERT_PATH;
const clientKeyPath = __ENV.CLIENT_KEY_PATH;
const expectedTrustLevel = Number(__ENV.EXPECTED_TRUST_LEVEL || (clientCertPath && clientKeyPath ? 4 : 3));
const sleepMs = Number(__ENV.SLEEP_MS || 0);
const tlsDomains = (__ENV.TLS_AUTH_DOMAINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!licenseKey || !deviceFingerprint || !signature) {
  throw new Error('LICENSE_KEY, DEVICE_FINGERPRINT, and REQUEST_SIGNATURE are required');
}

const tlsAuthEntries = [];

if (clientCertPath && clientKeyPath) {
  const tlsAuthEntry = {
    cert: open(clientCertPath),
    key: open(clientKeyPath),
  };

  if (tlsDomains.length) {
    tlsAuthEntry.domains = tlsDomains;
  }

  tlsAuthEntries.push(tlsAuthEntry);
}

export const options = {
  vus: Number(__ENV.VUS || 10),
  iterations: Number(__ENV.ITERATIONS || 100),
  insecureSkipTLSVerify: true,
  tlsAuth: tlsAuthEntries,
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000'],
  },
};

const validateUrl = requestPathOverride
  ? `${baseUrl}${requestPathOverride}`
  : `${baseUrl}${apiPrefix}/validate?license_key=${encodeURIComponent(licenseKey)}&device_fingerprint=${encodeURIComponent(deviceFingerprint)}`;

export default function () {
  const res = http.get(validateUrl, {
    headers: {
      'x-request-signature': signature,
      Accept: 'application/json',
    },
  });

  let body = {};
  try {
    body = res.json();
  } catch (_) {
    body = {};
  }

  check(res, {
    'validate status 200': (r) => r.status === 200,
    'validate valid true': () => body.valid === true,
    'trust_level matches expected': () => body.trust_level === expectedTrustLevel,
  });

  if (sleepMs > 0) {
    sleep(sleepMs / 1000);
  }
}

