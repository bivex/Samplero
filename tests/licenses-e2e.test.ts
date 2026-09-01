/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:35
 * Last Updated: 2026-03-22 02:35
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { describe, expect, it, afterEach, mock } from "bun:test";
import Koa from "koa";
import Router from "@koa/router";
import request from "supertest";
import crypto from "crypto";

const freshRequire = (modulePath: string) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

interface TestState {
  users: any[];
  products: any[];
  pluginVersions: any[];
  licenses: any[];
  activations: any[];
  orders: any[];
  orderItems: any[];
  claims: any[];
  coupons: any[];
  reservedNonces: Map<string, number>;
}

const createTestE2EHarness = () => {
  const state: TestState = {
    users: [
      { id: 1, email: "producer@example.com", username: "producer1", role: { type: "authenticated" } },
      { id: 2, email: "musician@example.com", username: "musician2", role: { type: "authenticated" } },
      { id: 99, email: "admin@bivex.io", username: "admin", role: { type: "admin" } },
    ],
    products: [
      {
        id: 10,
        name: "Vintage Analog Synth VST",
        slug: "vintage-synth",
        type: "plugin",
        price_cents: 14900,
        currency: "USD",
        max_activations: 2,
        is_active: true,
      },
      {
        id: 20,
        name: "808 Drum Machine VST",
        slug: "808-drum-machine",
        type: "plugin",
        price_cents: 9900,
        currency: "USD",
        max_activations: 1,
        is_active: true,
      },
    ],
    pluginVersions: [
      {
        id: 101,
        product: { id: 10, name: "Vintage Analog Synth VST", slug: "vintage-synth", type: "plugin" },
        version: "1.0.0",
        platform: "macOS",
        file_path: "/storage/vst/synth-mac.pkg",
        download_url: "https://downloads.example.com/synth-mac.pkg",
        min_license_protocol_version: 1,
        is_latest: true,
      },
    ],
    licenses: [],
    activations: [],
    orders: [],
    orderItems: [],
    claims: [],
    coupons: [
      {
        id: 1,
        code: "FULLDISCOUNT2026",
        covers_full_amount: true,
        max_redemptions: 10,
        redemption_count: 0,
        is_active: true,
      },
    ],
    reservedNonces: new Map(),
  };

  let idCounter = 1000;

  (global as any).strapi = {
    log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    config: {
      get: mock((path: string, defaultValue: any) => {
        if (path === "plugin::license-server") {
          return {
            gracePeriodDays: 7,
            heartbeatIntervalHours: 24,
            serverSecret: "e2e-test-secret-key-32-bytes-long",
            enableMtls: false,
          };
        }
        return defaultValue;
      }),
    },
    db: {
      query: mock((model: string) => {
        if (model === "plugin::license-server.product") {
          return {
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id) return state.products.find((p) => p.id === Number(where.id)) || null;
              if (where?.slug) return state.products.find((p) => p.slug === where.slug) || null;
              return null;
            }),
            findMany: mock(async () => state.products),
          };
        }

        if (model === "plugin::license-server.plugin-version" || model === "plugin::license-server.product-version") {
          return {
            findMany: mock(async ({ where }: any = {}) => {
              if (where?.product?.$in) {
                return state.pluginVersions.filter((pv) => where.product.$in.includes(pv.product?.id || pv.product));
              }
              if (where?.product) {
                return state.pluginVersions.filter((pv) => (pv.product?.id || pv.product) === Number(where.product));
              }
              return state.pluginVersions;
            }),
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.product && where?.is_latest) {
                return state.pluginVersions.find((pv) => (pv.product?.id || pv.product) === Number(where.product) && pv.is_latest) || null;
              }
              return null;
            }),
          };
        }

        if (model === "plugin::license-server.coupon") {
          return {
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id) return state.coupons.find((c) => c.id === Number(where.id)) || null;
              if (where?.code) {
                return state.coupons.find((c) => c.code.toUpperCase() === String(where.code).trim().toUpperCase()) || null;
              }
              return null;
            }),
            update: mock(async ({ where, data }: any = {}) => {
              const coupon = state.coupons.find((c) => c.id === Number(where?.id));
              if (coupon) Object.assign(coupon, data);
              return coupon || null;
            }),
          };
        }

        if (model === "plugin::license-server.order") {
          return {
            create: mock(async ({ data }: any = {}) => {
              const userId = Number(data.user || data.user_id || 1);
              const order = {
                id: ++idCounter,
                order_reference: data.order_reference || `LS-${String(idCounter).padStart(6, "0")}`,
                user: state.users.find((u) => u.id === userId) || { id: userId },
                user_id: userId,
                status: data.status || "pending",
                total_amount_cents: data.total_amount_cents || 0,
                subtotal_amount_cents: data.subtotal_amount_cents || data.total_amount_cents || 0,
                discount_amount_cents: data.discount_amount_cents || 0,
                currency: data.currency || "USD",
                payment_method: data.payment_method || null,
                payment_id: data.payment_id || null,
                coupon: data.coupon || null,
                coupon_code: data.coupon_code || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              state.orders.push(order);
              return order;
            }),
            findOne: mock(async ({ where }: any = {}) => {
              const targetId = Number(where?.id);
              const order = state.orders.find((o) => o.id === targetId && (where?.user === undefined || Number(o.user?.id || o.user_id || o.user) === Number(where.user?.id || where.user)));
              if (order) {
                const items = state.orderItems.filter((i) => Number(i.order || i.order_id) === order.id).map((i) => ({
                  ...i,
                  product: state.products.find((p) => p.id === (i.product?.id || i.product || i.product_id)),
                }));
                return {
                  ...order,
                  items,
                };
              }
              return null;
            }),
            update: mock(async ({ where, data }: any = {}) => {
              const order = state.orders.find((o) => o.id === Number(where?.id));
              if (order) Object.assign(order, data);
              return order || null;
            }),
            findMany: mock(async () => state.orders),
          };
        }

        if (model === "plugin::license-server.order-item") {
          return {
            create: mock(async ({ data }: any = {}) => {
              const item = {
                id: ++idCounter,
                order: data.order || data.order_id,
                order_id: data.order || data.order_id,
                product: state.products.find((p) => p.id === Number(data.product || data.product_id)) || data.product,
                product_id: Number(data.product || data.product_id),
                price_cents: data.price_at_purchase || data.price_cents,
                quantity: data.quantity || 1,
                createdAt: new Date().toISOString(),
              };
              state.orderItems.push(item);
              return item;
            }),
            findMany: mock(async ({ where }: any = {}) => {
              const orderId = Number(where?.order || where?.order_id);
              if (orderId) {
                return state.orderItems.filter((i) => Number(i.order || i.order_id) === orderId).map((i) => ({
                  ...i,
                  product: state.products.find((p) => p.id === (i.product?.id || i.product_id)),
                }));
              }
              return state.orderItems;
            }),
          };
        }

        if (model === "plugin::license-server.license") {
          return {
            create: mock(async ({ data }: any = {}) => {
              const userId = Number(data.user || data.user_id);
              const productId = Number(data.product || data.product_id);
              const license = {
                id: ++idCounter,
                uid: data.uid || `LIC-${idCounter}`,
                user: state.users.find((u) => u.id === userId) || null,
                user_id: userId,
                product: state.products.find((p) => p.id === productId) || null,
                product_id: productId,
                activation_limit: data.activation_limit || 2,
                status: data.status || "active",
                expires_at: data.expires_at || null,
                issued_at: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              state.licenses.push(license);
              return license;
            }),
            findOne: mock(async ({ where }: any = {}) => {
              let license = null;
              if (where?.id) license = state.licenses.find((l) => l.id === Number(where.id)) || null;
              if (where?.uid) license = state.licenses.find((l) => l.uid === where.uid) || null;
              if ((where?.user || where?.user_id) && (where?.product || where?.product_id)) {
                const uId = Number(where.user || where.user_id);
                const pId = Number(where.product || where.product_id);
                license = state.licenses.find((l) => Number(l.user?.id || l.user_id) === uId && Number(l.product?.id || l.product_id) === pId) || null;
              }
              if (license) {
                const activations = state.activations.filter((a) => a.license_id === license.id && !a.revoked_at);
                const product = state.products.find((p) => p.id === (license.product?.id || license.product_id));
                const user = state.users.find((u) => u.id === (license.user?.id || license.user_id));
                return { ...license, activations, product, user };
              }
              return null;
            }),
            findMany: mock(async () => state.licenses),
            update: mock(async ({ where, data }: any = {}) => {
              const license = state.licenses.find((l) => l.id === Number(where?.id) || l.uid === where?.uid);
              if (license) Object.assign(license, data);
              return license || null;
            }),
          };
        }

        if (model === "plugin::license-server.activation") {
          return {
            create: mock(async ({ data }: any = {}) => {
              const activation = {
                id: ++idCounter,
                license: data.license_id || data.license,
                license_id: Number(data.license_id || data.license?.id || data.license),
                device_fingerprint: data.device_fingerprint,
                machine_id: data.machine_id || data.device_fingerprint,
                platform: data.platform || "macOS",
                client_public_key: data.client_public_key || null,
                certificate_serial: data.certificate_serial || null,
                requires_mtls: Boolean(data.requires_mtls),
                last_trust_level: data.last_trust_level ?? 1,
                last_checkin: data.last_checkin || new Date().toISOString(),
                activated_at: new Date().toISOString(),
                revoked_at: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              state.activations.push(activation);
              return activation;
            }),
            findMany: mock(async ({ where }: any = {}) => {
              let items = [...state.activations];
              if (where?.license_id?.$in) {
                const ids = where.license_id.$in.map(Number);
                items = items.filter((a) => ids.includes(a.license_id));
              } else if (where?.license_id) {
                items = items.filter((a) => a.license_id === Number(where.license_id));
              }
              if (where?.revoked_at === null) {
                items = items.filter((a) => !a.revoked_at);
              }
              return items;
            }),
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id) return state.activations.find((a) => a.id === Number(where.id)) || null;
              return state.activations.find((a) => {
                const matchLicense = !where?.license_id || a.license_id === Number(where.license_id);
                const matchDevice = !where?.device_fingerprint || a.device_fingerprint === where.device_fingerprint;
                const matchRevoked = where?.revoked_at === undefined || (where.revoked_at === null ? !a.revoked_at : a.revoked_at === where.revoked_at);
                return matchLicense && matchDevice && matchRevoked;
              }) || null;
            }),
            update: mock(async ({ where, data }: any = {}) => {
              const activation = state.activations.find((a) => a.id === Number(where?.id));
              if (activation) Object.assign(activation, data);
              return activation || null;
            }),
            count: mock(async ({ where }: any = {}) => {
              let items = [...state.activations];
              if (where?.license_id) items = items.filter((a) => a.license_id === Number(where.license_id));
              if (where?.revoked_at === null) items = items.filter((a) => !a.revoked_at);
              return items.length;
            }),
          };
        }

        if (model === "plugin::license-server.first-activation-claim" || model === "plugin::license-server.activation-claim") {
          return {
            create: mock(async ({ data }: any = {}) => {
              const claim = {
                id: ++idCounter,
                license: data.license_id || data.license,
                license_id: Number(data.license_id || data.license?.id || data.license),
                owner_user_id: data.owner_user_id || 1,
                status: data.status || "pending_confirmation",
                device_fingerprint: data.device_fingerprint,
                machine_id: data.machine_id,
                platform: data.platform,
                plugin_version: data.plugin_version,
                request_ip: data.request_ip,
                risk_score: data.risk_score || 0,
                risk_reasons: data.risk_reasons || [],
                expires_at: data.expires_at || new Date(Date.now() + 86400000).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              state.claims.push(claim);
              return claim;
            }),
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id) return state.claims.find((c) => c.id === Number(where.id)) || null;
              if (where?.license_id && where?.status) {
                return state.claims.find((c) => c.license_id === Number(where.license_id) && c.status === where.status) || null;
              }
              if (where?.license && where?.status) {
                return state.claims.find((c) => (c.license_id === Number(where.license) || c.license === Number(where.license)) && c.status === where.status) || null;
              }
              return null;
            }),
            findMany: mock(async ({ where }: any = {}) => {
              let items = [...state.claims];
              if (where?.license_id) items = items.filter((c) => c.license_id === Number(where.license_id));
              if (where?.license) items = items.filter((c) => (c.license_id === Number(where.license) || c.license === Number(where.license)));
              if (where?.status) items = items.filter((c) => c.status === where.status);
              return items;
            }),
            update: mock(async ({ where, data }: any = {}) => {
              const claim = state.claims.find((c) => c.id === Number(where?.id));
              if (claim) Object.assign(claim, data);
              return claim || null;
            }),
          };
        }

        return {};
      }),
    },
  };

  const licenseService = freshRequire("../plugins/license-server/server/services/license");
  const purchaseService = freshRequire("../plugins/license-server/server/services/purchase");
  const activationClaimService = freshRequire("../plugins/license-server/server/services/activation-claim");
  const couponService = freshRequire("../plugins/license-server/server/services/coupon");

  const cryptoService = {
    reserveNonce: mock(async (nonce: string, scope = "default") => {
      const key = `${scope}:${nonce}`;
      const expiresAt = state.reservedNonces.get(key);
      if (expiresAt && expiresAt > Date.now()) return false;
      state.reservedNonces.set(key, Date.now() + 300_000);
      return true;
    }),
    verifyRequestSignature: mock((payload: any, signature: string, publicKey: string) => {
      try {
        const verifier = crypto.createVerify("SHA256");
        verifier.update(typeof payload === "string" ? payload : JSON.stringify(payload));
        verifier.end();
        return verifier.verify(publicKey, signature, "base64");
      } catch {
        return false;
      }
    }),
    signResponse: mock((payload: any) => {
      const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
      return crypto.createHmac("sha256", "e2e-test-secret-key-32-bytes-long").update(serialized).digest("hex");
    }),
  };

  (global as any).strapi.plugin = mock(() => ({
    service: mock((name: string) => {
      if (name === "license") return licenseService;
      if (name === "purchase") return purchaseService;
      if (name === "activation-claim" || name === "first-activation-claim") return activationClaimService;
      if (name === "coupon") return couponService;
      if (name === "crypto") return cryptoService;
      return {};
    }),
  }));

  const licenseController = freshRequire("../plugins/license-server/server/controllers/license");
  const activationController = freshRequire("../plugins/license-server/server/controllers/activation");
  const orderController = freshRequire("../plugins/license-server/server/controllers/order");
  const claimController = freshRequire("../plugins/license-server/server/controllers/activation-claim");

  const app = new Koa();
  const router = new Router({ prefix: "/license-server" });

  app.use(async (ctx, next) => {
    try {
      const c = ctx as any;
      c.state = { user: state.users[0], trustLevel: 1 };
      c.notFound = (msg: string) => { ctx.status = 404; ctx.body = { error: msg }; return ctx.body; };
      c.badRequest = (msg: string) => { ctx.status = 400; ctx.body = { error: msg }; return ctx.body; };
      c.conflict = (msg: string) => { ctx.status = 409; ctx.body = { error: msg }; return ctx.body; };
      c.forbidden = (msg: string) => { ctx.status = 403; ctx.body = { error: msg }; return ctx.body; };
      c.unauthorized = (msg: string) => { ctx.status = 401; ctx.body = { error: msg }; return ctx.body; };
      c.throw = (status: any, message: any) => {
        const err = new Error(message?.message || message || "Request failed");
        (err as any).status = typeof status === "number" ? status : 500;
        throw err;
      };
      await next();
    } catch (err: any) {
      ctx.status = err.status || 500;
      ctx.body = { error: err.message };
    }
  });

  app.use(async (ctx, next) => {
    if (ctx.method === "POST") {
      const raw = await new Promise<string>((resolve, reject) => {
        let body = "";
        ctx.req.on("data", (chunk: any) => (body += chunk));
        ctx.req.on("end", () => resolve(body));
        ctx.req.on("error", reject);
      });
      ctx.request.body = raw ? JSON.parse(raw) : {};
    }
    await next();
  });

  // Wire license server routes
  router.post("/orders", async (ctx) => { ctx.body = await orderController.create(ctx); });
  router.post("/me/orders/:id/redeem-coupon", async (ctx) => { ctx.body = await orderController.redeemCoupon(ctx); });
  router.get("/me/orders/:id", async (ctx) => { ctx.body = await orderController.findOne(ctx); });
  router.post("/license/activate", async (ctx) => { ctx.body = await licenseController.activate(ctx); });
  router.get("/license/validate", async (ctx) => { ctx.body = await licenseController.validate(ctx); });
  router.post("/license/heartbeat", async (ctx) => { ctx.body = await activationController.heartbeat(ctx); });
  router.post("/license/deactivate", async (ctx) => { ctx.body = await licenseController.deactivate(ctx); });
  router.get("/claims/:claimId", async (ctx) => { ctx.body = await claimController.findOne(ctx); });
  router.post("/claims/:claimId/approve", async (ctx) => { ctx.body = await claimController.approveAdmin(ctx); });
  router.post("/licenses/:id/revoke", async (ctx) => { ctx.body = await licenseController.deactivateById(ctx); });
  router.post("/licenses/:id/activate", async (ctx) => { ctx.body = await licenseController.activateById(ctx); });

  app.use(router.routes());
  app.use(router.allowedMethods());

  return {
    client: request(app.callback()),
    state,
    licenseService,
    purchaseService,
    cryptoService,
  };
};

describe("License Server Full End-to-End (E2E) Test Suite", () => {
  afterEach(() => {
    delete (global as any).strapi;
  });

  it("E2E Scenario 1: Complete Checkout -> 100% Coupon Redemption -> License Generation", async () => {
    const { client } = createTestE2EHarness();

    // 1. Initiate purchase order of Vintage Analog Synth
    const checkoutRes = await client
      .post("/license-server/orders")
      .send({
        items: [{ product_id: 10, quantity: 1 }],
      })
      .expect(200);

    expect(checkoutRes.body).toHaveProperty("id");
    const orderId = checkoutRes.body.id;
    expect(checkoutRes.body.status).toBe("pending");
    expect(checkoutRes.body.total_amount_cents).toBe(14900);

    // 2. Redeem 100% full-discount promotional coupon
    const couponRes = await client
      .post(`/license-server/me/orders/${orderId}/redeem-coupon`)
      .send({ coupon_code: "FULLDISCOUNT2026" })
      .expect(200);

    expect(couponRes.body.status).toBe("paid");
    expect(couponRes.body.delivery_summary.ready_for_delivery).toBe(true);

    // 3. Verify order status reflects paid and provides customer downloads
    const orderStatusRes = await client
      .get(`/license-server/me/orders/${orderId}`)
      .expect(200);

    expect(orderStatusRes.body.status).toBe("paid");
    expect(orderStatusRes.body.order_reference).toBe(`LS-${String(orderId).padStart(6, "0")}`);
  });

  it("E2E Scenario 2: Zero-Trust Hardware Activation with Pending Confirmation Claim & Owner Approval", async () => {
    const { client } = createTestE2EHarness();

    // Mint a license directly into state
    const license = await (global as any).strapi.db.query("plugin::license-server.license").create({
      data: {
        uid: "LIC-PROD-ZERO-TRUST-001",
        user_id: 1,
        product_id: 10,
        status: "active",
      },
    });

    const clientDevice1 = {
      license_key: license.uid,
      device_fingerprint: "macbook-pro-m2-max-01",
      machine_id: "machine-uuid-aaa-111",
      platform: "macOS 14.5",
      plugin_version: "1.0.0",
    };

    // 1. Client attempts first activation on new device -> Generates pending claim
    const firstAttempt = await client
      .post("/license-server/license/activate")
      .send(clientDevice1)
      .expect(200);

    expect(firstAttempt.body).toEqual(expect.objectContaining({
      status: "pending_confirmation",
      claim_id: expect.any(Number),
      next_step: "approve_in_account",
    }));

    const claimId = firstAttempt.body.claim_id;

    // 2. Idempotent re-attempt by same device returns existing pending claim
    const retryAttempt = await client
      .post("/license-server/license/activate")
      .send(clientDevice1)
      .expect(200);

    expect(retryAttempt.body.claim_id).toBe(claimId);
    expect(retryAttempt.body.status).toBe("pending_confirmation");

    // 3. Competing foreign device cannot hijack the pending claim
    const competingAttempt = await client
      .post("/license-server/license/activate")
      .send({
        ...clientDevice1,
        device_fingerprint: "hacker-device-fingerprint",
        machine_id: "hacker-machine-uuid",
      })
      .expect(400);

    expect(competingAttempt.body.error).toContain("FIRST_ACTIVATION_PENDING");

    // 4. Owner / Admin inspects and approves the claim (activates device slot)
    const approveRes = await client
      .post(`/license-server/claims/${claimId}/approve`)
      .send({ notes: "Verified customer primary machine" })
      .expect(200);

    expect(approveRes.body.status).toBe("approved");
    expect(approveRes.body).toHaveProperty("activation_id");

    const activationId = approveRes.body.activation_id;

    let nonceSeq = 10;
    const makeHeaders = () => ({
      "x-request-nonce": `val-nonce-${++nonceSeq}`,
      "x-request-timestamp": new Date().toISOString(),
    });

    // 5. Device is now valid and active
    const validateRes = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({
        license_key: license.uid,
        device_fingerprint: clientDevice1.device_fingerprint,
      })
      .expect(200);

    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.status).toBe("active");
  });

  it("E2E Scenario 3: Periodic Heartbeat, Freshness Headers & Nonce Replay Defense", async () => {
    const { client } = createTestE2EHarness();

    const license = await (global as any).strapi.db.query("plugin::license-server.license").create({
      data: {
        uid: "LIC-HEARTBEAT-E2E-001",
        user_id: 1,
        product_id: 10,
        status: "active",
      },
    });

    await (global as any).strapi.db.query("plugin::license-server.activation").create({
      data: {
        license_id: license.id,
        device_fingerprint: "studio-mac-mini-01",
        machine_id: "studio-mac-mini-01",
        last_checkin: new Date().toISOString(),
      },
    });

    let nonceSeq = 100;
    const makeHeaders = () => ({
      "x-request-nonce": `e2e-nonce-${++nonceSeq}`,
      "x-request-timestamp": new Date().toISOString(),
    });

    // 1. Initial valid check
    const valRes1 = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({
        license_key: license.uid,
        device_fingerprint: "studio-mac-mini-01",
      })
      .expect(200);

    expect(valRes1.body.valid).toBe(true);
    expect(valRes1.body.status).toBe("active");

    // 2. Perform periodic client heartbeat
    const hbRes = await client
      .post("/license-server/license/heartbeat")
      .set(makeHeaders())
      .send({
        license_key: license.uid,
        device_fingerprint: "studio-mac-mini-01",
        heartbeat_nonce: "hb-seq-001",
      })
      .expect(200);

    expect(hbRes.body.valid).toBe(true);
    expect(hbRes.body.heartbeat_valid).toBe(true);

    // 3. Replay protection: Submitting duplicate request nonce returns 409 Conflict
    const replayNonce = "e2e-duplicate-replay-test-nonce";
    const firstCall = await client
      .get("/license-server/license/validate")
      .set({
        "x-request-nonce": replayNonce,
        "x-request-timestamp": new Date().toISOString(),
      })
      .query({
        license_key: license.uid,
        device_fingerprint: "studio-mac-mini-01",
      })
      .expect(200);
    expect(firstCall.body.valid).toBe(true);

    const replayedCall = await client
      .get("/license-server/license/validate")
      .set({
        "x-request-nonce": replayNonce,
        "x-request-timestamp": new Date().toISOString(),
      })
      .query({
        license_key: license.uid,
        device_fingerprint: "studio-mac-mini-01",
      })
      .expect(409);

    expect(replayedCall.body.error).toBe("Nonce already used");
  });

  it("E2E Scenario 4: Grace Period Lifecycle and Offline Auto-Recovery", async () => {
    const { client } = createTestE2EHarness();

    const license = await (global as any).strapi.db.query("plugin::license-server.license").create({
      data: { uid: "LIC-GRACE-E2E-001", user_id: 1, product_id: 10, status: "active" },
    });

    // Device with checkin 10 days ago (grace period is 7 days)
    await (global as any).strapi.db.query("plugin::license-server.activation").create({
      data: {
        license_id: license.id,
        device_fingerprint: "touring-laptop-offline",
        machine_id: "touring-laptop-offline",
        last_checkin: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    let nonceSeq = 500;
    const makeHeaders = () => ({
      "x-request-nonce": `grace-nonce-${++nonceSeq}`,
      "x-request-timestamp": new Date().toISOString(),
    });

    // 1. Validation reports expired grace period
    const expiredVal = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({
        license_key: license.uid,
        device_fingerprint: "touring-laptop-offline",
      })
      .expect(200);

    expect(expiredVal.body.valid).toBe(false);
    expect(expiredVal.body.status).toBe("grace_period_expired");
    expect(expiredVal.body.action).toBe("heartbeat_required");

    // 2. Client connects to network and submits recovery heartbeat
    const recoveryHb = await client
      .post("/license-server/license/heartbeat")
      .set(makeHeaders())
      .send({
        license_key: license.uid,
        device_fingerprint: "touring-laptop-offline",
        heartbeat_nonce: "online-again-001",
      })
      .expect(200);

    expect(recoveryHb.body.valid).toBe(true);
    expect(recoveryHb.body.status).toBe("active");
    expect(recoveryHb.body.recovered).toBe(true);

    // 3. Validation is now restored to valid active state
    const restoredVal = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({
        license_key: license.uid,
        device_fingerprint: "touring-laptop-offline",
      })
      .expect(200);

    expect(restoredVal.body.valid).toBe(true);
    expect(restoredVal.body.status).toBe("active");
  });

  it("E2E Scenario 5: Multi-Device Activation Limits & Customer Deactivation Slot Recycling", async () => {
    const { client } = createTestE2EHarness();

    // Product max_activations is 2
    const license = await (global as any).strapi.db.query("plugin::license-server.license").create({
      data: { uid: "LIC-LIMIT-E2E-001", user_id: 1, product_id: 10, status: "active", activation_limit: 2 },
    });

    // Pre-activate first device
    await (global as any).strapi.db.query("plugin::license-server.activation").create({
      data: { license_id: license.id, device_fingerprint: "device-slot-1", last_checkin: new Date().toISOString() },
    });

    // Activate second device (not first activation on license, so issues immediately)
    const dev2Res = await client
      .post("/license-server/license/activate")
      .send({ license_key: license.uid, device_fingerprint: "device-slot-2" })
      .expect(200);

    expect(dev2Res.body.status).toBe("approved");
    expect(dev2Res.body).toHaveProperty("activation_id");

    // Attempt third device -> Exceeds max_activations (2)
    const dev3Attempt = await client
      .post("/license-server/license/activate")
      .send({ license_key: license.uid, device_fingerprint: "device-slot-3" })
      .expect(400);

    expect(dev3Attempt.body.error).toContain("ACTIVATION_LIMIT_EXCEEDED");

    // Deactivate device-slot-1 to free capacity
    const deactRes = await client
      .post("/license-server/license/deactivate")
      .send({ license_key: license.uid, device_fingerprint: "device-slot-1" })
      .expect(200);

    expect(deactRes.body.status).toBe("deactivated");
    expect(deactRes.body.activations_remaining).toBe(1);

    // Now device-slot-3 can activate successfully
    const dev3Retry = await client
      .post("/license-server/license/activate")
      .send({ license_key: license.uid, device_fingerprint: "device-slot-3" })
      .expect(200);

    expect(dev3Retry.body.status).toBe("approved");
  });

  it("E2E Scenario 6: Admin Emergency Revocation & Instant Blast-Radius Invalidation", async () => {
    const { client } = createTestE2EHarness();

    const license = await (global as any).strapi.db.query("plugin::license-server.license").create({
      data: { uid: "LIC-FRAUD-REVOKE-001", user_id: 1, product_id: 10, status: "active" },
    });

    const act1 = await (global as any).strapi.db.query("plugin::license-server.activation").create({
      data: { license_id: license.id, device_fingerprint: "device-fraud-1", last_checkin: new Date().toISOString() },
    });
    const act2 = await (global as any).strapi.db.query("plugin::license-server.activation").create({
      data: { license_id: license.id, device_fingerprint: "device-fraud-2", last_checkin: new Date().toISOString() },
    });

    let nonceSeq = 700;
    const makeHeaders = () => ({
      "x-request-nonce": `revoke-nonce-${++nonceSeq}`,
      "x-request-timestamp": new Date().toISOString(),
    });

    // 1. Devices validate successfully before revocation
    const beforeRevoke = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({ activation_id: act1.id, device_fingerprint: "device-fraud-1" })
      .expect(200);
    expect(beforeRevoke.body.valid).toBe(true);

    // 2. Admin issues emergency revocation
    const revokeRes = await client
      .post(`/license-server/licenses/${license.id}/revoke`)
      .expect(200);

    expect(revokeRes.body.success).toBe(true);

    // 3. Immediately all device validations are blocked with LICENSE_REVOKED
    const afterRevoke1 = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({ activation_id: act1.id, device_fingerprint: "device-fraud-1" })
      .expect(200);
    expect(afterRevoke1.body.valid).toBe(false);
    expect(afterRevoke1.body.license_status).toBe("revoked");

    const afterRevoke2 = await client
      .get("/license-server/license/validate")
      .set(makeHeaders())
      .query({ activation_id: act2.id, device_fingerprint: "device-fraud-2" })
      .expect(200);
    expect(afterRevoke2.body.valid).toBe(false);
    expect(afterRevoke2.body.license_status).toBe("revoked");

    // 4. Admin restores / reactivates the license
    const reactivateRes = await client
      .post(`/license-server/licenses/${license.id}/activate`)
      .expect(200);

    expect(reactivateRes.body.status).toBe("active");
  });
});

