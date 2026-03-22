const crypto = require("crypto");

const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Webhook Controller", () => {
  let controller;
  let ctx;
  let purchaseService;
  let cryptoService;
  let pluginConfig;

  const sign = ({
    body,
    secret = "webhook-secret",
    timestamp = "1710000000",
    eventId = "evt-1",
  }) =>
    crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${eventId}.${JSON.stringify(body)}`)
      .digest("hex");

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    ctx = {
      request: { body: {}, headers: {} },
      ip: "203.0.113.10",
      unauthorized: jest.fn(),
      forbidden: jest.fn(),
      badRequest: jest.fn(),
      throw: jest.fn((status, message) => ({ status, message })),
    };
    purchaseService = {
      fulfillPaidOrder: jest.fn().mockResolvedValue({ order: { id: 1 }, licenses: [{ id: 2 }], downloads: [{ id: 2 }] }),
      revokeOrderLicenses: jest.fn().mockResolvedValue([]),
    };
    cryptoService = {
      reserveNonce: jest.fn().mockResolvedValue(true),
    };
    pluginConfig = {
      webhookSecret: "webhook-secret",
      webhookFreshnessMaxSkewSeconds: 300,
      webhookAllowedIps: [],
      requireFreshnessStore: true,
    };
    global.strapi = {
      config: {
        get: jest.fn((path, fallback) =>
          path === "plugin::license-server" ? pluginConfig : fallback
        ),
      },
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      db: { query: jest.fn() },
      plugin: jest.fn(() => ({
        service: jest.fn((name) =>
          name === "crypto" ? cryptoService : purchaseService
        ),
      })),
    };
    controller = freshRequire("../../server/controllers/webhook");
  });

  afterEach(() => {
    if (typeof jest.restoreAllMocks === "function") {
      jest.restoreAllMocks();
    }
  });

  it("rejects invalid signatures", async () => {
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-1";
    ctx.request.headers["x-webhook-signature"] = "bad";
    const result = await controller.handlePayment(ctx);
    expect(global.strapi.log.warn).toHaveBeenCalledWith("[Security] Webhook rejected: invalid signature");
    expect(ctx.unauthorized).toHaveBeenCalledWith("Invalid signature");
    expect(result).toBeUndefined();
  });

  it("rejects non-allowlisted webhook source IPs", async () => {
    pluginConfig.webhookAllowedIps = ["198.51.100.7"];
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-ip-block";
    ctx.request.headers["x-webhook-signature"] = sign({
      body: ctx.request.body,
      eventId: "evt-ip-block",
    });

    const result = await controller.handlePayment(ctx);

    expect(global.strapi.log.warn).toHaveBeenCalledWith(
      "[Security] Webhook rejected: source IP 203.0.113.10 is not allowlisted",
    );
    expect(ctx.forbidden).toHaveBeenCalledWith("Webhook source not allowed");
    expect(result).toBeUndefined();
  });

  it("accepts allowlisted webhook source IPs including forwarded IPv4 form", async () => {
    const createSpy = jest.spyOn(controller, "createLicenseFromPayment").mockResolvedValue({ order: { id: 1 } });
    pluginConfig.webhookAllowedIps = ["203.0.113.10"];
    ctx.request.ip = "::ffff:203.0.113.10";
    ctx.request.body = { event: "payment.succeeded", data: { order_id: "ord-1" } };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-ip-allow";
    ctx.request.headers["x-webhook-signature"] = sign({
      body: ctx.request.body,
      eventId: "evt-ip-allow",
    });

    const result = await controller.handlePayment(ctx);

    expect(createSpy).toHaveBeenCalledWith({ order_id: "ord-1" });
    expect(result).toEqual({ received: true, fulfillment: { order: { id: 1 } } });
  });

  it("rejects missing freshness headers", async () => {
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-signature"] = sign({ body: ctx.request.body });

    await controller.handlePayment(ctx);

    expect(global.strapi.log.warn).toHaveBeenCalledWith(
      "[Security] Webhook rejected: missing or invalid freshness headers",
    );
    expect(ctx.unauthorized).toHaveBeenCalledWith("Missing webhook freshness headers");
  });

  it("rejects stale webhook timestamps", async () => {
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-timestamp"] = "1709999000";
    ctx.request.headers["x-webhook-id"] = "evt-stale";
    ctx.request.headers["x-webhook-signature"] = sign({
      body: ctx.request.body,
      timestamp: "1709999000",
      eventId: "evt-stale",
    });

    await controller.handlePayment(ctx);

    expect(global.strapi.log.warn).toHaveBeenCalledWith(
      "[Security] Webhook rejected: stale timestamp for event evt-stale",
    );
    expect(ctx.unauthorized).toHaveBeenCalledWith("Webhook timestamp outside allowed window");
  });

  it("rejects replayed webhook events", async () => {
    cryptoService.reserveNonce.mockResolvedValue(false);
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-replay";
    ctx.request.headers["x-webhook-signature"] = sign({
      body: ctx.request.body,
      eventId: "evt-replay",
    });

    await controller.handlePayment(ctx);

    expect(global.strapi.log.warn).toHaveBeenCalledWith(
      "[Security] Webhook replay rejected for event evt-replay",
    );
    expect(ctx.unauthorized).toHaveBeenCalledWith("Webhook replay detected");
  });

  it("fails closed when freshness store is required but unavailable", async () => {
    cryptoService.reserveNonce.mockResolvedValue(null);
    ctx.request.body = { event: "payment.succeeded", data: {} };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-store-down";
    ctx.request.headers["x-webhook-signature"] = sign({
      body: ctx.request.body,
      eventId: "evt-store-down",
    });

    const result = await controller.handlePayment(ctx);

    expect(global.strapi.log.error).toHaveBeenCalledWith(
      "[Security] Webhook freshness store unavailable",
    );
    expect(ctx.throw).toHaveBeenCalledWith(503, "Webhook freshness store unavailable");
    expect(result).toEqual({ status: 503, message: "Webhook freshness store unavailable" });
  });

  it("handles succeeded, refunded, and unknown events", async () => {
    const createSpy = jest.spyOn(controller, "createLicenseFromPayment").mockResolvedValue({ order: { id: 1 } });
    const revokeSpy = jest.spyOn(controller, "revokeLicenseFromPayment").mockResolvedValue(undefined);

    ctx.request.body = { event: "payment.succeeded", data: { order_id: "ord-1" } };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-1";
    ctx.request.headers["x-webhook-signature"] = sign({ body: ctx.request.body, eventId: "evt-1" });
    const paidResult = await controller.handlePayment(ctx);
    expect(createSpy).toHaveBeenCalledWith({ order_id: "ord-1" });
    expect(paidResult).toEqual({ received: true, fulfillment: { order: { id: 1 } } });

    ctx.request.body = { event: "payment.refunded", data: { order_id: "ord-1" } };
    ctx.request.headers["x-webhook-id"] = "evt-2";
    ctx.request.headers["x-webhook-signature"] = sign({ body: ctx.request.body, eventId: "evt-2" });
    await controller.handlePayment(ctx);
    expect(revokeSpy).toHaveBeenCalledWith({ order_id: "ord-1" });

    ctx.request.body = { event: "payment.ignored", data: {} };
    ctx.request.headers["x-webhook-id"] = "evt-3";
    ctx.request.headers["x-webhook-signature"] = sign({ body: ctx.request.body, eventId: "evt-3" });
    const result = await controller.handlePayment(ctx);
    expect(global.strapi.log.info).toHaveBeenCalledWith("[Webhook] Unknown event: payment.ignored");
    expect(result).toEqual({ received: true });
  });

  it("returns badRequest when event processing fails", async () => {
    jest.spyOn(controller, "createLicenseFromPayment").mockRejectedValue(new Error("payment broken"));
    ctx.request.body = { event: "payment.succeeded", data: { order_id: "ord-1" } };
    ctx.request.headers["x-webhook-timestamp"] = "1710000000";
    ctx.request.headers["x-webhook-id"] = "evt-1";
    ctx.request.headers["x-webhook-signature"] = sign({ body: ctx.request.body, eventId: "evt-1" });
    const result = await controller.handlePayment(ctx);
    expect(global.strapi.log.error).toHaveBeenCalledWith("[Webhook] Processing failed:", expect.any(Error));
    expect(ctx.badRequest).toHaveBeenCalledWith("payment broken");
    expect(result).toBeUndefined();
  });

  it("creates licenses from payment data with and without expiration", async () => {
    const result = await controller.createLicenseFromPayment({ order_id: "ord-7", payment_id: "pay-7", expiration_days: 30 });
    expect(strapi.plugin().service().fulfillPaidOrder).toHaveBeenCalledWith({
      orderId: "ord-7",
      paymentId: "pay-7",
      expirationDays: 30,
      allowExistingPaid: true,
    });
    expect(global.strapi.log.info).toHaveBeenCalledWith("[Webhook] Fulfilled paid order ord-7");
    expect(result).toEqual({ order: { id: 1 }, licenses: [{ id: 2 }], downloads: [{ id: 2 }] });
  });

  it("revokes licenses from refunded payments", async () => {
    const result = await controller.revokeLicenseFromPayment({ order_id: "ord-9" });
    expect(strapi.plugin().service().revokeOrderLicenses).toHaveBeenCalledWith({
      orderId: "ord-9",
      reason: "Refunded: payment.refunded",
    });
    expect(global.strapi.log.info).toHaveBeenCalledWith("[Webhook] License revoked for order ord-9");
    expect(result).toBeUndefined();
  });
});