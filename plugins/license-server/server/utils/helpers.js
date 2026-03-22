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

"use strict";

const crypto = require("crypto");

function generateNonce() {
  return crypto.randomUUID();
}

function hashFingerprint(fingerprint) {
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

function parseCSR(csrBase64) {
  try {
    const decoded = Buffer.from(csrBase64, "base64").toString("utf8");
    const forge = require("node-forge");
    const csr = forge.pki.certificationRequestFromPem(decoded);
    return {
      valid: true,
      cn: getCSRAttribute(csr, "CN"),
      o: getCSRAttribute(csr, "O"),
      publicKey: forge.pki.publicKeyToPem(csr.publicKey),
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function getCSRAttribute(csr, attrName) {
  const attr = csr.subject.attributes.find(
    (a) => a.shortName === attrName || a.name === attrName,
  );
  return attr ? attr.value : null;
}

function formatDate(date) {
  return date ? new Date(date).toISOString() : null;
}

module.exports = {
  generateNonce,
  hashFingerprint,
  parseCSR,
  formatDate,
};
