const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Order Controller", () => {
  let controller;
  let ctx;
  let purchaseService;
  let couponService;

  const makeCtx = () => ({
    params: {},
    query: {},
    request: { body: {} },
    state: { user: { id: 7, role: { type: "authenticated" } } },
    throw: jest.fn(),
    notFound: jest.fn(),
    badRequest: jest.fn(),
    unauthorized: jest.fn(),
  });

  beforeEach(() => {
    ctx = makeCtx();
    purchaseService = {
      fulfillPaidOrder: jest.fn(),
      revokeOrderLicenses: jest.fn(),
      assertProductsDeliverable: jest.fn().mockResolvedValue(new Map()),
      decorateOrderExperience: jest.fn(({ order }) => ({
        ...order,
        order_reference: `LS-${String(order?.id || 0).padStart(6, "0")}`,
        receipt: { total_items: order?.items?.length || 0 },
        post_purchase: { headline: order?.status === "paid" ? "Ready" : "Order created" },
      })),
    };
    couponService = {
      resolveFullDiscountCoupon: jest.fn().mockResolvedValue(null),
      markCouponRedeemed: jest.fn().mockResolvedValue(null),
    };
    global.strapi = {
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      db: { query: jest.fn() },
      plugin: jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "coupon") return couponService;
          return purchaseService;
        }),
      })),
    };
    controller = freshRequire("../../server/controllers/order");
  });

  it("find returns paginated user orders", async () => {
    ctx.query = { status: "paid", limit: "5", offset: "10" };
    const findMany = jest.fn().mockResolvedValue([{ id: 1 }]);
    const count = jest.fn().mockResolvedValue(1);
    global.strapi.db.query = jest.fn(() => ({ findMany, count }));
    const result = await controller.find(ctx);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user: 7, status: "paid" }, limit: 5, offset: 10, populate: ["user", "items", "items.product", "items.license"] }));
    expect(purchaseService.decorateOrderExperience).toHaveBeenCalledWith({ order: { id: 1 } });
    expect(result).toEqual({
      orders: [expect.objectContaining({ id: 1, order_reference: "LS-000001", post_purchase: { headline: "Order created" } })],
      total: 1,
      limit: 5,
      offset: 10,
    });
  });

  it("find, findOne, and getItems require authentication", async () => {
    ctx.state.user = undefined;

    await controller.find(ctx);
    expect(ctx.unauthorized).toHaveBeenCalledWith("Authentication required");

    ctx.params = { id: 3 };
    await controller.findOne(ctx);
    expect(ctx.unauthorized).toHaveBeenCalledWith("Authentication required");

    await controller.getItems(ctx);
    expect(ctx.unauthorized).toHaveBeenCalledWith("Authentication required");
  });

  it("find does not scope admin-panel users with admin roles arrays", async () => {
    ctx.query = { status: "pending", limit: "2", offset: "0" };
    ctx.state.user = {
      id: 1,
      email: "admin@example.com",
      roles: [{ id: 1, code: "strapi-super-admin", name: "Super Admin" }],
    };
    const findMany = jest.fn().mockResolvedValue([{ id: 44, status: "pending" }]);
    const count = jest.fn().mockResolvedValue(1);
    global.strapi.db.query = jest.fn(() => ({ findMany, count }));

    const result = await controller.find(ctx);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "pending" },
      limit: 2,
      offset: 0,
    }));
    expect(result.total).toBe(1);
  });

  it("find applies search and sorting for admin review lists", async () => {
    ctx.query = {
      limit: "10",
      offset: "0",
      search: "bob",
      sortBy: "total_amount_cents",
      sortDir: "desc",
    };
    ctx.state.user = { id: 1, role: { type: "admin" } };
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 11,
        status: "paid",
        total_amount_cents: 1500,
        createdAt: "2026-03-01T10:00:00.000Z",
        user: { id: 7, email: "alice@example.com" },
        items: [{ product: { name: "Ultimate Synth Bundle" } }],
      },
      {
        id: 12,
        status: "paid",
        total_amount_cents: 2500,
        createdAt: "2026-03-02T10:00:00.000Z",
        user: { id: 8, email: "bob@example.com" },
        items: [{ product: { name: "Drum Master Pro" } }],
      },
    ]);
    global.strapi.db.query = jest.fn(() => ({ findMany, count: jest.fn() }));

    const result = await controller.find(ctx);

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      populate: ["user", "items", "items.product", "items.license"],
    });
    expect(result).toEqual({
      orders: [expect.objectContaining({ id: 12, order_reference: "LS-000012" })],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("find passes query errors to ctx.throw", async () => {
    const err = new Error("order find failed");
    global.strapi.db.query = jest.fn(() => ({ findMany: jest.fn().mockRejectedValue(err), count: jest.fn().mockResolvedValue(0) }));
    await controller.find(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("findOne scopes non-admin users and supports admin access", async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 3 });
    global.strapi.db.query = jest.fn(() => ({ findOne }));
    ctx.params = { id: 3 };
    await controller.findOne(ctx);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3, user: 7 } }));

    ctx.state.user.role.type = "admin";
    await controller.findOne(ctx);
    expect(findOne).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 3 } }));
  });

  it("findOne supports admin-panel users with admin roles arrays", async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 9 });
    global.strapi.db.query = jest.fn(() => ({ findOne }));
    ctx.params = { id: 9 };
    ctx.state.user = {
      id: 1,
      email: "admin@example.com",
      roles: [{ id: 1, code: "strapi-super-admin", name: "Super Admin" }],
    };

    await controller.findOne(ctx);

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9 } }));
  });

  it("findOne handles notFound and errors", async () => {
    ctx.params = { id: 11 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.findOne(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Order not found");

    const err = new Error("order lookup failed");
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
    await controller.findOne(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("create validates auth, items, missing products, inactive products, and errors", async () => {
    ctx.state.user = undefined;
    await controller.create(ctx);
    expect(ctx.unauthorized).toHaveBeenCalledWith("Authentication required");

    ctx = makeCtx();
    controller = freshRequire("../../server/controllers/order");
    await controller.create(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Order must have at least one item");

    ctx.request.body = { items: [{ product_id: 1, quantity: 1 }] };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.create(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Product 1 not found");

    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 1, name: "Synth", is_active: false, price_cents: 999 }) }));
    await controller.create(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Product Synth is not available");

    const deliverabilityError = new Error("Product Synth has no downloadable asset available");
    deliverabilityError.code = "PRODUCT_NOT_DELIVERABLE";
    purchaseService.assertProductsDeliverable.mockRejectedValueOnce(deliverabilityError);
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.product") {
        return { findOne: jest.fn().mockResolvedValue({ id: 1, name: "Synth", is_active: true, price_cents: 999 }) };
      }
      return { create: jest.fn() };
    });
    await controller.create(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Product Synth has no downloadable asset available");

    const err = new Error("order create failed");
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.product") return { findOne: jest.fn().mockResolvedValue({ id: 1, name: "Synth", is_active: true, price_cents: 999 }) };
      return { create: jest.fn().mockRejectedValue(err) };
    });
    await controller.create(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("create builds an order successfully", async () => {
    ctx.request.body = { payment_method: "card", items: [{ product_id: 1, quantity: 2 }, { product_id: 2 }] };
    const createOrder = jest.fn().mockResolvedValue({ id: 10 });
    const createOrderItem = jest.fn().mockResolvedValue({});
    const findCreatedOrder = jest.fn().mockResolvedValue({ id: 10, items: [{ id: 21 }, { id: 22 }] });
    const findProduct = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, name: "Synth", is_active: true, price_cents: 1000 })
      .mockResolvedValueOnce({ id: 2, name: "Pack", is_active: true, price_cents: 500 });
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.product") {
        return { findOne: findProduct };
      }
      if (model === "plugin::license-server.order") {
        return { create: createOrder, findOne: findCreatedOrder };
      }
      return { create: createOrderItem };
    });
    const result = await controller.create(ctx);
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user: 7, total_amount_cents: 2500, payment_method: "card" }) }));
    expect(purchaseService.assertProductsDeliverable).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1, name: "Synth" }),
      expect.objectContaining({ id: 2, name: "Pack" }),
    ]);
    expect(createOrderItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ order: 10, product: 1, quantity: 2, price_at_purchase: 1000 }) }));
    expect(createOrderItem).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ order: 10, product: 2, quantity: 1, price_at_purchase: 500 }) }));
    expect(purchaseService.decorateOrderExperience).toHaveBeenCalledWith({
      order: { id: 10, items: [{ id: 21 }, { id: 22 }] },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 10,
        items: [{ id: 21 }, { id: 22 }],
        order_reference: "LS-000010",
        receipt: { total_items: 2 },
      }),
    );
  });

  it("create instantly fulfills a fully discounted coupon order", async () => {
    ctx.request.body = { payment_method: "card", coupon_code: "FULLFREE2026", items: [{ product_id: 1, quantity: 1 }] };
    const createOrder = jest.fn().mockResolvedValue({ id: 10 });
    const createOrderItem = jest.fn().mockResolvedValue({});
    const findProduct = jest.fn().mockResolvedValue({ id: 1, name: "Synth", is_active: true, price_cents: 1000 });
    couponService.resolveFullDiscountCoupon.mockResolvedValue({
      coupon: { id: 99, code: "FULLFREE2026" },
      coupon_code: "FULLFREE2026",
      discount_amount_cents: 1000,
      total_amount_cents: 0,
      payment_method: "coupon",
      payment_id: "coupon:FULLFREE2026",
    });
    purchaseService.fulfillPaidOrder.mockResolvedValue({
      order: { id: 10, status: "paid", receipt: { coupon_code: "FULLFREE2026" } },
    });

    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.product") {
        return { findOne: findProduct };
      }
      if (model === "plugin::license-server.order") {
        return { create: createOrder };
      }
      return { create: createOrderItem };
    });

    const result = await controller.create(ctx);

    expect(couponService.resolveFullDiscountCoupon).toHaveBeenCalledWith({
      couponCode: "FULLFREE2026",
      subtotalAmountCents: 1000,
    });
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        total_amount_cents: 0,
        subtotal_amount_cents: 1000,
        discount_amount_cents: 1000,
        payment_method: "coupon",
        payment_id: "coupon:FULLFREE2026",
        coupon: 99,
        coupon_code: "FULLFREE2026",
      }),
    }));
    expect(purchaseService.fulfillPaidOrder).toHaveBeenCalledWith({
      orderId: 10,
      paymentId: "coupon:FULLFREE2026",
    });
    expect(couponService.markCouponRedeemed).toHaveBeenCalledWith({ couponId: 99 });
    expect(result).toEqual({ id: 10, status: "paid", receipt: { coupon_code: "FULLFREE2026" } });
  });

  it("create returns a bad request when coupon validation fails", async () => {
    ctx.request.body = { payment_method: "card", coupon_code: "BADCODE", items: [{ product_id: 1, quantity: 1 }] };
    const couponError = new Error("Coupon code is invalid");
    couponError.code = "COUPON_INVALID";
    couponService.resolveFullDiscountCoupon.mockRejectedValue(couponError);

    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.product") {
        return { findOne: jest.fn().mockResolvedValue({ id: 1, name: "Synth", is_active: true, price_cents: 1000 }) };
      }
      return { create: jest.fn() };
    });

    await controller.create(ctx);

    expect(ctx.badRequest).toHaveBeenCalledWith("Coupon code is invalid");
  });

  it("redeemCoupon validates auth and coupon input, scopes ownership, and fulfills paid coupon orders", async () => {
    ctx.state.user = undefined;
    ctx.params = { id: 10 };
    await controller.redeemCoupon(ctx);
    expect(ctx.unauthorized).toHaveBeenCalledWith("Authentication required");

    ctx = makeCtx();
    controller = freshRequire("../../server/controllers/order");
    ctx.params = { id: 10 };
    await controller.redeemCoupon(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Coupon code is required");

    ctx.request.body = { coupon_code: "FULLFREE2026" };
    const findOne = jest.fn().mockResolvedValue({
      id: 10,
      user: 7,
      status: "pending",
      subtotal_amount_cents: 1000,
      total_amount_cents: 1000,
      coupon_code: null,
      payment_method: "card",
    });
    const update = jest.fn().mockResolvedValue({});
    couponService.resolveFullDiscountCoupon.mockResolvedValue({
      coupon: { id: 99, code: "FULLFREE2026" },
      coupon_code: "FULLFREE2026",
      discount_amount_cents: 1000,
      total_amount_cents: 0,
      payment_method: "coupon",
      payment_id: "coupon:FULLFREE2026",
    });
    purchaseService.fulfillPaidOrder.mockResolvedValue({
      order: { id: 10, status: "paid", receipt: { coupon_code: "FULLFREE2026" } },
    });
    global.strapi.db.query = jest.fn(() => ({ findOne, update }));

    const result = await controller.redeemCoupon(ctx);

    expect(findOne).toHaveBeenCalledWith({ where: { id: 10, user: 7 } });
    expect(couponService.resolveFullDiscountCoupon).toHaveBeenCalledWith({
      couponCode: "FULLFREE2026",
      subtotalAmountCents: 1000,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({
        total_amount_cents: 0,
        subtotal_amount_cents: 1000,
        discount_amount_cents: 1000,
        payment_method: "coupon",
        payment_id: "coupon:FULLFREE2026",
        coupon: 99,
        coupon_code: "FULLFREE2026",
      }),
    });
    expect(purchaseService.fulfillPaidOrder).toHaveBeenCalledWith({ orderId: 10, paymentId: "coupon:FULLFREE2026" });
    expect(couponService.markCouponRedeemed).toHaveBeenCalledWith({ couponId: 99 });
    expect(result).toEqual({ id: 10, status: "paid", receipt: { coupon_code: "FULLFREE2026" } });
  });

  it("redeemCoupon rejects missing orders, non-pending orders, duplicate coupons, and invalid coupon codes", async () => {
    ctx.params = { id: 10 };
    ctx.request.body = { coupon_code: "FULLFREE2026" };

    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.redeemCoupon(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Order not found");

    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 10, user: 7, status: "paid" }) }));
    await controller.redeemCoupon(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Only pending orders can accept a coupon");

    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 10, user: 7, status: "pending", coupon_code: "OLD", payment_method: "coupon" }) }));
    await controller.redeemCoupon(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("A coupon is already applied to this order");

    const couponError = new Error("Coupon code is invalid");
    couponError.code = "COUPON_INVALID";
    couponService.resolveFullDiscountCoupon.mockRejectedValueOnce(couponError);
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 10, user: 7, status: "pending", subtotal_amount_cents: 1000, total_amount_cents: 1000 }) }));
    await controller.redeemCoupon(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Coupon code is invalid");
  });

  it("getItems scopes access, handles notFound, and errors", async () => {
    ctx.params = { id: 8 };
    const findOne = jest.fn().mockResolvedValueOnce({ id: 8 }).mockResolvedValueOnce(null);
    const findMany = jest.fn().mockResolvedValue([{ id: 1 }]);
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.order") return { findOne };
      return { findMany };
    });
    const result = await controller.getItems(ctx);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 8, user: 7 } }));
    expect(result).toEqual({ items: [{ id: 1 }] });

    ctx.state.user.role.type = "admin";
    await controller.getItems(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Order not found");

    const err = new Error("items failed");
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
    await controller.getItems(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("markAsPaid handles notFound, invalid status, success, and errors", async () => {
    ctx.params = { id: 5 };
    ctx.request.body = { payment_id: "pay_1" };
    const fulfillPaidOrder = jest.fn().mockRejectedValueOnce(new Error("ORDER_NOT_FOUND"));
    global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ fulfillPaidOrder })) }));
    await controller.markAsPaid(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Order not found");

    fulfillPaidOrder.mockRejectedValueOnce(new Error("ORDER_NOT_PENDING"));
    await controller.markAsPaid(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Order is not pending");

    const deliverabilityError = new Error("Product Drum Pack has no downloadable asset available");
    deliverabilityError.code = "PRODUCT_NOT_DELIVERABLE";
    fulfillPaidOrder.mockRejectedValueOnce(deliverabilityError);
    await controller.markAsPaid(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Product Drum Pack has no downloadable asset available");

    fulfillPaidOrder.mockResolvedValueOnce({
      order: { id: 5, status: "paid" },
      licenses: [{ id: 20, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU" }],
      downloads: [{ id: 20, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU" }],
    });
    const result = await controller.markAsPaid(ctx);
    expect(fulfillPaidOrder).toHaveBeenCalledWith({ orderId: 5, paymentId: "pay_1" });
    expect(result).toEqual({
      order: { id: 5, status: "paid" },
      licenses: [{ id: 20, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU" }],
      downloads: [{ id: 20, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU" }],
    });

    const err = new Error("mark paid failed");
    fulfillPaidOrder.mockRejectedValueOnce(err);
    await controller.markAsPaid(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("refund handles notFound, invalid status, success, and errors", async () => {
    ctx.params = { id: 9 };
    ctx.request.body = { reason: "duplicate" };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.refund(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Order not found");

    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 9, status: "pending", items: [] }) }));
    await controller.refund(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Only paid orders can be refunded");

    const updateOrder = jest.fn().mockResolvedValue({ id: 9, status: "refunded" });
    const revokeOrderLicenses = jest.fn().mockResolvedValue([{ id: 30 }, { id: 31 }]);
    global.strapi.plugin = jest.fn(() => ({ service: jest.fn(() => ({ revokeOrderLicenses })) }));
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.order") return { findOne: jest.fn().mockResolvedValue({ id: 9, status: "paid", items: [{ id: 100 }, { id: 101 }] }), update: updateOrder };
      return { findMany: jest.fn(), update: jest.fn() };
    });
    const result = await controller.refund(ctx);
    expect(revokeOrderLicenses).toHaveBeenCalledWith({ orderId: 9, reason: "Refunded: duplicate" });
    expect(result).toEqual({ id: 9, status: "refunded" });

    const err = new Error("refund failed");
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
    await controller.refund(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });
});