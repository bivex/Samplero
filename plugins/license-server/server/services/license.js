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

const crypto = require("crypto");

const LICENSE_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TRUST_LEVEL = {
  NONE: 0,
  API_KEY: 1,
  MTLS: 2,
  SIGNED: 3,
  MTLS_SIGNED: 4,
};

const assertValidRequestSignature = ({
  activation,
  payload,
  signature,
  signatureLabel,
}) => {
  if (!signature) {
    return false;
  }

  if (!activation?.client_public_key) {
    throw new Error(`${signatureLabel}_PUBLIC_KEY_MISSING`);
  }

  const cryptoService = strapi.plugin("license-server").service("crypto");
  const valid = cryptoService.verifyRequestSignature(
    payload || {},
    signature,
    activation.client_public_key,
  );

  if (!valid) {
    throw new Error(`INVALID_${signatureLabel}`);
  }

  return true;
};

const assertProofOfPossession = ({
  activation,
  trustLevel,
  signature,
  signatureLabel,
}) => {
  if (trustLevel >= TRUST_LEVEL.MTLS) {
    return;
  }

  if (activation?.client_public_key && !signature) {
    throw new Error(`${signatureLabel}_REQUIRED`);
  }
};

const resolveOfflineState = ({ activation, config, now = new Date() }) => {
  const gracePeriodMs = (config.gracePeriodDays || 7) * 24 * 60 * 60 * 1000;
  const heartbeatIntervalMs =
    (config.heartbeatIntervalHours || 24) * 60 * 60 * 1000;
  const rawLastCheckin = activation?.last_checkin
    ? new Date(activation.last_checkin)
    : new Date(0);
  const lastCheckinTime = Number.isNaN(rawLastCheckin.getTime())
    ? 0
    : rawLastCheckin.getTime();
  const timeSinceCheckin = Math.max(0, now.getTime() - lastCheckinTime);
  const heartbeatValid = timeSinceCheckin <= heartbeatIntervalMs;
  const withinGracePeriod = timeSinceCheckin <= gracePeriodMs;

  let status = "active";

  if (!withinGracePeriod) {
    status = "grace_period_expired";
  } else if (!heartbeatValid) {
    status = "grace_period";
  }

  return {
    status,
    heartbeatValid,
    withinGracePeriod,
    gracePeriodMs,
    heartbeatIntervalMs,
    lastCheckin: new Date(lastCheckinTime),
    timeSinceCheckin,
    gracePeriodRemainingSeconds: withinGracePeriod
      ? Math.max(0, Math.floor((gracePeriodMs - timeSinceCheckin) / 1000))
      : 0,
  };
};

const shouldFlagMtlsDowngrade = ({ activation, trustLevel, config }) => {
  const mtlsEnforced = config?.requireMtls !== false;
  const activationPreviouslyUsedMtls =
    (activation?.last_trust_level || TRUST_LEVEL.NONE) >= TRUST_LEVEL.MTLS;

  return (
    !!activation?.requires_mtls &&
    trustLevel < TRUST_LEVEL.MTLS &&
    (mtlsEnforced || activationPreviouslyUsedMtls)
  );
};

const logFirstActivationSignal = ({
  license,
  activation,
  deviceFingerprint,
  requiresMtls,
  machineId,
}) => {
  const licenseRef = license?.uid || license?.id || "unknown-license";
  const userRef = license?.user?.id || license?.user || "unknown-user";
  const activationRef = activation?.id || "unknown-activation";
  const resolvedMachineId = machineId || deviceFingerprint || "unknown-device";
  const logLevel = requiresMtls ? "info" : "warn";

  strapi.log[logLevel](
    `[Security] First activation observed for license ${licenseRef} activation=${activationRef} user=${userRef} device=${deviceFingerprint} machine=${resolvedMachineId} mtls=${requiresMtls}`,
  );
};

const parseActivationMaterial = ({ csr }) => {
  if (!csr) {
    return {
      decodedCsr: null,
      clientPublicKey: null,
      keyHash: null,
      csrFingerprint: null,
    };
  }

  const decodedCsr = Buffer.from(csr, "base64").toString("utf8");
  const forge = require("node-forge");
  const csrObj = forge.pki.certificationRequestFromPem(decodedCsr);
  const clientPublicKey = forge.pki.publicKeyToPem(csrObj.publicKey);
  const publicKeyDer = forge.asn1
    .toDer(forge.pki.publicKeyToAsn1(csrObj.publicKey))
    .getBytes();

  return {
    decodedCsr,
    clientPublicKey,
    keyHash: crypto
      .createHash("sha256")
      .update(publicKeyDer)
      .digest("hex")
      .substring(0, 16),
    csrFingerprint: crypto.createHash("sha256").update(decodedCsr).digest("hex"),
  };
};

const buildPendingFirstActivationResponse = (claim) => ({
  status: "pending_confirmation",
  claim_id: claim.id,
  expires_at: claim.expires_at,
  next_step: "approve_in_account",
});

const isMatchingFirstActivationClaim = ({
  claim,
  deviceFingerprint,
  keyHash,
  csrFingerprint,
}) =>
  claim?.device_fingerprint === deviceFingerprint &&
  (claim?.key_hash || null) === (keyHash || null) &&
  (claim?.csr_fingerprint || null) === (csrFingerprint || null);

const buildApprovedActivationResponse = ({
  activation,
  certificate,
  serialNumber,
  requiresMtls,
}) => {
  const config = strapi.config.get("plugin::license-server");
  const ttl = 86400;
  const gracePeriod = (config.gracePeriodDays || 7) * 24 * 60 * 60;

  return {
    status: "approved",
    certificate: certificate?.certificate || null,
    ca_certificate: certificate?.caCertificate || null,
    serial: certificate?.serial || serialNumber,
    fingerprint: certificate?.fingerprint || null,
    mtls_endpoint: requiresMtls ? config.mtlsEndpoint || "https://api" : null,
    ttl,
    grace_period: gracePeriod,
    activation_id: activation.id,
    next_steps: requiresMtls
      ? [
          "1. Store private key in TPM/Keychain/DPAPI",
          "2. Use this cert for all future API requests (mTLS)",
          "3. Sign request payloads with your private key (Level 3)",
        ]
      : undefined,
  };
};

const persistIssuedCertificateRecord = async ({
  hydratedLicense,
  machineId,
  certificate,
}) => {
  if (!hydratedLicense?.id || !certificate?.certificate || !certificate?.serial) {
    return null;
  }

  const cryptoService = strapi.plugin("license-server").service("crypto");
  const metadata = typeof cryptoService.readCertificateMetadata === "function"
    ? cryptoService.readCertificateMetadata(certificate.certificate)
    : {
        serial: certificate.serial || null,
        fingerprint: certificate.fingerprint || null,
        subjectCN: certificate.subjectCN || null,
        notBefore: null,
        notAfter: null,
      };
  const certificateQuery = strapi.db.query("plugin::license-server.client-certificate");
  const serial = metadata.serial || certificate.serial;
  const data = {
    license: hydratedLicense.id,
    certificate_serial: serial,
    fingerprint_sha256: metadata.fingerprint || certificate.fingerprint || null,
    subject_cn: metadata.subjectCN || certificate.subjectCN || null,
    machine_id: machineId || null,
    not_before: metadata.notBefore,
    not_after: metadata.notAfter,
    status: "active",
    revoked_at: null,
    revocation_reason: null,
    certificate_pem: certificate.certificate,
    ca_certificate_pem: certificate.caCertificate || null,
  };
  const existing = typeof certificateQuery.findOne === "function"
    ? await certificateQuery.findOne({
        where: { certificate_serial: serial },
      })
    : null;

  if (existing?.id) {
    return certificateQuery.update({
      where: { id: existing.id },
      data,
    });
  }

  return typeof certificateQuery.create === "function"
    ? certificateQuery.create({ data })
    : null;
};

const buildBootstrapCertificateResponse = ({ activation, certificateRecord }) => {
  const config = strapi.config.get("plugin::license-server", {});

  if (activation?.revoked_at) {
    throw new Error("ACTIVATION_REVOKED");
  }

  if (!activation?.requires_mtls) {
    return {
      status: "mtls_not_required",
      activation_id: activation?.id || null,
      requires_mtls: false,
    };
  }

  if (!activation?.certificate_serial || !certificateRecord?.certificate_pem) {
    return {
      status: "pending_certificate",
      activation_id: activation?.id || null,
      requires_mtls: true,
      serial: activation?.certificate_serial || null,
    };
  }

  return {
    status: "approved",
    activation_id: activation.id,
    requires_mtls: true,
    certificate: certificateRecord.certificate_pem,
    ca_certificate: certificateRecord.ca_certificate_pem || null,
    serial: certificateRecord.certificate_serial || activation.certificate_serial,
    fingerprint: certificateRecord.fingerprint_sha256 || null,
    mtls_endpoint: config.mtlsEndpoint || null,
  };
};

const createActivationRecord = async ({
  hydratedLicense,
  activeActivations,
  deviceFingerprint,
  pluginVersion,
  platform,
  machineId,
  activationMaterial,
}) => {
  const config = strapi.config.get("plugin::license-server", {});
  const cryptoService = strapi.plugin("license-server").service("crypto");
  const mtlsEnforced = config.requireMtls !== false;
  let serialNumber = null;
  let certificate = null;
  let requiresMtls = false;

  if (activationMaterial.decodedCsr && mtlsEnforced) {
    serialNumber = cryptoService.generateSerialNumber();
    const certResult = await cryptoService.signCSR(
      activationMaterial.decodedCsr,
      serialNumber,
      machineId || deviceFingerprint,
      activationMaterial.keyHash,
    );
    const issuedSerial =
      certResult?.serial ||
      cryptoService.extractCertificateSerial(certResult?.certificate) ||
      serialNumber;
    certResult.serial = issuedSerial;
    certificate = certResult;
    requiresMtls = true;
  }

  const activation = await strapi.db
    .query("plugin::license-server.activation")
    .create({
      data: {
        license_id: hydratedLicense.id,
        device_fingerprint: deviceFingerprint,
        client_public_key: activationMaterial.clientPublicKey,
        certificate_serial: certificate?.serial || serialNumber || null,
        plugin_version: pluginVersion,
        platform,
        last_checkin: new Date(),
        requires_mtls: requiresMtls,
      },
    });

  if (certificate?.certificate && certificate?.serial) {
    await persistIssuedCertificateRecord({
      hydratedLicense,
      machineId: machineId || deviceFingerprint,
      certificate,
    });
  }

  if (activeActivations.length === 0) {
    logFirstActivationSignal({
      license: hydratedLicense,
      activation,
      deviceFingerprint,
      requiresMtls,
      machineId: machineId || deviceFingerprint,
    });
  }

  return buildApprovedActivationResponse({
    activation,
    certificate,
    serialNumber,
    requiresMtls,
  });
};

async function attachActivationsToLicenses(licenses) {
  if (!Array.isArray(licenses) || licenses.length === 0) {
    return Array.isArray(licenses) ? licenses : [];
  }

  const licenseIds = [
    ...new Set(licenses.map((license) => license?.id).filter(Boolean)),
  ];

  if (licenseIds.length === 0) {
    return licenses.map((license) => ({
      ...license,
      activations: license.activations || [],
    }));
  }

  const activationQuery = strapi.db.query("plugin::license-server.activation");

  if (typeof activationQuery.findMany !== "function") {
    return licenses.map((license) => ({
      ...license,
      activations: license.activations || [],
    }));
  }

  const activations = await activationQuery.findMany({
    where: { license_id: { $in: licenseIds } },
  });

  const activationsByLicenseId = new Map(licenseIds.map((id) => [id, []]));

  for (const activation of activations) {
    if (!activationsByLicenseId.has(activation.license_id)) {
      activationsByLicenseId.set(activation.license_id, []);
    }

    activationsByLicenseId.get(activation.license_id).push(activation);
  }

  return licenses.map((license) => ({
    ...license,
    activations: activationsByLicenseId.get(license.id) || license.activations || [],
  }));
}

async function attachLicensesToActivations(activations) {
  if (!Array.isArray(activations) || activations.length === 0) {
    return Array.isArray(activations) ? activations : [];
  }

  const licenseIds = [
    ...new Set(
      activations
        .map((activation) => activation?.license_id || activation?.license?.id)
        .filter(Boolean),
    ),
  ];

  if (licenseIds.length === 0) {
    return activations.map((activation) => ({
      ...activation,
      license: activation.license || null,
    }));
  }

  const licenseQuery = strapi.db.query("plugin::license-server.license");

  if (typeof licenseQuery.findMany !== "function") {
    return activations.map((activation) => ({
      ...activation,
      license: activation.license || null,
    }));
  }

  const licenses = await licenseQuery.findMany({
    where: { id: { $in: licenseIds } },
    populate: ["user", "product"],
  });

  const licensesById = new Map(licenses.map((license) => [license.id, license]));

  return activations.map((activation) => ({
    ...activation,
    license:
      licensesById.get(activation.license_id || activation.license?.id) ||
      activation.license ||
      null,
  }));
}

async function attachActivationsToLicense(license) {
  if (!license) {
    return license;
  }

  const [hydratedLicense] = await attachActivationsToLicenses([license]);
  return hydratedLicense;
}

async function attachLicenseToActivation(activation) {
  if (!activation) {
    return activation;
  }

  const [hydratedActivation] = await attachLicensesToActivations([activation]);
  return hydratedActivation;
}

async function revokeActivationRecord(activation) {
  const revokedAt = new Date();

  await strapi.db.query("plugin::license-server.activation").update({
    where: { id: activation.id },
    data: { revoked_at: revokedAt },
  });

  if (activation.certificate_serial) {
    await strapi.db
      .query("plugin::license-server.client-certificate")
      .update({
        where: { certificate_serial: activation.certificate_serial },
        data: { status: "revoked", revoked_at: revokedAt },
      })
      .catch(() => {});
  }

  return revokedAt;
}

async function countActiveActivationsForLicense(licenseId) {
  return strapi.db.query("plugin::license-server.activation").count({
    where: {
      license_id: licenseId,
      revoked_at: null,
    },
  });
}

module.exports = {
  TRUST_LEVEL,

  generateLicenseKey(product = null) {
    const prefix =
      product?.type === "plugin"
        ? "VST"
        : product?.type === "sample_pack"
          ? "DIG"
          : "LIC";

    const body = Array.from(crypto.randomBytes(20), (byte) => {
      return LICENSE_KEY_ALPHABET[byte % LICENSE_KEY_ALPHABET.length];
    }).join("");

    const groups = body.match(/.{1,5}/g) || [body];
    return [prefix, ...groups].join("-");
  },

  maskLicenseKey(licenseKey) {
    if (!licenseKey) {
      return null;
    }

    const parts = String(licenseKey).split("-");

    if (parts.length <= 2) {
      return `${parts[0] || "LIC"}-*****`;
    }

    return [parts[0], ...parts.slice(1, -1).map(() => "*****"), parts.at(-1)].join(
      "-",
    );
  },

  async hydrateLicenses(licenses) {
    return attachActivationsToLicenses(licenses);
  },

  async hydrateLicense(license) {
    return attachActivationsToLicense(license);
  },

  async hydrateActivations(activations) {
    return attachLicensesToActivations(activations);
  },

  async hydrateActivation(activation) {
    return attachLicenseToActivation(activation);
  },

  async activateLicense({
    licenseKey,
    deviceFingerprint,
    pluginVersion,
    platform,
    csr,
    machineId,
    requestIp,
    requestSignature,
  }) {
    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { uid: licenseKey },
        populate: ["user", "product"],
      });

    const hydratedLicense = await attachActivationsToLicense(license);

    if (!hydratedLicense) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    if (hydratedLicense.status !== "active") {
      throw new Error(`LICENSE_${hydratedLicense.status.toUpperCase()}`);
    }

    if (
      hydratedLicense.expires_at &&
      new Date(hydratedLicense.expires_at) < new Date()
    ) {
      throw new Error("LICENSE_EXPIRED");
    }

    const activeActivations = (hydratedLicense.activations || []).filter(
      (activation) => !activation.revoked_at,
    );

    const existingActivation = activeActivations.find(
      (activation) => activation.device_fingerprint === deviceFingerprint,
    );

    if (existingActivation) {
      throw new Error("DEVICE_ALREADY_ACTIVATED");
    }

    if (activeActivations.length >= hydratedLicense.activation_limit) {
      throw new Error("ACTIVATION_LIMIT_EXCEEDED");
    }

    if (activeActivations.length === 0) {
      const config = strapi.config.get("plugin::license-server", {});
      const mockAutoApproveFirstActivation = Boolean(
        config.mockAutoApproveFirstActivation,
      );
      const activationMaterial = parseActivationMaterial({ csr });
      const claimService = strapi.plugin("license-server").service("activation-claim");
      const openClaim = await claimService.findOpenClaimForLicense(hydratedLicense.id);

      if (openClaim) {
        if (
          isMatchingFirstActivationClaim({
            claim: openClaim,
            deviceFingerprint,
            keyHash: activationMaterial.keyHash,
            csrFingerprint: activationMaterial.csrFingerprint,
          })
        ) {
          if (mockAutoApproveFirstActivation) {
            strapi.log.warn(
              `[Mock] Auto-approving existing first activation claim for license ${hydratedLicense.uid || hydratedLicense.id} claim=${openClaim.id} device=${deviceFingerprint}`,
            );
            return await claimService.approveClaimAsAdmin({
              claimId: openClaim.id,
              actorUserId: null,
            });
          }

          return buildPendingFirstActivationResponse(openClaim);
        }

        await claimService.incrementCompetingAttempt(openClaim);
        strapi.log.warn(
          `[Security] Competing first activation claim rejected for license ${hydratedLicense.uid || hydratedLicense.id} device=${deviceFingerprint}`,
        );
        throw new Error("FIRST_ACTIVATION_PENDING_CONFIRMATION");
      }

      const risk = claimService.computeFirstActivationRisk({
        hasOwnerSession: false,
        competingClaim: false,
      });

      if (risk.decision === "reject") {
        throw new Error("FIRST_ACTIVATION_REJECTED");
      }

      const claim = await claimService.createPendingClaim({
        license: hydratedLicense,
        deviceFingerprint,
        keyHash: activationMaterial.keyHash,
        csrFingerprint: activationMaterial.csrFingerprint,
        pluginVersion,
        platform,
        csr,
        machineId,
        requestIp,
        riskScore: risk.score,
        riskReasons: risk.reasons,
      });

      strapi.log.warn(
        `[Security] First activation claim created for license ${hydratedLicense.uid || hydratedLicense.id} claim=${claim.id} device=${deviceFingerprint}`,
      );

      if (mockAutoApproveFirstActivation) {
        strapi.log.warn(
          `[Mock] Auto-approving first activation claim for license ${hydratedLicense.uid || hydratedLicense.id} claim=${claim.id} device=${deviceFingerprint}`,
        );
        return await claimService.approveClaimAsAdmin({
          claimId: claim.id,
          actorUserId: null,
        });
      }

      return buildPendingFirstActivationResponse(claim);
    }

    const activationMaterial = parseActivationMaterial({ csr });
    return await createActivationRecord({
      hydratedLicense,
      activeActivations,
      deviceFingerprint,
      pluginVersion,
      platform,
      machineId,
      activationMaterial,
    });
  },

  async finalizeFirstActivationClaim({ claim }) {
    const licenseId = claim?.license?.id || claim?.license;
    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { id: licenseId },
        populate: ["user", "product"],
      });

    const hydratedLicense = await attachActivationsToLicense(license);

    if (!hydratedLicense) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    if (hydratedLicense.status !== "active") {
      throw new Error(`LICENSE_${hydratedLicense.status.toUpperCase()}`);
    }

    if (
      hydratedLicense.expires_at &&
      new Date(hydratedLicense.expires_at) < new Date()
    ) {
      throw new Error("LICENSE_EXPIRED");
    }

    const activeActivations = (hydratedLicense.activations || []).filter(
      (activation) => !activation.revoked_at,
    );

    if (activeActivations.length > 0) {
      throw new Error("FIRST_ACTIVATION_ALREADY_COMPLETED");
    }

    const activationMaterial = parseActivationMaterial({ csr: claim.csr });

    if (
      (claim.key_hash || null) !== (activationMaterial.keyHash || null) ||
      (claim.csr_fingerprint || null) !== (activationMaterial.csrFingerprint || null)
    ) {
      throw new Error("CLAIM_PROOF_MISMATCH");
    }

    return await createActivationRecord({
      hydratedLicense,
      activeActivations,
      deviceFingerprint: claim.device_fingerprint,
      pluginVersion: claim.plugin_version,
      platform: claim.platform,
      machineId: claim.machine_id,
      activationMaterial,
    });
  },

  async validateLicense(activation, options = {}) {
    const {
      trustLevel: clientTrustLevel = 0,
      requestSignature,
      requestPayload,
    } = options;

    // Check if activation is revoked
    if (activation.revoked_at) {
      return {
        valid: false,
        license_status: "revoked",
        reason: "Activation has been revoked",
        trust_level: TRUST_LEVEL.NONE,
        downgrade_detected: false,
      };
    }

    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { id: activation.license_id || activation.license?.id },
      });

    if (!license) {
      return {
        valid: false,
        license_status: "not_found",
        reason: "License not found",
        trust_level: TRUST_LEVEL.NONE,
        downgrade_detected: false,
      };
    }

    if (license.status !== "active") {
      return {
        valid: false,
        license_status: license.status,
        reason: `License is ${license.status}`,
        trust_level: TRUST_LEVEL.NONE,
        downgrade_detected: false,
      };
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await strapi.db.query("plugin::license-server.license").update({
        where: { id: license.id },
        data: { status: "expired" },
      });

      return {
        valid: false,
        license_status: "expired",
        reason: "License has expired",
        trust_level: TRUST_LEVEL.NONE,
        downgrade_detected: false,
      };
    }

    const config = strapi.config.get("plugin::license-server");
    const now = new Date();
    const offlineState = resolveOfflineState({ activation, config, now });

    const expiresIn = license.expires_at
      ? Math.floor((new Date(license.expires_at) - now) / 1000)
      : null;

    assertProofOfPossession({
      activation,
      trustLevel: clientTrustLevel,
      signature: requestSignature,
      signatureLabel: "REQUEST_SIGNATURE",
    });

    const hasSignature = assertValidRequestSignature({
      activation,
      payload: requestPayload,
      signature: requestSignature,
      signatureLabel: "REQUEST_SIGNATURE",
    });
    const effectiveTrustLevel =
      hasSignature && clientTrustLevel >= TRUST_LEVEL.MTLS
        ? TRUST_LEVEL.MTLS_SIGNED
        : hasSignature
          ? TRUST_LEVEL.SIGNED
          : clientTrustLevel;

    const downgradeDetected = shouldFlagMtlsDowngrade({
      activation,
      trustLevel: clientTrustLevel,
      config,
    });

    const response = {
      valid: offlineState.status !== "grace_period_expired",
      license_status: "active",
      status: offlineState.status,
      expires_in: expiresIn,
      grace_period_remaining: offlineState.gracePeriodRemainingSeconds,
      heartbeat_valid: offlineState.heartbeatValid,
      trust_level: effectiveTrustLevel,
      downgrade_detected: downgradeDetected,
    };

    if (downgradeDetected) {
      strapi.log.warn(
        `[Security] mTLS Downgrade detected for activation ${activation.id}`,
      );
      response.security_alert =
        "mTLS Downgrade detected - possible MitM attack";
    }

    if (offlineState.status === "grace_period") {
      response.action = "heartbeat_required";
      response.message = "Heartbeat overdue - refresh activation while online";
    }

    if (offlineState.status === "grace_period_expired") {
      response.action = "heartbeat_required";
      response.message = "Grace period expired - heartbeat required to recover activation";
    }

    return response;
  },

  async heartbeat(activation, options = {}) {
    const {
      trustLevel: clientTrustLevel = 0,
      payloadSignature,
      requestPayload,
    } = options;

    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { id: activation.license_id || activation.license?.id },
      });

    if (!license || license.status !== "active") {
      return {
        valid: false,
        status: license?.status || "not_found",
        trust_level: TRUST_LEVEL.NONE,
      };
    }

    const config = strapi.config.get("plugin::license-server");
    const offlineState = resolveOfflineState({ activation, config });

    assertProofOfPossession({
      activation,
      trustLevel: clientTrustLevel,
      signature: payloadSignature,
      signatureLabel: "PAYLOAD_SIGNATURE",
    });

    const hasSignature = assertValidRequestSignature({
      activation,
      payload: requestPayload,
      signature: payloadSignature,
      signatureLabel: "PAYLOAD_SIGNATURE",
    });
    const effectiveTrustLevel =
      hasSignature && clientTrustLevel >= TRUST_LEVEL.MTLS
        ? TRUST_LEVEL.MTLS_SIGNED
        : hasSignature
          ? TRUST_LEVEL.SIGNED
          : clientTrustLevel;

    const downgradeDetected = shouldFlagMtlsDowngrade({
      activation,
      trustLevel: clientTrustLevel,
      config,
    });

    const response = {
      valid: true,
      status: "active",
      previous_status:
        offlineState.status !== "active" ? offlineState.status : undefined,
      recovered: offlineState.status !== "active",
      heartbeat_valid: true,
      trust_level: effectiveTrustLevel,
      downgrade_detected: downgradeDetected,
      grace_period_remaining: Math.floor(offlineState.gracePeriodMs / 1000),
    };

    if (downgradeDetected) {
      strapi.log.warn(
        `[Security] mTLS Downgrade detected for activation ${activation.id}`,
      );
      response.security_alert = "mTLS Downgrade detected";
      response.kill = false;
    }

    if (offlineState.status === "grace_period") {
      response.message = "Heartbeat refreshed before grace period expiry";
    }

    if (offlineState.status === "grace_period_expired") {
      response.message =
        "Heartbeat accepted and activation recovered after grace period expiry";
    }

    await strapi.db.query("plugin::license-server.activation").update({
      where: { id: activation.id },
      data: { last_checkin: new Date() },
    });

    return response;
  },

  async bootstrapActivationCertificate(activation, options = {}) {
    const payloadSignature = options.payloadSignature;
    const requestPayload = options.requestPayload || {};

    assertProofOfPossession({
      activation,
      trustLevel: TRUST_LEVEL.NONE,
      signature: payloadSignature,
      signatureLabel: "PAYLOAD_SIGNATURE",
    });

    assertValidRequestSignature({
      activation,
      payload: requestPayload,
      signature: payloadSignature,
      signatureLabel: "PAYLOAD_SIGNATURE",
    });

    const certificateRecord = activation?.certificate_serial
      ? await strapi.db.query("plugin::license-server.client-certificate").findOne({
          where: { certificate_serial: activation.certificate_serial },
        })
      : null;

    return buildBootstrapCertificateResponse({
      activation,
      certificateRecord,
    });
  },

  async deactivateLicense({ licenseKey, deviceFingerprint }) {
    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { uid: licenseKey },
      });

    if (!license) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    // Find activation by license_id and device_fingerprint
    const activation = await strapi.db
      .query("plugin::license-server.activation")
      .findOne({
        where: {
          license_id: license.id,
          device_fingerprint: deviceFingerprint,
          revoked_at: null,
        },
      });

    if (!activation) {
      throw new Error("ACTIVATION_NOT_FOUND");
    }

    await revokeActivationRecord(activation);

    // Count remaining activations
    const remainingActivations = await countActiveActivationsForLicense(license.id);

    return {
      status: "deactivated",
      activations_remaining: remainingActivations,
    };
  },

  async revokeOwnedActivation({ ownerUserId, licenseId, activationId }) {
    const license = await strapi.db.query("plugin::license-server.license").findOne({
      where: { id: licenseId, user: ownerUserId },
    });

    if (!license) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    const activation = await strapi.db.query("plugin::license-server.activation").findOne({
      where: { id: activationId, license_id: license.id },
    });

    if (!activation) {
      throw new Error("ACTIVATION_NOT_FOUND");
    }

    const revokedAt = activation.revoked_at || (await revokeActivationRecord(activation));
    const remainingActivations = await countActiveActivationsForLicense(license.id);

    return {
      status: activation.revoked_at ? "already_revoked" : "revoked",
      license_id: license.id,
      activation_id: activation.id,
      activations_remaining: remainingActivations,
      revoked_at: revokedAt,
    };
  },

  async revokeLicense(licenseId) {
    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { id: licenseId },
        populate: ["user", "product"],
      });

    const hydratedLicense = await attachActivationsToLicense(license);

    if (!hydratedLicense) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    await strapi.db.query("plugin::license-server.license").update({
      where: { id: licenseId },
      data: {
        status: "revoked",
        revoked_at: new Date(),
      },
    });

    for (const activation of hydratedLicense.activations || []) {
      await strapi.db.query("plugin::license-server.activation").update({
        where: { id: activation.id },
        data: { revoked_at: new Date() },
      });

      if (activation.certificate_serial) {
        await strapi.db
          .query("plugin::license-server.client-certificate")
          .update({
            where: { certificate_serial: activation.certificate_serial },
            data: { status: "revoked", revoked_at: new Date() },
          })
          .catch(() => {});
      }
    }

    return { success: true };
  },

  async activateLicenseById(licenseId) {
    const license = await strapi.db
      .query("plugin::license-server.license")
      .update({
        where: { id: licenseId },
        data: {
          status: "active",
          revoked_at: null,
          revocation_reason: null,
        },
        populate: ["user", "product"],
      });

    if (!license) {
      throw new Error("LICENSE_NOT_FOUND");
    }

    return await attachActivationsToLicense(license);
  },

  async revokeClientCertificate(serialNumber) {
    const certRecord = await strapi.db
      .query("plugin::license-server.client-certificate")
      .findOne({
        where: { certificate_serial: serialNumber },
      });

    if (!certRecord) {
      throw new Error("CERTIFICATE_NOT_FOUND");
    }

    await strapi.db.query("plugin::license-server.client-certificate").update({
      where: { id: certRecord.id },
      data: { status: "revoked", revoked_at: new Date() },
    });

    await strapi.db.query("plugin::license-server.activation").update({
      where: { certificate_serial: serialNumber },
      data: { revoked_at: new Date() },
    });

    strapi.log.info(`[License] Client certificate revoked: ${serialNumber}`);

    return { success: true, serial: serialNumber };
  },

  async getLicenseStatus(licenseKey) {
    const license = await strapi.db
      .query("plugin::license-server.license")
      .findOne({
        where: { uid: licenseKey },
        populate: ["user", "product"],
      });

    const hydratedLicense = await attachActivationsToLicense(license);

    if (!hydratedLicense) {
      return null;
    }

    return {
      uid: hydratedLicense.uid,
      status: hydratedLicense.status,
      activation_limit: hydratedLicense.activation_limit,
      activations_count:
        hydratedLicense.activations?.filter((a) => !a.revoked_at).length || 0,
      issued_at: hydratedLicense.issued_at,
      expires_at: hydratedLicense.expires_at,
    };
  },
};
