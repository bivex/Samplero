const Koa = require("koa");
const Router = require("@koa/router");
const request = require("supertest");

const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

const createFlowHarness = () => {
  const license = { id: 1, uid: "license-offline-1", status: "active", expires_at: null };
  const activations = [{
    id: 1001,
    license_id: 1,
    device_fingerprint: "device-offline",
    last_checkin: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    revoked_at: null,
    requires_mtls: false,
    last_trust_level: 1,
    client_public_key: null,
  }];
  const reservedNonces = new Map();

  global.strapi = {
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    config: {
      get: jest.fn((path, defaultValue) =>
        path === "plugin::license-server"
          ? { gracePeriodDays: 7, heartbeatIntervalHours: 24 }
          : defaultValue,
      ),
    },
    db: {
      query: jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return {
            findOne: jest.fn(async ({ where } = {}) => {
              if (where?.uid === license.uid || Number(where?.id) === license.id) return license;
              return null;
            }),
          };
        }
        if (model === "plugin::license-server.activation") {
          return {
            findOne: jest.fn(async ({ where } = {}) =>
              activations.find((item) =>
                (where?.id && item.id === Number(where.id)) ||
                (item.license_id === where?.license_id &&
                  item.device_fingerprint === where?.device_fingerprint &&
                  item.revoked_at === where?.revoked_at),
              ) || null,
            ),
            update: jest.fn(async ({ where, data }) => {
              const activation = activations.find((item) => item.id === Number(where?.id));
              if (!activation) return null;
              Object.assign(activation, data);
              return activation;
            }),
          };
        }
        return {};
      }),
    },
  };

  const licenseService = freshRequire("../../server/services/license");
  const cryptoService = {
    reserveNonce: jest.fn(async (nonce, scope = "default") => {
      const key = `${scope}:${nonce}`;
      const expiresAt = reservedNonces.get(key);

      if (expiresAt && expiresAt > Date.now()) {
        return false;
      }

      reservedNonces.set(key, Date.now() + 300_000);
      return true;
    }),
  };

  global.strapi.plugin = jest.fn(() => ({
    service: jest.fn((serviceName) => {
      if (serviceName === "license") return licenseService;
      if (serviceName === "crypto") return cryptoService;
      return {};
    }),
  }));

  const licenseController = freshRequire("../../server/controllers/license");
  const activationController = freshRequire("../../server/controllers/activation");
  const app = new Koa();
  const router = new Router({ prefix: "/license-server" });

  app.use(async (ctx, next) => {
    try {
      ctx.state = { trustLevel: 1 };
      ctx.notFound = (message) => ((ctx.status = 404), (ctx.body = { error: message }));
      ctx.badRequest = (message) => ((ctx.status = 400), (ctx.body = { error: message }));
      ctx.conflict = (message) => ((ctx.status = 409), (ctx.body = { error: message }));
      ctx.serviceUnavailable = (message) => ((ctx.status = 503), (ctx.body = { error: message }));
      ctx.unauthorized = (message) => ((ctx.status = 401), (ctx.body = { error: message }));
      ctx.throw = (status, message) => {
        const err = new Error(message?.message || message || "Request failed");
        err.status = status;
        throw err;
      };
      await next();
    } catch (err) {
      ctx.status = err.status || 500;
      ctx.body = { error: err.message };
    }
  });
  app.use(async (ctx, next) => {
    if (ctx.method === "POST") {
      const raw = await new Promise((resolve, reject) => {
        let body = "";
        ctx.req.on("data", (chunk) => (body += chunk));
        ctx.req.on("end", () => resolve(body));
        ctx.req.on("error", reject);
      });
      ctx.request.body = raw ? JSON.parse(raw) : {};
    }
    await next();
  });

  router.get("/license/validate", async (ctx) => { ctx.body = await licenseController.validate(ctx); });
  router.post("/license/heartbeat", async (ctx) => { ctx.body = await activationController.heartbeat(ctx); });
  app.use(router.routes());
  app.use(router.allowedMethods());

  return { client: request(app.callback()), activations, cryptoService };
};

describe("HTTP integration: offline recovery flow", () => {
  afterEach(() => {
    delete global.strapi;
  });

  it("recovers a stale activation after heartbeat and restores active validation", async () => {
    const { client, activations } = createFlowHarness();
    const query = { license_key: "license-offline-1", device_fingerprint: "device-offline" };
    let nonceCounter = 0;
    const freshnessHeaders = () => ({
      "x-request-nonce": `offline-recovery-${++nonceCounter}`,
      "x-request-timestamp": new Date().toISOString(),
    });

    const before = await client
      .get("/license-server/license/validate")
      .set(freshnessHeaders())
      .query(query)
      .expect(200);
    expect(before.body).toEqual(expect.objectContaining({
      valid: false,
      status: "grace_period_expired",
      action: "heartbeat_required",
      heartbeat_valid: false,
    }));

    const heartbeat = await client
      .post("/license-server/license/heartbeat")
      .set(freshnessHeaders())
      .send({ ...query, heartbeat_nonce: "recover-1" })
      .expect(200);
    expect(heartbeat.body).toEqual(expect.objectContaining({
      valid: true,
      status: "active",
      previous_status: "grace_period_expired",
      recovered: true,
      heartbeat_valid: true,
    }));

    const after = await client
      .get("/license-server/license/validate")
      .set(freshnessHeaders())
      .query(query)
      .expect(200);
    expect(after.body).toEqual(expect.objectContaining({
      valid: true,
      status: "active",
      heartbeat_valid: true,
    }));
    expect(new Date(activations[0].last_checkin).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("returns 409 for replayed freshness nonces before reaching business logic", async () => {
    const { client, cryptoService } = createFlowHarness();
    const query = { license_key: "license-offline-1", device_fingerprint: "device-offline" };
    const headers = {
      "x-request-nonce": "offline-replay-1",
      "x-request-timestamp": new Date().toISOString(),
    };

    const first = await client
      .get("/license-server/license/validate")
      .set(headers)
      .query(query)
      .expect(200);

    expect(first.body).toEqual(expect.objectContaining({
      valid: false,
      status: "grace_period_expired",
    }));

    const replay = await client
      .get("/license-server/license/validate")
      .set(headers)
      .query(query)
      .expect(409);

    expect(replay.body).toEqual({ error: "Nonce already used" });
    expect(cryptoService.reserveNonce).toHaveBeenCalledTimes(2);
  });
});