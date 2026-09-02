/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 03:15
 * Last Updated: 2026-03-22 03:15
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
  reservedNonces: Map<string, number>;
}

const WEBHOOK_SECRET = "super-secret-stripe-webhook-key-32-chars";

const createTestE2EHarness = (customConfig: Record<string, any> = {}) => {
  const state: TestState = {
    users: [
      { id: 1, email: "producer@example.com", username: "producer1" },
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
    ],
    pluginVersions: [
      {
        id: 101,
        product: { id: 10, name: "Vintage Analog Synth VST", slug: "vintage-synth", type: "plugin" },
        version: "1.0.0",
        platform: "macOS",
        file_path: "/storage/vst/synth-mac.pkg",
        download_url: "https://downloads.example.com/synth-mac.pkg",
        is_latest: true,
      },
    ],
    licenses: [],
    activations: [],
    orders: [
      {
        id: 501,
        user: { id: 1, email: "producer@example.com" },
        user_id: 1,
        status: "pending",
        total_cents: 14900,
        currency: "USD",
        payment_method: "stripe",
        payment_id: null,
        created_at: new Date().toISOString(),
      },
    ],
    orderItems: [
      {
        id: 901,
        order: { id: 501 },
        order_id: 501,
        product: { id: 10, name: "Vintage Analog Synth VST", slug: "vintage-synth", type: "plugin" },
        product_id: 10,
        price_cents: 14900,
      },
    ],
    reservedNonces: new Map(),
  };

  let idCounter = 2000;

  (global as any).strapi = {
    log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    config: {
      get: mock((path: string, defaultValue: any) => {
        if (path === "plugin::license-server") {
          return {
            webhookSecret: WEBHOOK_SECRET,
            webhookFreshnessMaxSkewSeconds: 300,
            requireFreshnessStore: true,
            serverSecret: "e2e-test-secret-key-32-bytes-long",
            ...customConfig,
          };
        }
        return defaultValue;
      }),
    },
    db: {
      query: mock((model: string) => {
        if (model === "plugin::license-server.product") {
          return {
            findOne: mock(async ({ where }: any) => {
              return state.products.find((p) => p.id === where?.id || p.slug === where?.slug) || null;
            }),
          };
        }

        if (model === "plugin::license-server.order") {
          return {
            findOne: mock(async ({ where }: any) => {
              return state.orders.find((o) => o.id === where?.id) || null;
            }),
            update: mock(async ({ where, data }: any) => {
              const target = state.orders.find((o) => o.id === where?.id);
              if (target) Object.assign(target, data);
              return target || null;
            }),
          };
        }

        if (model === "plugin::license-server.order-item") {
          return {
            findMany: mock(async ({ where }: any) => {
              return state.orderItems.filter((oi) => oi.order?.id === where?.order || oi.order_id === where?.order);
            }),
            update: mock(async ({ where, data }: any) => {
              const item = state.orderItems.find((oi) => oi.id === where?.id);
              if (item) Object.assign(item, data);
              return item;
            }),
          };
        }

        if (model === "plugin::license-server.license") {
          const populateLicense = (lic: any) => {
            if (!lic) return null;
            const product = state.products.find((p) => p.id === (lic.product?.id || lic.product)) || lic.product;
            const user = state.users.find((u) => u.id === (lic.user?.id || lic.user)) || lic.user;
            const activations = state.activations.filter((a) => a.license_id === lic.id);
            return { ...lic, product, user, activations };
          };

          return {
            create: mock(async ({ data }: any) => {
              const product = state.products.find((p) => p.id === data.product) || data.product;
              const user = state.users.find((u) => u.id === data.user) || data.user;
              const license = {
                id: ++idCounter,
                ...data,
                product,
                user,
                status: data.status || "active",
                created_at: new Date().toISOString(),
                activations: [],
              };
              state.licenses.push(license);
              return license;
            }),
            findOne: mock(async ({ where }: any) => {
              const license = state.licenses.find((l) => l.id === where?.id || l.uid === where?.uid || l.order_item === where?.order_item);
              return populateLicense(license);
            }),
            findMany: mock(async ({ where }: any) => {
              let res = state.licenses;
              if (where?.order_item?.$in) {
                res = res.filter((l) => where.order_item.$in.includes(l.order_item));
              }
              if (where?.user) {
                res = res.filter((l) => (l.user?.id || l.user) === where.user);
              }
              return res.map(populateLicense);
            }),
            update: mock(async ({ where, data }: any) => {
              const license = state.licenses.find((l) => l.id === where?.id);
              if (license) Object.assign(license, data);
              return populateLicense(license);
            }),
          };
        }

        if (model === "plugin::license-server.activation") {
          return {
            findMany: mock(async ({ where }: any) => {
              if (where?.license_id?.$in) {
                return state.activations.filter((a) => where.license_id.$in.includes(a.license_id));
              }
              if (where?.license_id) {
                return state.activations.filter((a) => a.license_id === where.license_id);
              }
              return state.activations;
            }),
            update: mock(async ({ where, data }: any) => {
              const activation = state.activations.find((a) => a.id === where?.id);
              if (activation) Object.assign(activation, data);
              return activation;
            }),
            delete: mock(async ({ where }: any) => {
              const idx = state.activations.findIndex((a) => a.id === where?.id);
              if (idx !== -1) state.activations.splice(idx, 1);
              return { count: 1 };
            }),
          };
        }

        if (model === "plugin::license-server.plugin-version") {
          return {
            findOne: mock(async ({ where }: any) => {
              return state.pluginVersions.find((pv) => pv.product?.id === where?.product || pv.product_id === where?.product) || null;
            }),
            findMany: mock(async ({ where }: any) => {
              const productIds = Array.isArray(where?.product?.$in) ? where.product.$in : [where?.product];
              return state.pluginVersions.filter((pv) => productIds.includes(pv.product?.id || pv.product_id));
            }),
          };
        }

        if (model === "plugin::license-server.request-nonce" || model === "plugin::license-server.license-request-nonce") {
          return {
            findOne: mock(async ({ where }: any) => {
              const expiry = state.reservedNonces.get(where?.key);
              if (expiry && expiry > Date.now()) {
                return { key: where?.key, expires_at: new Date(expiry).toISOString() };
              }
              return null;
            }),
            findMany: mock(async ({ where }: any) => {
              const expiry = state.reservedNonces.get(where?.key);
              if (expiry && expiry > Date.now()) {
                return [{ key: where?.key, expires_at: new Date(expiry).toISOString() }];
              }
              return [];
            }),
            create: mock(async ({ data }: any) => {
              if (state.reservedNonces.has(data.key) && (state.reservedNonces.get(data.key) || 0) > Date.now()) {
                const err: any = new Error("Unique constraint failed");
                err.code = "23505";
                throw err;
              }
              state.reservedNonces.set(data.key, new Date(data.expires_at).getTime());
              return data;
            }),
            delete: mock(async ({ where }: any) => {
              state.reservedNonces.delete(where?.key);
              return { count: 1 };
            }),
          };
        }

        return {
          findOne: mock(async () => null),
          findMany: mock(async () => []),
          create: mock(async ({ data }: any) => data),
          update: mock(async ({ data }: any) => data),
          delete: mock(async () => ({ count: 1 })),
        };
      }),
    },
    plugin: mock((pluginName: string) => {
      if (pluginName === "license-server") {
        return {
          service: mock((serviceName: string) => {
            const actualServices: Record<string, any> = {
              crypto: freshRequire("../plugins/license-server/server/services/crypto"),
              purchase: freshRequire("../plugins/license-server/server/services/purchase"),
              license: freshRequire("../plugins/license-server/server/services/license"),
              coupon: freshRequire("../plugins/license-server/server/services/coupon"),
            };
            return actualServices[serviceName] || {};
          }),
        };
      }
      return {};
    }),
  };

  const webhookController = freshRequire("../plugins/license-server/server/controllers/webhook");

  const app = new Koa();
  app.use(async (ctx, next) => {
    if (ctx.method === "POST" || ctx.method === "PUT") {
      const buffers: Buffer[] = [];
      for await (const chunk of ctx.req) {
        buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawText = Buffer.concat(buffers).toString("utf8");
      if (rawText) {
        try {
          ctx.request.body = JSON.parse(rawText);
        } catch {
          ctx.request.body = {};
        }
      } else {
        ctx.request.body = {};
      }
    }

    const c = ctx as any;
    c.badRequest = (msg: string) => {
      ctx.status = 400;
      ctx.body = { error: msg };
      return ctx.body;
    };
    c.unauthorized = (msg: string) => {
      ctx.status = 401;
      ctx.body = { error: msg };
      return ctx.body;
    };
    c.forbidden = (msg: string) => {
      ctx.status = 403;
      ctx.body = { error: msg };
      return ctx.body;
    };
    c.notFound = (msg: string) => {
      ctx.status = 404;
      ctx.body = { error: msg };
      return ctx.body;
    };

    await next();
  });

  const router = new Router({ prefix: "/api/license-server" });
  router.post("/webhooks/payment", async (ctx) => {
    const result = await webhookController.handlePayment(ctx);
    if (result && ctx.status === 404) {
      ctx.body = result;
      ctx.status = 200;
    } else if (result && !ctx.body) {
      ctx.body = result;
    }
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  return { app, state, webhookController };
};

function buildWebhookHeaders({
  timestamp,
  eventId,
  body,
  secret = WEBHOOK_SECRET,
}: {
  timestamp: string;
  eventId: string;
  body: any;
  secret?: string;
}) {
  const payload = `${timestamp}.${eventId}.${JSON.stringify(body || {})}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "x-webhook-timestamp": timestamp,
    "x-webhook-id": eventId,
    "x-webhook-signature": `sha256=${signature}`,
    "Content-Type": "application/json",
  };
}

describe("Payment Webhooks End-to-End (E2E) Test Suite", () => {
  afterEach(() => {
    delete (global as any).strapi;
  });

  it("Scenario 1: Fulfills order, creates licenses and generates downloads on payment.succeeded", async () => {
    const { app, state } = createTestE2EHarness();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_paid_${Date.now()}`;

    const webhookBody = {
      event: "payment.succeeded",
      data: {
        order_id: 501,
        payment_id: "pi_stripe_test_123456789",
        expiration_days: 365,
      },
    };

    const headers = buildWebhookHeaders({
      timestamp,
      eventId,
      body: webhookBody,
    });

    const res = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(webhookBody);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.fulfillment).toBeDefined();
    expect(res.body.fulfillment.order.status).toBe("paid");
    expect(res.body.fulfillment.order.payment_id).toBe("pi_stripe_test_123456789");
    expect(res.body.fulfillment.licenses.length).toBe(1);
    expect(res.body.fulfillment.licenses[0].status).toBe("active");
    expect(res.body.fulfillment.licenses[0].activation_limit).toBe(3);
    expect(res.body.fulfillment.downloads.length).toBe(1);

    const updatedOrder = state.orders.find((o) => o.id === 501);
    expect(updatedOrder.status).toBe("paid");
    expect(state.licenses.length).toBe(1);
    expect(state.licenses[0].user.id || state.licenses[0].user).toBe(1);
  });

  it("Scenario 2: Blocks replay attacks when identical webhook eventId is re-sent", async () => {
    const { app } = createTestE2EHarness();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_replay_guard_${Date.now()}`;

    const webhookBody = {
      event: "payment.succeeded",
      data: {
        order_id: 501,
        payment_id: "pi_replay_123",
      },
    };

    const headers = buildWebhookHeaders({
      timestamp,
      eventId,
      body: webhookBody,
    });

    const firstRes = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(webhookBody);
    expect(firstRes.status).toBe(200);

    const replayRes = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(webhookBody);
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error).toContain("Webhook replay detected");
  });

  it("Scenario 3: Rejects tampered payloads with invalid HMAC signatures", async () => {
    const { app } = createTestE2EHarness();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_tampered_${Date.now()}`;

    const originalBody = {
      event: "payment.succeeded",
      data: { order_id: 501, payment_id: "pi_legit_100" },
    };

    const headers = buildWebhookHeaders({
      timestamp,
      eventId,
      body: originalBody,
    });

    const tamperedBody = {
      event: "payment.succeeded",
      data: { order_id: 999, payment_id: "pi_legit_100" },
    };

    const res = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(tamperedBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid signature");
  });

  it("Scenario 4: Rejects stale webhooks outside clock skew window", async () => {
    const { app } = createTestE2EHarness();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const eventId = `evt_stale_${Date.now()}`;

    const webhookBody = {
      event: "payment.succeeded",
      data: { order_id: 501, payment_id: "pi_stale_123" },
    };

    const headers = buildWebhookHeaders({
      timestamp: staleTimestamp,
      eventId,
      body: webhookBody,
    });

    const res = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(webhookBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Webhook timestamp outside allowed window");
  });

  it("Scenario 5: Revokes order licenses and deactivates active devices on payment.refunded", async () => {
    const { app, state } = createTestE2EHarness();

    state.orders[0].status = "paid";
    state.orders[0].payment_id = "pi_paid_to_be_refunded";

    const activeLicense = {
      id: 701,
      uid: "SAMPL-ACTIVE-REFUND-ME",
      status: "active",
      order: 501,
      order_item: 901,
      user: 1,
      revoked_at: null,
      revocation_reason: null,
      activations: [],
    };
    state.licenses.push(activeLicense);
    state.orderItems[0].license = activeLicense;
    state.orderItems[0].license_id = 701;

    state.activations.push(
      { id: 1, license_id: 701, device_fingerprint: "device-studio-1", revoked_at: null },
      { id: 2, license_id: 701, device_fingerprint: "device-laptop-2", revoked_at: null }
    );

    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_refund_${Date.now()}`;

    const refundBody = {
      event: "payment.refunded",
      data: {
        order_id: 501,
        reason: "Customer dispute chargeback",
      },
    };

    const headers = buildWebhookHeaders({
      timestamp,
      eventId,
      body: refundBody,
    });

    const res = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(refundBody);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(state.orders[0].status).toBe("refunded");

    const revokedLicense = state.licenses.find((l) => l.id === 701);
    expect(revokedLicense.status).toBe("revoked");
    expect(revokedLicense.revoked_at).toBeDefined();

    expect(state.activations.every((a) => a.revoked_at !== null)).toBe(true);
  });

  it("Scenario 6: Enforces IP allowlist filtering when webhookAllowedIps is configured", async () => {
    const { app } = createTestE2EHarness({
      webhookAllowedIps: ["198.51.100.5", "203.0.113.10"],
    });

    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_ip_filter_${Date.now()}`;
    const webhookBody = {
      event: "payment.succeeded",
      data: { order_id: 501 },
    };
    const headers = buildWebhookHeaders({ timestamp, eventId, body: webhookBody });

    const deniedRes = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set({ ...headers, "x-forwarded-for": "192.0.2.99" })
      .send(webhookBody);
    expect([401, 403]).toContain(deniedRes.status);
    expect(deniedRes.body.error).toContain("Webhook source not allowed");

    const allowedRes = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set({ ...headers, "x-forwarded-for": "198.51.100.5" })
      .send(webhookBody);
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.received).toBe(true);
  });

  it("Scenario 7: Rejects requests missing freshness headers or order_id gracefully", async () => {
    const { app } = createTestE2EHarness();

    const resNoHeaders = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .send({ event: "payment.succeeded", data: { order_id: 501 } });
    expect(resNoHeaders.status).toBe(401);
    expect(resNoHeaders.body.error).toContain("Missing webhook freshness headers");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `evt_no_order_${Date.now()}`;
    const bodyMissingOrder = { event: "payment.succeeded", data: {} };
    const headers = buildWebhookHeaders({ timestamp, eventId, body: bodyMissingOrder });

    const resNoOrder = await request(app.callback())
      .post("/api/license-server/webhooks/payment")
      .set(headers)
      .send(bodyMissingOrder);
    expect(resNoOrder.status).toBe(400);
    expect(resNoOrder.body.error).toContain("Missing order_id in payment data");
  });
});
