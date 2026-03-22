const Koa = require("koa");
const Router = require("@koa/router");
const request = require("supertest");

const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

const buildQueryMock = ({ licenses, activations, orders, claims }) =>
  jest.fn((model) => {
    if (model === "plugin::license-server.license") {
      return {
        findMany: jest.fn(async (params = {}) => {
          const ids = params?.where?.id?.$in;
          if (Array.isArray(ids)) {
            return licenses.filter((license) => ids.includes(license.id));
          }

          const offset = Number.isFinite(Number(params?.offset))
            ? Number(params.offset)
            : 0;
          const limit = Number.isFinite(Number(params?.limit))
            ? Number(params.limit)
            : licenses.length;

          return licenses.slice(offset, offset + limit);
        }),
        findOne: jest.fn(async (params = {}) => {
          const id = params?.where?.id;
          const uid = params?.where?.uid;

          if (uid) {
            return licenses.find((license) => license.uid === uid) || null;
          }

          return licenses.find((license) => license.id === Number(id)) || null;
        }),
        count: jest.fn(async () => licenses.length),
        update: jest.fn(async ({ where, data }) => {
          const index = licenses.findIndex(
            (license) => license.id === Number(where?.id),
          );

          if (index === -1) {
            return null;
          }

          licenses[index] = {
            ...licenses[index],
            ...data,
          };

          return licenses[index];
        }),
      };
    }

    if (model === "plugin::license-server.activation") {
      return {
        findMany: jest.fn(async (params = {}) => {
          const ids = params?.where?.license_id?.$in;
          if (Array.isArray(ids)) {
            return activations.filter((activation) =>
              ids.includes(activation.license_id),
            );
          }

          const offset = Number.isFinite(Number(params?.offset))
            ? Number(params.offset)
            : 0;
          const limit = Number.isFinite(Number(params?.limit))
            ? Number(params.limit)
            : activations.length;

          return activations.slice(offset, offset + limit);
        }),
        findOne: jest.fn(async (params = {}) => {
          const id = Number(params?.where?.id);
          return activations.find((activation) => activation.id === id) || null;
        }),
        count: jest.fn(async () => activations.length),
        update: jest.fn(async ({ where, data }) => {
          const index = activations.findIndex(
            (activation) => activation.id === Number(where?.id),
          );

          if (index === -1) {
            return null;
          }

          activations[index] = {
            ...activations[index],
            ...data,
          };

          return activations[index];
        }),
      };
    }

    if (model === "plugin::license-server.client-certificate") {
      return {
        update: jest.fn(async () => ({})),
      };
    }

    if (model === "plugin::license-server.order") {
      const filterOrders = (where = {}) => {
        let results = [...orders];
        if (where.user !== undefined) {
          results = results.filter(
            (order) => Number(order.user?.id || order.user) === Number(where.user),
          );
        }
        if (where.status) {
          results = results.filter((order) => order.status === where.status);
        }
        return results;
      };

      return {
        findMany: jest.fn(async (params = {}) => {
          const results = filterOrders(params?.where);
          const offset = Number.isFinite(Number(params?.offset))
            ? Number(params.offset)
            : 0;
          const limit = Number.isFinite(Number(params?.limit))
            ? Number(params.limit)
            : results.length;

          return results.slice(offset, offset + limit);
        }),
        findOne: jest.fn(async (params = {}) => {
          const id = Number(params?.where?.id);
          const results = filterOrders(params?.where);
          return results.find((order) => order.id === id) || null;
        }),
        count: jest.fn(async ({ where } = {}) => filterOrders(where).length),
        update: jest.fn(async ({ where, data }) => {
          const index = orders.findIndex((order) => order.id === Number(where?.id));

          if (index === -1) {
            return null;
          }

          orders[index] = {
            ...orders[index],
            ...data,
          };

          return orders[index];
        }),
      };
    }

    if (model === "plugin::license-server.first-activation-claim") {
      const filterClaims = (where = {}) => {
        let results = [...claims];
        if (where.status) {
          results = results.filter((claim) => claim.status === where.status);
        }
        if (where.license !== undefined) {
          results = results.filter(
            (claim) => Number(claim.license?.id || claim.license) === Number(where.license),
          );
        }
        if (where.owner_user !== undefined) {
          results = results.filter(
            (claim) => Number(claim.owner_user?.id || claim.owner_user) === Number(where.owner_user),
          );
        }
        return results;
      };

      return {
        findMany: jest.fn(async (params = {}) => {
          const results = filterClaims(params?.where);
          const offset = Number.isFinite(Number(params?.offset))
            ? Number(params.offset)
            : 0;
          const limit = Number.isFinite(Number(params?.limit))
            ? Number(params.limit)
            : results.length;

          return results.slice(offset, offset + limit);
        }),
        findOne: jest.fn(async (params = {}) => {
          const id = Number(params?.where?.id);
          const results = filterClaims(params?.where);
          return results.find((claim) => claim.id === id) || null;
        }),
        count: jest.fn(async ({ where } = {}) => filterClaims(where).length),
        update: jest.fn(async ({ where, data }) => {
          const index = claims.findIndex((claim) => claim.id === Number(where?.id));
          if (index === -1) return null;

          claims[index] = {
            ...claims[index],
            ...data,
          };

          return claims[index];
        }),
      };
    }

    return {};
  });

const createHttpHarness = () => {
  const licenses = [
    {
      id: 1,
      uid: "license-http-1",
      status: "active",
      activation_limit: 3,
      issued_at: "2026-01-01T00:00:00.000Z",
      expires_at: null,
      user: { id: 11, email: "alice@example.com" },
      product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
    },
    {
      id: 2,
      uid: "license-http-2",
      status: "revoked",
      activation_limit: 2,
      issued_at: "2026-01-02T00:00:00.000Z",
      expires_at: null,
      revoked_at: "2026-02-01T00:00:00.000Z",
      user: { id: 12, email: "bob@example.com" },
      product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
    },
  ];

  const activations = [
    {
      id: 1001,
      license_id: 1,
      device_fingerprint: "device-alpha",
      certificate_serial: "CERT-ALPHA",
      plugin_version: "1.0.0",
      platform: "mac",
      last_checkin: "2026-03-01T10:00:00.000Z",
      revoked_at: null,
      requires_mtls: false,
      last_trust_level: 1,
    },
    {
      id: 1002,
      license_id: 1,
      device_fingerprint: "device-beta",
      certificate_serial: "CERT-BETA",
      plugin_version: "1.1.0",
      platform: "win",
      last_checkin: "2026-03-02T10:00:00.000Z",
      revoked_at: null,
      requires_mtls: true,
      last_trust_level: 2,
    },
  ];

  const orders = [
    {
      id: 2001,
      status: "pending",
      total_amount_cents: 4900,
      currency: "USD",
      createdAt: "2026-03-03T08:00:00.000Z",
      user: { id: 11, email: "alice@example.com" },
      items: [
        {
          id: 501,
          product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
        },
      ],
    },
    {
      id: 2002,
      status: "paid",
      total_amount_cents: 2900,
      currency: "USD",
      createdAt: "2026-03-04T08:00:00.000Z",
      paid_at: "2026-03-04T08:05:00.000Z",
      payment_id: "pay_http_2",
      user: { id: 12, email: "bob@example.com" },
      items: [
        {
          id: 502,
          product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
        },
        {
          id: 503,
          product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
        },
      ],
    },
  ];

  const claims = [
    {
      id: 3001,
      status: "pending_confirmation",
      license: {
        id: 1,
        uid: "license-http-1",
        status: "active",
        user: { id: 11, email: "alice@example.com" },
        product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
      },
      owner_user: { id: 11, email: "alice@example.com" },
      approved_by: null,
      device_fingerprint: "device-gamma",
      plugin_version: "1.2.0",
      platform: "mac",
      machine_id: "macbook-pro-1",
      request_ip: "127.0.0.1",
      risk_score: 25,
      risk_reasons: ["first_activation_requires_owner_confirmation"],
      attempt_count: 1,
      expires_at: "2026-03-06T12:15:00.000Z",
      createdAt: "2026-03-06T12:00:00.000Z",
    },
    {
      id: 3002,
      status: "approved",
      license: {
        id: 2,
        uid: "license-http-2",
        status: "active",
        user: { id: 12, email: "bob@example.com" },
        product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
      },
      owner_user: { id: 12, email: "bob@example.com" },
      approved_by: { id: 99, email: "admin@example.com" },
      device_fingerprint: "device-delta",
      plugin_version: "1.1.5",
      platform: "win",
      machine_id: "studio-pc",
      request_ip: "127.0.0.2",
      risk_score: 0,
      risk_reasons: [],
      attempt_count: 1,
      expires_at: "2026-03-06T12:15:00.000Z",
      approved_at: "2026-03-06T12:05:00.000Z",
      createdAt: "2026-03-06T12:00:00.000Z",
    },
  ];

  let licenseService;
  let activationClaimService;
  const purchaseService = {
    decorateOrderExperience: jest.fn(({ order }) => ({
      ...order,
      order_reference: `LS-${String(order?.id || 0).padStart(6, "0")}`,
      receipt: {
        total_items: order?.items?.length || 0,
      },
    })),
    fulfillPaidOrder: jest.fn(async ({ orderId, paymentId }) => ({
      order: {
        id: Number(orderId),
        status: "paid",
        payment_id: paymentId || null,
      },
      licenses: [],
      downloads: [],
    })),
    revokeOrderLicenses: jest.fn(async () => []),
  };
  global.strapi = {
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    config: {
      get: jest.fn((path, defaultValue) => defaultValue),
    },
    db: {
      query: buildQueryMock({ licenses, activations, orders, claims }),
    },
    plugin: jest.fn(() => ({
      service: jest.fn((serviceName) => {
        if (serviceName === "license") {
          return licenseService;
        }
        if (serviceName === "activation-claim") {
          return activationClaimService;
        }
        if (serviceName === "purchase") {
          return purchaseService;
        }
        return {};
      }),
    })),
  };

  licenseService = freshRequire("../../server/services/license");
  activationClaimService = freshRequire("../../server/services/activation-claim");
  const licenseController = freshRequire("../../server/controllers/license");
  const activationController = freshRequire("../../server/controllers/activation");
  const activationClaimController = freshRequire("../../server/controllers/activation-claim");
  const orderController = freshRequire("../../server/controllers/order");
  const adminRoutes = freshRequire("../../server/routes/admin").routes.filter((route) =>
    [
      "GET /licenses",
      "GET /licenses/:id",
      "POST /licenses/:id/revoke",
      "POST /licenses/:id/activate",
      "POST /licenses/:id/deactivate",
      "GET /activations",
      "GET /activations/:id",
      "POST /activations/:id/revoke",
      "GET /activation-claims",
      "GET /orders",
      "GET /orders/:id",
    ].includes(`${route.method} ${route.path}`),
  );

  const controllers = {
    license: licenseController,
    activation: activationController,
    "activation-claim": activationClaimController,
    order: orderController,
  };

  const app = new Koa();
  const router = new Router({ prefix: "/license-server" });

  app.use(async (ctx, next) => {
    ctx.notFound = (message) => {
      ctx.status = 404;
      ctx.body = { error: message };
      return ctx.body;
    };
    ctx.badRequest = (message) => {
      ctx.status = 400;
      ctx.body = { error: message };
      return ctx.body;
    };
    ctx.unauthorized = (message) => {
      ctx.status = 401;
      ctx.body = { error: message };
      return ctx.body;
    };
    await next();
  });

  app.use(async (ctx, next) => {
    ctx.request.body = ctx.request.body || {};
    ctx.state.user = ctx.state.user || { id: 99, role: { type: "admin" } };
    await next();
  });

  for (const route of adminRoutes) {
    const [controllerName, actionName] = route.handler.split(".");
    const methodName = route.method.toLowerCase();

    router[methodName](route.path, async (ctx) => {
      const result = await controllers[controllerName][actionName](ctx);
      if (result !== undefined && ctx.body === undefined) {
        ctx.body = result;
      }
    });
  }

  app.use(router.routes());
  app.use(router.allowedMethods());

  return { client: request(app.callback()), licenses, activations, orders, claims };
};

describe("HTTP integration: license-server JSON responses", () => {
  afterEach(() => {
    delete global.strapi;
  });

  it("GET /license-server/licenses returns hydrated activations for each license", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/licenses").expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: 1,
        uid: "license-http-1",
        user: expect.objectContaining({ email: "alice@example.com" }),
        product: expect.objectContaining({ slug: "ultimate-synth-bundle" }),
        activations: [
          expect.objectContaining({
            id: 1001,
            license_id: 1,
            device_fingerprint: "device-alpha",
          }),
          expect.objectContaining({
            id: 1002,
            license_id: 1,
            device_fingerprint: "device-beta",
          }),
        ],
      }),
    );
    expect(response.body[1].activations).toEqual([]);
  });

  it("GET /license-server/licenses supports limit/offset pagination", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/licenses?limit=1&offset=1").expect(200);

    expect(response.body).toEqual({
      licenses: [
        expect.objectContaining({
          id: 2,
          uid: "license-http-2",
          user: expect.objectContaining({ email: "bob@example.com" }),
          product: expect.objectContaining({ slug: "drum-master-pro" }),
          activations: [],
        }),
      ],
      total: 2,
      limit: 1,
      offset: 1,
    });
  });

  it("GET /license-server/licenses supports search, status filters, and sorting", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/licenses?limit=1&offset=0&search=bob&status=revoked&sortBy=user&sortDir=desc")
      .expect(200);

    expect(response.body).toEqual({
      licenses: [
        expect.objectContaining({
          id: 2,
          uid: "license-http-2",
          user: expect.objectContaining({ email: "bob@example.com" }),
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("GET /license-server/licenses/:id returns one license with hydrated activations", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/licenses/1").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 1,
        uid: "license-http-1",
        activations: expect.arrayContaining([
          expect.objectContaining({ device_fingerprint: "device-alpha" }),
          expect.objectContaining({ device_fingerprint: "device-beta" }),
        ]),
      }),
    );
  });

  it("GET /license-server/activations returns nested license, user, and product data", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/activations").expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: 1001,
        device_fingerprint: "device-alpha",
        license: expect.objectContaining({
          id: 1,
          uid: "license-http-1",
          user: expect.objectContaining({ email: "alice@example.com" }),
          product: expect.objectContaining({ slug: "ultimate-synth-bundle" }),
        }),
      }),
    );
  });

  it("GET /license-server/activations supports limit/offset pagination", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/activations?limit=1&offset=1").expect(200);

    expect(response.body).toEqual({
      activations: [
        expect.objectContaining({
          id: 1002,
          device_fingerprint: "device-beta",
          license: expect.objectContaining({
            id: 1,
            user: expect.objectContaining({ email: "alice@example.com" }),
          }),
        }),
      ],
      total: 2,
      limit: 1,
      offset: 1,
    });
  });

  it("GET /license-server/activations supports search, status filters, and sorting", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/activations?limit=1&offset=0&search=device-beta&status=active&sortBy=last_checkin&sortDir=desc")
      .expect(200);

    expect(response.body).toEqual({
      activations: [
        expect.objectContaining({
          id: 1002,
          device_fingerprint: "device-beta",
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("GET /license-server/activations/:id returns one activation with nested license data", async () => {
    const { client } = createHttpHarness();

    const response = await client.get("/license-server/activations/1002").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 1002,
        certificate_serial: "CERT-BETA",
        license: expect.objectContaining({
          id: 1,
          uid: "license-http-1",
          product: expect.objectContaining({ name: "Ultimate Synth Bundle" }),
        }),
      }),
    );
  });

  it("GET /license-server/orders returns paginated decorated orders", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/orders?status=pending&limit=1&offset=0")
      .expect(200);

    expect(response.body).toEqual({
      orders: [
        expect.objectContaining({
          id: 2001,
          status: "pending",
          user: expect.objectContaining({ email: "alice@example.com" }),
          order_reference: "LS-002001",
          receipt: { total_items: 1 },
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("GET /license-server/orders supports search and sorting", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/orders?limit=1&offset=0&search=bob&sortBy=total_amount_cents&sortDir=desc")
      .expect(200);

    expect(response.body).toEqual({
      orders: [
        expect.objectContaining({
          id: 2002,
          user: expect.objectContaining({ email: "bob@example.com" }),
          order_reference: "LS-002002",
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("GET /license-server/activation-claims returns paginated claims with nested license context", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/activation-claims?status=pending_confirmation&limit=1&offset=0")
      .expect(200);

    expect(response.body).toEqual({
      claims: [
        expect.objectContaining({
          id: 3001,
          status: "pending_confirmation",
          license: expect.objectContaining({
            uid: "license-http-1",
            product: expect.objectContaining({ slug: "ultimate-synth-bundle" }),
          }),
          owner_user: expect.objectContaining({ email: "alice@example.com" }),
          risk_reasons: ["first_activation_requires_owner_confirmation"],
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("GET /license-server/activation-claims supports search and sorting", async () => {
    const { client } = createHttpHarness();

    const response = await client
      .get("/license-server/activation-claims?limit=1&offset=0&search=bob&sortBy=risk_score&sortDir=desc")
      .expect(200);

    expect(response.body).toEqual({
      claims: [
        expect.objectContaining({
          id: 3002,
          owner_user: expect.objectContaining({ email: "bob@example.com" }),
        }),
      ],
      total: 1,
      limit: 1,
      offset: 0,
    });
  });

  it("POST /license-server/licenses/:id/revoke revokes the license and its activations", async () => {
    const { client } = createHttpHarness();

    await client.post("/license-server/licenses/1/revoke").expect(200, {
      success: true,
    });

    const response = await client.get("/license-server/licenses/1").expect(200);

    expect(response.body.status).toBe("revoked");
    expect(response.body.revoked_at).toBeTruthy();
    expect(response.body.activations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1001, revoked_at: expect.any(String) }),
        expect.objectContaining({ id: 1002, revoked_at: expect.any(String) }),
      ]),
    );
  });

  it("POST /license-server/licenses/:id/activate returns an active hydrated license", async () => {
    const { client } = createHttpHarness();

    const response = await client.post("/license-server/licenses/2/activate").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 2,
        uid: "license-http-2",
        status: "active",
        revoked_at: null,
        activations: [],
      }),
    );
  });

  it("POST /license-server/licenses/:id/deactivate returns success and persists revoked state", async () => {
    const { client } = createHttpHarness();

    await client.post("/license-server/licenses/1/deactivate").expect(200, {
      success: true,
    });

    const response = await client.get("/license-server/licenses/1").expect(200);

    expect(response.body.status).toBe("revoked");
    expect(response.body.activations.every((activation) => !!activation.revoked_at)).toBe(true);
  });

  it("POST /license-server/activations/:id/revoke returns hydrated activation with nested license", async () => {
    const { client } = createHttpHarness();

    const response = await client.post("/license-server/activations/1001/revoke").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 1001,
        revoked_at: expect.any(String),
        license: expect.objectContaining({
          id: 1,
          uid: "license-http-1",
          user: expect.objectContaining({ email: "alice@example.com" }),
        }),
      }),
    );
  });
});