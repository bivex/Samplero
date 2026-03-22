/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 06:00
 * Last Updated: 2026-03-05 06:00
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const forge = require("node-forge");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Store created temp files for cleanup
const tempFiles = [];

/**
 * Generate RSA key pair for testing
 * @param {number} bits - Key size in bits (default: 2048)
 * @returns {Object} { publicKey, privateKey, keyPair }
 */
function generateTestKeyPair(bits = 2048) {
  const keyPair = forge.pki.rsa.generateKeyPair(bits);
  return {
    publicKey: forge.pki.publicKeyToPem(keyPair.publicKey),
    privateKey: forge.pki.privateKeyToPem(keyPair.privateKey),
    keyPair, // raw forge object for further operations
  };
}

/**
 * Generate a valid CSR with given subject
 * @param {Object} options - CSR generation options
 * @param {Object} options.subject - Subject attributes { CN, C, O, OU, etc. }
 * @param {string} options.publicKey - PEM formatted public key (optional)
 * @param {string} options.privateKey - PEM formatted private key (optional)
 * @returns {Object} { csrPem, privateKeyPem, csr }
 */
function generateTestCSR(options = {}) {
  const {
    subject = { CN: "test-client" },
    publicKey = null,
    privateKey = null,
  } = options;

  // Generate or use provided key pair
  const keyPair = privateKey
    ? { privateKey: forge.pki.privateKeyFromPem(privateKey) }
    : forge.pki.rsa.generateKeyPair(2048);

  // If publicKey is provided as PEM, convert it
  const pubKey = publicKey
    ? forge.pki.publicKeyFromPem(publicKey)
    : keyPair.publicKey;

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = pubKey;
  csr.setSubject([
    { name: "commonName", value: subject.CN || "test-client" },
    { name: "countryName", value: subject.C || "US" },
    { name: "organizationName", value: subject.O || "Test Org" },
    { name: "organizationalUnitName", value: subject.OU || "Test Unit" },
  ]);
  csr.sign(keyPair.privateKey, forge.md.sha256.create());

  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
    csr, // raw forge object
  };
}

/**
 * Generate a self-signed CA certificate for testing
 * @param {Object} options - CA certificate options
 * @param {string} options.commonName - CA common name (default: 'Test CA')
 * @param {number} options.validityDays - Certificate validity in days (default: 365)
 * @param {number} options.bits - RSA key size (default: 2048)
 * @returns {Object} { certPem, keyPem, cert }
 */
function generateTestCACertificate(options = {}) {
  const { commonName = "Test CA", validityDays = 365, bits = 2048 } = options;

  const keyPair = forge.pki.rsa.generateKeyPair(bits);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(
    cert.validity.notAfter.getDate() + validityDays,
  );

  const subject = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: "US" },
    { name: "organizationName", value: "Test CA Organization" },
  ];

  cert.setSubject(subject);
  cert.setIssuer(subject); // Self-signed

  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      cRLSign: true,
    },
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
  ]);

  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
    cert, // raw forge object
  };
}

/**
 * Generate a client certificate signed by test CA
 * @param {string} csrPem - PEM formatted CSR
 * @param {string} caCertPem - PEM formatted CA certificate
 * @param {string} caKeyPem - PEM formatted CA private key
 * @param {Object} options - Certificate options
 * @param {string} options.serialNumber - Certificate serial number
 * @param {number} options.validityDays - Validity period in days
 * @param {string} options.machineId - Machine ID for CN
 * @param {string} options.keyHash - Key hash for CN
 * @returns {Object} { certPem, caCertPem, cert }
 */
function signClientCertificate(csrPem, caCertPem, caKeyPem, options = {}) {
  const {
    serialNumber = "TEST001",
    validityDays = 365,
    machineId = "test-machine",
    keyHash = "abc123def456",
  } = options;

  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = serialNumber;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(
    cert.validity.notAfter.getDate() + validityDays,
  );

  // Set CN to client:machineId:keyHash format
  const cnValue = `client:${machineId}:${keyHash}`;
  const subjectAttrs = csr.subject.attributes.filter(
    (a) => a.shortName !== "CN" && a.name !== "commonName",
  );
  subjectAttrs.unshift({ name: "commonName", value: cnValue });

  cert.setSubject(subjectAttrs);
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", clientAuth: true },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: serialNumber },
        { type: 7, ip: "127.0.0.1" },
      ],
    },
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    caCertPem,
    cert, // raw forge object
  };
}

/**
 * Generate a complete client certificate (CSR + signing)
 * @param {Object} options - Generation options
 * @param {string} options.machineId - Machine ID
 * @param {string} options.keyHash - Key hash
 * @param {string} options.serialNumber - Serial number
 * @returns {Object} { certPem, keyPem, caCertPem, caKeyPem, csrPem }
 */
function generateTestClientCertificate(options = {}) {
  const {
    machineId = "test-machine-" + Math.random().toString(36).substr(2, 9),
    keyHash = crypto.randomBytes(16).toString("hex"),
    serialNumber = "TEST" +
      Math.random().toString(36).substr(2, 6).toUpperCase(),
  } = options;

  // Generate CA certificate
  const { certPem: caCertPem, keyPem: caKeyPem } = generateTestCACertificate();

  // Generate CSR
  const { csrPem, privateKeyPem } = generateTestCSR({
    subject: { CN: "test-client" },
  });

  // Sign the CSR
  const { certPem } = signClientCertificate(csrPem, caCertPem, caKeyPem, {
    machineId,
    keyHash,
    serialNumber,
  });

  return {
    certPem,
    keyPem: privateKeyPem,
    caCertPem,
    caKeyPem,
    csrPem,
  };
}

/**
 * Save certificates to temp files for fs-based tests
 * @param {string} certPem - PEM formatted certificate
 * @param {string} keyPem - PEM formatted key (optional)
 * @param {string} basePath - Base name for files (without extension)
 * @returns {Object} { certPath, keyPath }
 */
async function saveCertificateToDisk(certPem, keyPem, basePath) {
  const tmpDir = os.tmpdir();
  const uniqueId = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  const certPath = path.join(tmpDir, `${basePath}-${uniqueId}.crt`);
  const keyPath = path.join(tmpDir, `${basePath}-${uniqueId}.key`);

  fs.writeFileSync(certPath, certPem);
  if (keyPem) {
    fs.writeFileSync(keyPath, keyPem);
    tempFiles.push(certPath, keyPath);
  } else {
    tempFiles.push(certPath);
  }

  return { certPath, keyPath };
}

/**
 * Generate mTLS headers for testing
 * @param {Object} cert - Certificate info
 * @param {string} cert.serial - Certificate serial number
 * @param {string} cert.fingerprint - Certificate fingerprint
 * @param {string} cert.machineId - Machine ID
 * @param {string} cert.keyHash - Key hash
 * @returns {Object} Headers object
 */
function generateMTLSHeaders(cert = {}) {
  const {
    serial = "TEST001",
    fingerprint = crypto.createHash("sha256").update("test-cert").digest("hex"),
    machineId = "test-machine",
    keyHash = "abc123",
  } = cert;

  return {
    "x-ssl-verified": "SUCCESS",
    "x-client-cert-serial": serial,
    "x-client-cert-dn": `CN=client:${machineId}:${keyHash}`,
    "x-client-cert-fingerprint": `sha256:${fingerprint}`,
  };
}

/**
 * Compute fingerprint from certificate PEM
 * @param {string} certPem - PEM formatted certificate
 * @returns {string} Hex fingerprint
 */
function computeFingerprint(certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return crypto.createHash("sha256").update(der).digest("hex");
}

/**
 * Clean up test certificate files
 * @param {string[]} paths - Array of file paths to clean up (optional, cleans all if not provided)
 */
function cleanupTestCertificates(paths = null) {
  const filesToClean = paths || tempFiles;

  filesToClean.forEach((p) => {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  // Clear the tempFiles array if we're cleaning everything
  if (!paths) {
    tempFiles.length = 0;
  }
}

module.exports = {
  generateTestKeyPair,
  generateTestCSR,
  generateTestCACertificate,
  signClientCertificate,
  generateTestClientCertificate,
  saveCertificateToDisk,
  generateMTLSHeaders,
  computeFingerprint,
  cleanupTestCertificates,
};
