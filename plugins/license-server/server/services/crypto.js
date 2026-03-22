/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:55
 * Last Updated: 2026-03-05 04:55
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const forge = require("node-forge");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");

const NONCE_MODEL_UID = "plugin::license-server.request-nonce";

function loadRequiredPemFile(path, label) {
  if (!path) {
    throw new Error(`${label} not configured`);
  }

  try {
    return fs.readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`${label} not available`);
  }
}

function generateRequestNonce() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function buildSignedInternalRequestHeaders(body, config) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateRequestNonce();
  const signature = crypto
    .createHmac("sha256", config.signerSharedSecret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.signerAuthToken}`,
    "x-signer-timestamp": timestamp,
    "x-signer-nonce": nonce,
    "x-signer-signature": signature,
  };
}

function getNonceQuery() {
  if (!strapi?.db?.query) {
    return null;
  }

  try {
    return strapi.db.query(NONCE_MODEL_UID);
  } catch (err) {
    return null;
  }
}

function buildScopedNonceKey(scope, nonce) {
  return `nonce:${scope}:${nonce}`;
}

function buildNonceExpiry(ttlSeconds) {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function isExpiredNonceRecord(record) {
  if (!record?.expires_at) {
    return false;
  }

  return new Date(record.expires_at).getTime() <= Date.now();
}

function isUniqueConstraintError(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();

  return (
    code === "SQLITE_CONSTRAINT"
    || code === "23505"
    || message.includes("unique constraint")
    || message.includes("duplicate key")
    || message.includes("is already taken")
  );
}

async function listNonceRecordsByKey(nonceQuery, key) {
  if (typeof nonceQuery.findMany === "function") {
    const records = await nonceQuery.findMany({ where: { key } });
    return Array.isArray(records) ? records : [];
  }

  if (typeof nonceQuery.findOne === "function") {
    const record = await nonceQuery.findOne({ where: { key } });
    return record ? [record] : [];
  }

  return [];
}

async function deleteNonceRecords(nonceQuery, records = []) {
  for (const record of records) {
    if (record?.id) {
      await nonceQuery.delete({ where: { id: record.id } });
    }
  }
}

async function reserveNonceInDatabase({ nonce, scope, ttl, key: explicitKey }) {
  const nonceQuery = getNonceQuery();

  if (!nonceQuery) {
    return null;
  }

  const key = explicitKey || buildScopedNonceKey(scope, nonce);
  const data = {
    key,
    scope,
    nonce,
    expires_at: buildNonceExpiry(ttl),
  };

  const existingRecords = await listNonceRecordsByKey(nonceQuery, key);
  const activeRecord = existingRecords.find((record) => !isExpiredNonceRecord(record));

  if (activeRecord) {
    return false;
  }

  if (existingRecords.length > 0) {
    await deleteNonceRecords(nonceQuery, existingRecords);
  }

  try {
    await nonceQuery.create({ data });
    return true;
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      throw err;
    }
  }

  const retryRecords = await listNonceRecordsByKey(nonceQuery, key);
  const retryActive = retryRecords.find((record) => !isExpiredNonceRecord(record));

  if (!retryActive && retryRecords.length === 0) {
    try {
      await nonceQuery.create({ data });
      return true;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return false;
      }

      throw err;
    }
  }

  if (retryActive) {
    return false;
  }

  await deleteNonceRecords(nonceQuery, retryRecords);

  try {
    await nonceQuery.create({ data });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return false;
    }

    throw err;
  }
}

function buildRemoteSignerMtlsRequestOptions(endpointUrl, headers, body, config) {
  const endpoint = new URL(endpointUrl);

  if (endpoint.protocol !== "https:") {
    throw new Error("Remote signer mTLS requires https URL");
  }

  const ca = loadRequiredPemFile(
    config.signerTlsCaPath,
    "Remote signer CA certificate",
  );
  const cert = loadRequiredPemFile(
    config.signerTlsCertPath,
    "Remote signer client certificate",
  );
  const key = loadRequiredPemFile(
    config.signerTlsKeyPath,
    "Remote signer client private key",
  );

  return {
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    port: endpoint.port || 443,
    path: `${endpoint.pathname}${endpoint.search}`,
    method: "POST",
    timeout: config.signerTimeoutMs || 5000,
    headers: {
      ...headers,
      "Content-Length": Buffer.byteLength(body),
    },
    ca,
    cert,
    key,
    rejectUnauthorized: true,
  };
}

function postRemoteSignerMutualTLS(endpointUrl, body, headers, config) {
  const options = buildRemoteSignerMtlsRequestOptions(
    endpointUrl,
    headers,
    body,
    config,
  );

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];

      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsedBody = {};

        if (text) {
          try {
            parsedBody = JSON.parse(text);
          } catch (err) {
            parsedBody = { raw: text };
          }
        }

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusText: response.statusMessage,
          body: parsedBody,
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Remote signer request timed out"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function signCSRRemote(csrPem, serialNumber, machineId, keyHash) {
  const config = strapi.config.get("plugin::license-server");
  const signerUrl = config.signerUrl;

  if (!signerUrl) {
    throw new Error("Remote signer URL not configured");
  }

  if (!config.signerSharedSecret) {
    throw new Error("Remote signer shared secret not configured");
  }

  const requestBody = JSON.stringify({
    csr_pem: csrPem,
    serial_number: serialNumber,
    machine_id: machineId,
    key_hash: keyHash,
  });
  const requestHeaders = buildSignedInternalRequestHeaders(requestBody, config);
  const endpointUrl = `${signerUrl.replace(/\/$/, "")}/v1/certificates/issue`;

  const response = endpointUrl.startsWith("https://")
    ? await postRemoteSignerMutualTLS(
        endpointUrl,
        requestBody,
        requestHeaders,
        config,
      )
    : await fetch(endpointUrl, {
        method: "POST",
        signal:
          typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
            ? AbortSignal.timeout(config.signerTimeoutMs || 5000)
            : undefined,
        headers: requestHeaders,
        body: requestBody,
      }).then(async (fetchResponse) => ({
        ok: fetchResponse.ok,
        statusText: fetchResponse.statusText,
        body: await fetchResponse.json().catch(() => ({})),
      }));

  const body = response.body || {};

  if (!response.ok) {
    throw new Error(`Remote signer error: ${body.error || response.statusText}`);
  }

  return {
    certificate: body.certificate,
    caCertificate: body.ca_certificate,
    fingerprint: body.fingerprint,
    subjectCN: body.subject_cn,
    serial: body.serial,
  };
}

module.exports = {
  TRUST_LEVEL: {
    NONE: 0,
    API_KEY: 1,
    MTLS: 2,
    SIGNED: 3,
    MTLS_SIGNED: 4,
  },

  async loadCACert() {
    const config = strapi.config.get("plugin::license-server");
    const caPath = config.caCertPath;

    try {
      return fs.readFileSync(caPath, "utf8");
    } catch (err) {
      strapi.log.error("[Crypto] Failed to load CA cert:", err.message);
      throw new Error("CA certificate not configured");
    }
  },

  async loadCAKey() {
    const caKeyPath = strapi.config.get("plugin::license-server.caKeyPath");

    if (!caKeyPath) {
      throw new Error("CA private key not configured");
    }

    try {
      return fs.readFileSync(caKeyPath, "utf8");
    } catch (err) {
      strapi.log.error("[Crypto] Failed to load CA key:", err.message);
      throw new Error("CA private key not available");
    }
  },

  async loadCACertificate() {
    const caCertPem = await this.loadCACert();
    return forge.pki.certificateFromPem(caCertPem);
  },

  generateSerialNumber() {
    const bytes = forge.random.getBytesSync(16);
    return forge.util.bytesToHex(bytes).toUpperCase();
  },

  normalizeCertificateSerial(serialNumber) {
    if (!serialNumber) {
      return null;
    }

    const normalized = String(serialNumber).trim().toUpperCase();

    if (!/^[0-9A-F]+$/.test(normalized)) {
      return normalized || null;
    }

    return normalized.replace(/^(?:00)+/, "") || "00";
  },

  computeFingerprint(certPem) {
    const cert = forge.pki.certificateFromPem(certPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return crypto.createHash("sha256").update(der).digest("hex");
  },

  extractCertificateSerial(certPem) {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      return this.normalizeCertificateSerial(cert.serialNumber);
    } catch (err) {
      return null;
    }
  },

  extractMachineIdFromCert(certPem) {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      const cnAttr = cert.subject.attributes.find(
        (a) => a.shortName === "CN" || a.name === "commonName",
      );

      if (!cnAttr) return null;

      const cn = cnAttr.value;
      const match = cn.match(/^client:([^:]+):(.+)$/);

      if (match) {
        return {
          machineId: match[1],
          keyHash: match[2],
        };
      }

      return null;
    } catch (err) {
      return null;
    }
  },

  readCertificateMetadata(certPem) {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      const cnAttr = cert.subject.attributes.find(
        (a) => a.shortName === "CN" || a.name === "commonName",
      );

      return {
        serial: this.normalizeCertificateSerial(cert.serialNumber),
        fingerprint: this.computeFingerprint(certPem),
        subjectCN: cnAttr?.value || null,
        notBefore: cert.validity?.notBefore || null,
        notAfter: cert.validity?.notAfter || null,
      };
    } catch (err) {
      return {
        serial: null,
        fingerprint: null,
        subjectCN: null,
        notBefore: null,
        notAfter: null,
      };
    }
  },

  async signCSR(csrPem, serialNumber, machineId, keyHash) {
    const config = strapi.config.get("plugin::license-server");

    if (config.signerMode === "remote") {
      return signCSRRemote(csrPem, serialNumber, machineId, keyHash);
    }

    const caCertPem = await this.loadCACert();
    const caKeyPem = await this.loadCAKey();

    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);

    const csr = forge.pki.certificationRequestFromPem(csrPem);

    const clientCert = forge.pki.createCertificate();
    clientCert.publicKey = csr.publicKey;
    clientCert.serialNumber = serialNumber;

    const cnValue = `client:${machineId}:${keyHash}`;
    const subjectAttrs = csr.subject.attributes.filter(
      (a) => a.shortName !== "CN" && a.name !== "commonName",
    );
    subjectAttrs.unshift({ name: "commonName", value: cnValue });

    clientCert.setSubject(subjectAttrs);
    clientCert.setIssuer(caCert.subject.attributes);

    const validityDays = config.certificateValidityDays || 365;

    clientCert.validity.notBefore = new Date();
    clientCert.validity.notAfter = new Date();
    clientCert.validity.notAfter.setDate(
      clientCert.validity.notBefore.getDate() + validityDays,
    );

    const extensions = [
      {
        name: "basicConstraints",
        cA: false,
      },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        clientAuth: true,
      },
      {
        name: "subjectAltName",
        altNames: [
          {
            type: 2,
            value: serialNumber,
          },
          {
            type: 7,
            ip: "127.0.0.1",
          },
        ],
      },
    ];

    clientCert.setExtensions(extensions);

    clientCert.sign(caKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(clientCert);
    const fingerprint = this.computeFingerprint(certPem);

    return {
      certificate: certPem,
      caCertificate: caCertPem,
      fingerprint,
      subjectCN: cnValue,
      serial: clientCert.serialNumber?.toUpperCase?.() || serialNumber,
    };
  },

  buildSignedInternalRequestHeaders(body, config) {
    return buildSignedInternalRequestHeaders(body, config);
  },

  buildRemoteSignerMtlsRequestOptions(endpointUrl, headers, body, config) {
    return buildRemoteSignerMtlsRequestOptions(endpointUrl, headers, body, config);
  },

  async verifyClientCert(certPem) {
    const caCertPem = await this.loadCACert();

    try {
      const caCert = forge.pki.certificateFromPem(caCertPem);
      const clientCert = forge.pki.certificateFromPem(certPem);

      const verified = clientCert.verify(caCert);

      if (!verified) {
        return {
          valid: false,
          reason: "Certificate signature invalid",
          trustLevel: this.TRUST_LEVEL.NONE,
        };
      }

      const now = new Date();
      if (
        now < clientCert.validity.notBefore ||
        now > clientCert.validity.notAfter
      ) {
        return {
          valid: false,
          reason: "Certificate expired",
          trustLevel: this.TRUST_LEVEL.NONE,
        };
      }

      const machineInfo = this.extractMachineIdFromCert(certPem);

      return {
        valid: true,
        serial: clientCert.serialNumber,
        fingerprint: this.computeFingerprint(certPem),
        machineId: machineInfo?.machineId,
        trustLevel: this.TRUST_LEVEL.MTLS,
      };
    } catch (err) {
      return {
        valid: false,
        reason: err.message,
        trustLevel: this.TRUST_LEVEL.NONE,
      };
    }
  },

  parseClientCertFromHeaders(headers) {
    const sslVerify = headers["x-ssl-verified"];
    const certSerial = headers["x-client-cert-serial"];
    const certDn = headers["x-client-cert-dn"];
    const certFingerprint = headers["x-client-cert-fingerprint"];
    const rawCert = headers["x-client-cert"];

    if (sslVerify !== "SUCCESS") {
      return {
        verified: false,
        reason: sslVerify || "NONE",
        trustLevel: this.TRUST_LEVEL.NONE,
      };
    }

    return {
      verified: true,
      serial: certSerial,
      subjectDN: certDn,
      fingerprint: certFingerprint,
      rawCert,
      trustLevel: this.TRUST_LEVEL.MTLS,
    };
  },

  signResponse(payload, includeSignature = true) {
    const config = strapi.config.get("plugin::license-server");
    const secret = config.serverSecret;

    if (!includeSignature) {
      return { payload, signature: null };
    }

    const signature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("base64");

    return { payload, signature };
  },

  serializePayloadForSignature(payload) {
    const normalize = (value) => {
      if (Array.isArray(value)) {
        return value.map((item) => normalize(item));
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value && typeof value === "object") {
        return Object.keys(value)
          .sort()
          .reduce((acc, key) => {
            const normalized = normalize(value[key]);
            if (normalized !== undefined) {
              acc[key] = normalized;
            }
            return acc;
          }, {});
      }

      return value;
    };

    return JSON.stringify(normalize(payload || {}));
  },

  verifyRequestSignature(payload, signature, publicKey) {
    try {
      if (!signature || !publicKey) {
        return false;
      }

      const serializedPayload = this.serializePayloadForSignature(payload);

      return crypto.verify(
        "RSA-SHA256",
        Buffer.from(serializedPayload, "utf8"),
        publicKey,
        Buffer.from(signature, "base64"),
      );
    } catch (err) {
      return false;
    }
  },

  verifyNonce(nonce) {
    const redisService = strapi.plugin("redis")?.service("default");

    if (redisService) {
      return redisService.get(`nonce:${nonce}`).then((exists) => !!exists);
    }

    const nonceQuery = getNonceQuery();

    if (!nonceQuery) {
      return Promise.resolve(false);
    }

    return nonceQuery.findOne({ where: { key: `nonce:${nonce}` } }).then((record) => {
      if (!record) {
        return false;
      }

      return !isExpiredNonceRecord(record);
    });
  },

  hasNonceStore() {
    return !!strapi.plugin("redis")?.service("default") || !!getNonceQuery();
  },

  async reserveNonce(nonce, scope = "default") {
    const redisService = strapi.plugin("redis")?.service("default");
    const config = strapi.config.get("plugin::license-server", {});
    const ttl = config.nonceTtl || 300;

    if (redisService) {
      const key = buildScopedNonceKey(scope, nonce);
      const result = await redisService.set(key, "1", "EX", ttl, "NX");
      return result === "OK";
    }

    return reserveNonceInDatabase({ nonce, scope, ttl });
  },

  setNonce(nonce) {
    const redisService = strapi.plugin("redis")?.service("default");
    const config = strapi.config.get("plugin::license-server", {});
    const ttl = config.nonceTtl || 300;

    if (redisService) {
      return redisService.set(`nonce:${nonce}`, "1", "EX", ttl);
    }

    return reserveNonceInDatabase({
      nonce,
      scope: "legacy",
      ttl,
      key: `nonce:${nonce}`,
    }).then(() => undefined);
  },

  async checkRevocation(serialNumber, fingerprint) {
    const certRecord = await strapi.db
      .query("plugin::license-server.client-certificate")
      .findOne({
        where: {
          $or: [
            { certificate_serial: serialNumber },
            { fingerprint_sha256: fingerprint },
          ],
        },
      });

    if (!certRecord) {
      return { revoked: false, reason: "not_found" };
    }

    if (certRecord.status === "revoked") {
      return {
        revoked: true,
        reason: "revoked",
        revokedAt: certRecord.revoked_at,
      };
    }

    if (certRecord.status === "expired") {
      return {
        revoked: true,
        reason: "expired",
        expiredAt: certRecord.not_after,
      };
    }

    return { revoked: false, reason: "active" };
  },
};
