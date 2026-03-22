const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Policy error and security branches", () => {
  const makeCtx = () => ({ state: {}, request: { headers: {}, ip: "127.0.0.1", path: "/test" }, throw: jest.fn((status, message) => ({ status, message })), forbidden: jest.fn(() => "forbidden"), badRequest: jest.fn(() => "badRequest"), conflict: jest.fn(() => "conflict"), tooManyRequests: jest.fn(() => "tooManyRequests") });

  const makeStrapi = ({ cryptoService, redisService, activation, pluginConfig } = {}) => ({
    config: {
      get: jest.fn((path, defaultValue) => {
        if (path === "plugin::license-server") {
          return pluginConfig || {};
        }
        return defaultValue;
      }),
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    db: { query: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(activation ?? null), update: jest.fn().mockResolvedValue({}) })) },
    plugin: jest.fn((name) => {
      if (name === "license-server") return { service: jest.fn(() => cryptoService || {}) };
      if (name === "redis") return redisService ? { service: jest.fn(() => redisService) } : null;
      return null;
    }),
  });

  it("verify-mtls forbids revoked certificates", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    ctx.request.headers = { "x-ssl-verified": "SUCCESS", "x-client-cert-serial": "SER-1", "x-client-cert-fingerprint": "sha256:abc" };
    const strapi = makeStrapi({ cryptoService: { checkRevocation: jest.fn().mockResolvedValue({ revoked: true, reason: "compromised" }) } });
    const result = await verifyMtls(ctx, {}, { strapi });
    expect(result).toBe("forbidden");
    expect(ctx.forbidden).toHaveBeenCalledWith("Certificate compromised");
  });

  it("verify-mtls forbids when activation is missing, revoked, or license invalid", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const baseHeaders = { "x-ssl-verified": "SUCCESS", "x-client-cert-serial": "SER-1", "x-client-cert-fingerprint": "sha256:abc" };
    const cases = [
      { activation: null, message: "Activation not found" },
      { activation: { id: 1, revoked_at: new Date(), license: { status: "active", revoked_at: null } }, message: "Activation revoked" },
      { activation: { id: 1, revoked_at: null, license: { status: "revoked", revoked_at: new Date() } }, message: "License invalid" },
    ];

    for (const item of cases) {
      const ctx = makeCtx();
      ctx.request.headers = baseHeaders;
      const strapi = makeStrapi({ activation: item.activation, cryptoService: { checkRevocation: jest.fn().mockResolvedValue({ revoked: false }) } });
      const result = await verifyMtls(ctx, {}, { strapi });
      expect(result).toBe("forbidden");
      expect(ctx.forbidden).toHaveBeenCalledWith(item.message);
    }
  });

  it("verify-mtls loads license by license_id when activation has no populated relation", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    ctx.request.headers = {
      "x-ssl-verified": "SUCCESS",
      "x-client-cert-serial": "SER-2",
      "x-client-cert-fingerprint": "sha256:def",
    };

    const activationQuery = {
      findOne: jest.fn().mockResolvedValue({
        id: 2,
        license_id: 11,
        revoked_at: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const licenseQuery = {
      findOne: jest.fn().mockResolvedValue({
        id: 11,
        status: "active",
        revoked_at: null,
        user: { id: 7, email: "e2e@example.com" },
      }),
    };
    const strapi = makeStrapi({
      cryptoService: { checkRevocation: jest.fn().mockResolvedValue({ revoked: false }) },
    });
    strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.activation") return activationQuery;
      if (uid === "plugin::license-server.license") return licenseQuery;
      return { findOne: jest.fn(), update: jest.fn() };
    });

    const result = await verifyMtls(ctx, {}, { strapi });

    expect(result).toBe(true);
    expect(licenseQuery.findOne).toHaveBeenCalledWith({
      where: { id: 11 },
      populate: ["user"],
    });
    expect(ctx.state.licenseActivation).toEqual(
      expect.objectContaining({
        id: 2,
        license: expect.objectContaining({ id: 11, status: "active" }),
      }),
    );
    expect(ctx.state.user).toEqual({ id: 7, email: "e2e@example.com" });
  });

  it("verify-mtls derives serial from raw client cert when proxy serial format is incompatible", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    delete ctx.forbidden;
    ctx.request.headers = {
      "x-ssl-verified": "SUCCESS",
      "x-client-cert-serial": "-NEGATIVE-OPENSSL-SERIAL",
      "x-client-cert": encodeURIComponent("-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n"),
    };

    const activationQuery = {
      findOne: jest.fn().mockResolvedValue({ id: 3, license_id: 22, revoked_at: null }),
      update: jest.fn().mockResolvedValue({}),
    };
    const strapi = makeStrapi({
      cryptoService: {
        extractCertificateSerial: jest.fn().mockReturnValue("REAL-SERIAL"),
        computeFingerprint: jest.fn().mockReturnValue("sha256:xyz"),
        checkRevocation: jest.fn().mockResolvedValue({ revoked: false }),
      },
    });
    strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.activation") return activationQuery;
      if (uid === "plugin::license-server.license") {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 22,
            status: "active",
            revoked_at: null,
            user: null,
          }),
        };
      }
      return { findOne: jest.fn(), update: jest.fn() };
    });

    const result = await verifyMtls(ctx, {}, { strapi });

    expect(result).toBe(true);
    expect(activationQuery.findOne).toHaveBeenCalledWith({
      where: { certificate_serial: "REAL-SERIAL" },
    });
  });

  it("verify-mtls normalizes leading-zero proxy serials before activation lookup", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    delete ctx.forbidden;
    ctx.request.headers = {
      "x-ssl-verified": "SUCCESS",
      "x-client-cert-serial": "008D5C397A7D5CAC9200C05ED2363BF915",
      "x-client-cert-fingerprint": "sha256:leading-zero",
    };

    const activationQuery = {
      findOne: jest.fn().mockResolvedValue({ id: 9, license_id: 11, revoked_at: null }),
      update: jest.fn().mockResolvedValue({}),
    };
    const strapi = makeStrapi({
      cryptoService: {
        normalizeCertificateSerial: jest.fn((serial) => serial.replace(/^00+/, "")),
        checkRevocation: jest.fn().mockResolvedValue({ revoked: false }),
      },
    });
    strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.activation") return activationQuery;
      if (uid === "plugin::license-server.license") {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 11,
            status: "active",
            revoked_at: null,
            user: null,
          }),
        };
      }
      return { findOne: jest.fn(), update: jest.fn() };
    });

    const result = await verifyMtls(ctx, {}, { strapi });

    expect(result).toBe(true);
    expect(activationQuery.findOne).toHaveBeenCalledWith({
      where: { certificate_serial: "8D5C397A7D5CAC9200C05ED2363BF915" },
    });
  });

  it("verify-mtls prefers normalized raw-cert serial over proxy header serial when both are present", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    delete ctx.forbidden;
    ctx.request.headers = {
      "x-ssl-verified": "SUCCESS",
      "x-client-cert-serial": "00PROXY-SERIAL",
      "x-client-cert": encodeURIComponent("-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n"),
      "x-client-cert-fingerprint": "sha256:raw-overrides-proxy",
    };

    const activationQuery = {
      findOne: jest.fn().mockResolvedValue({ id: 10, license_id: 15, revoked_at: null }),
      update: jest.fn().mockResolvedValue({}),
    };
    const cryptoService = {
      extractCertificateSerial: jest.fn().mockReturnValue("00ABCD1234"),
      normalizeCertificateSerial: jest.fn((serial) => serial.replace(/^00+/, "")),
      computeFingerprint: jest.fn().mockReturnValue("sha256:raw-overrides-proxy"),
      checkRevocation: jest.fn().mockResolvedValue({ revoked: false }),
    };
    const strapi = makeStrapi({ cryptoService });
    strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.activation") return activationQuery;
      if (uid === "plugin::license-server.license") {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 15,
            status: "active",
            revoked_at: null,
            user: null,
          }),
        };
      }
      return { findOne: jest.fn(), update: jest.fn() };
    });

    const result = await verifyMtls(ctx, {}, { strapi });

    expect(result).toBe(true);
    expect(activationQuery.findOne).toHaveBeenCalledWith({
      where: { certificate_serial: "ABCD1234" },
    });
    expect(cryptoService.normalizeCertificateSerial).toHaveBeenCalledWith("00ABCD1234");
  });

  it("verify-mtls enforces global requireMtls without headers", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    const strapi = makeStrapi({ pluginConfig: { requireMtls: true } });
    const result = await verifyMtls(ctx, {}, { strapi });
    expect(result).toBe("forbidden");
    expect(ctx.forbidden).toHaveBeenCalledWith("mTLS authentication required");
  });

  it("verify-mtls rejects spoofed mTLS headers when proxy auth is missing", async () => {
    const verifyMtls = freshRequire("../../server/policies/verify-mtls");
    const ctx = makeCtx();
    ctx.request.headers = {
      "x-ssl-verified": "SUCCESS",
      "x-client-cert-serial": "SER-1",
      "x-client-cert-fingerprint": "sha256:abc",
    };
    const strapi = makeStrapi({ pluginConfig: { proxySharedSecret: "proxy-secret" } });

    const result = await verifyMtls(ctx, {}, { strapi });

    expect(result).toBe("forbidden");
    expect(ctx.forbidden).toHaveBeenCalledWith("Trusted proxy authentication required");
  });

  it("verify-nonce blocks replayed nonces and tolerates storage failures", async () => {
    const verifyNonce = freshRequire("../../server/policies/verify-nonce");

    const replayCtx = makeCtx();
    replayCtx.request.headers = { "x-request-nonce": "nonce-1" };
    const replayStrapi = makeStrapi({ cryptoService: { verifyNonce: jest.fn().mockResolvedValue(true), setNonce: jest.fn() } });
    const replayResult = await verifyNonce(replayCtx, {}, { strapi: replayStrapi });
    expect(replayResult).toEqual({ status: 409, message: "Nonce already used" });
    expect(replayCtx.throw).toHaveBeenCalledWith(409, "Nonce already used");

    const errorCtx = makeCtx();
    errorCtx.request.headers = { "x-request-nonce": "nonce-2" };
    const errorStrapi = makeStrapi({ cryptoService: { verifyNonce: jest.fn().mockRejectedValue(new Error("redis down")), setNonce: jest.fn() } });
    const errorResult = await verifyNonce(errorCtx, {}, { strapi: errorStrapi });
    expect(errorResult).toBe(true);
    expect(errorStrapi.log.warn).toHaveBeenCalledWith("[Security] Redis not available, skipping nonce check");
  });

  it("verify-freshness blocks stale timestamps, replayed nonces, and missing stores", async () => {
    const verifyFreshness = freshRequire("../../server/policies/verify-freshness");

    const staleCtx = makeCtx();
    staleCtx.serviceUnavailable = jest.fn(() => "serviceUnavailable");
    staleCtx.request.path = "/api/license/validate";
    staleCtx.request.headers = {
      "x-request-nonce": "nonce-stale",
      "x-request-timestamp": new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const staleStrapi = makeStrapi({ cryptoService: { reserveNonce: jest.fn() } });
    const staleResult = await verifyFreshness(staleCtx, {}, { strapi: staleStrapi });
    expect(staleResult).toEqual({ status: 400, message: "x-request-timestamp is outside the allowed freshness window" });
    expect(staleCtx.throw).toHaveBeenCalledWith(
      400,
      "x-request-timestamp is outside the allowed freshness window",
    );

    const replayCtx = makeCtx();
    replayCtx.serviceUnavailable = jest.fn(() => "serviceUnavailable");
    replayCtx.request.path = "/api/license/validate";
    replayCtx.request.headers = {
      "x-request-nonce": "nonce-replay",
      "x-request-timestamp": new Date().toISOString(),
    };
    const replayStrapi = makeStrapi({ cryptoService: { reserveNonce: jest.fn().mockResolvedValue(false) } });
    const replayResult = await verifyFreshness(replayCtx, {}, { strapi: replayStrapi });
    expect(replayResult).toEqual({ status: 409, message: "Nonce already used" });
    expect(replayCtx.throw).toHaveBeenCalledWith(409, "Nonce already used");

    const storageCtx = makeCtx();
    storageCtx.serviceUnavailable = jest.fn(() => "serviceUnavailable");
    storageCtx.request.path = "/api/license/validate";
    storageCtx.request.headers = {
      "x-request-nonce": "nonce-store",
      "x-request-timestamp": new Date().toISOString(),
    };
    const storageStrapi = makeStrapi({ cryptoService: { reserveNonce: jest.fn().mockResolvedValue(null) } });
    const storageResult = await verifyFreshness(storageCtx, {}, { strapi: storageStrapi });
    expect(storageResult).toEqual({ status: 503, message: "Freshness store unavailable" });
    expect(storageCtx.throw).toHaveBeenCalledWith(503, "Freshness store unavailable");
  });

  it("verify-freshness allows local fallback when freshness store is explicitly optional", async () => {
    const verifyFreshness = freshRequire("../../server/policies/verify-freshness");
    const ctx = makeCtx();
    ctx.request.path = "/api/license/validate";
    ctx.request.headers = {
      "x-request-nonce": "nonce-optional-store",
      "x-request-timestamp": new Date().toISOString(),
    };

    const strapi = makeStrapi({
      pluginConfig: { requireFreshnessStore: false },
      cryptoService: { reserveNonce: jest.fn().mockResolvedValue(null) },
    });

    const result = await verifyFreshness(ctx, {}, { strapi });
    expect(result).toBe(true);
    expect(strapi.log.warn).toHaveBeenCalledWith(
      "[Security] Freshness store unavailable, skipping freshness check",
    );
  });

  it("verify-freshness accepts a fresh nonce reservation and scopes it to the request path", async () => {
    const verifyFreshness = freshRequire("../../server/policies/verify-freshness");
    const ctx = makeCtx();
    ctx.request.path = "/api/license/validate";
    ctx.request.headers = {
      "x-request-nonce": "nonce-happy-path",
      "x-request-timestamp": new Date().toISOString(),
    };

    const reserveNonce = jest.fn().mockResolvedValue(true);
    const strapi = makeStrapi({ cryptoService: { reserveNonce } });

    const result = await verifyFreshness(ctx, {}, { strapi });

    expect(result).toBe(true);
    expect(reserveNonce).toHaveBeenCalledWith(
      "nonce-happy-path",
      "/api/license/validate",
    );
  });

  it("rate-limit increments existing counters and tolerates redis errors", async () => {
    const rateLimit = freshRequire("../../server/policies/rate-limit");

    const incrCtx = makeCtx();
    const redisOk = { get: jest.fn().mockResolvedValue("1"), incr: jest.fn().mockResolvedValue(2), set: jest.fn() };
    const okStrapi = makeStrapi({ redisService: redisOk });
    const okResult = await rateLimit(incrCtx, { maxRequests: 10 }, { strapi: okStrapi });
    expect(okResult).toBe(true);
    expect(redisOk.incr).toHaveBeenCalled();

    const errorCtx = makeCtx();
    const redisFail = { get: jest.fn().mockRejectedValue(new Error("redis read failed")), incr: jest.fn(), set: jest.fn() };
    const failStrapi = makeStrapi({ redisService: redisFail });
    const failResult = await rateLimit(errorCtx, { maxRequests: 10 }, { strapi: failStrapi });
    expect(failResult).toBe(true);
    expect(failStrapi.log.error).toHaveBeenCalledWith("[RateLimit] Error:", "redis read failed");
  });
});