const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Coupon Controller", () => {
  let controller;
  let ctx;
  let couponService;

  beforeEach(() => {
    ctx = {
      params: {},
      query: {},
      request: { body: {} },
      throw: jest.fn(),
      notFound: jest.fn((message) => ({ message })),
      badRequest: jest.fn((message) => ({ message })),
    };

    couponService = {
      listCoupons: jest.fn().mockResolvedValue({ coupons: [], total: 0, limit: 50, offset: 0 }),
      getCouponById: jest.fn(),
      createCoupon: jest.fn(),
      updateCoupon: jest.fn(),
    };

    global.strapi = {
      plugin: jest.fn(() => ({
        service: jest.fn(() => couponService),
      })),
    };

    controller = freshRequire("../../server/controllers/coupon");
  });

  it("lists coupons via the coupon service", async () => {
    ctx.query = { limit: "10", offset: "0", status: "redeemable" };

    const result = await controller.find(ctx);

    expect(couponService.listCoupons).toHaveBeenCalledWith({
      limit: "10",
      offset: "0",
      search: undefined,
      status: "redeemable",
    });
    expect(result.total).toBe(0);
  });

  it("creates and updates coupons, returning badRequest for missing code", async () => {
    couponService.createCoupon.mockResolvedValue({ id: 1, code: "FULLFREE2026" });
    ctx.request.body = { code: " fullfree2026 ", max_redemptions: "3" };

    const created = await controller.create(ctx);

    expect(couponService.createCoupon).toHaveBeenCalledWith(expect.objectContaining({
      code: " fullfree2026 ",
      max_redemptions: 3,
    }));
    expect(created).toEqual({ id: 1, code: "FULLFREE2026" });

    const requiredError = new Error("Coupon code is required");
    requiredError.code = "COUPON_CODE_REQUIRED";
    couponService.createCoupon.mockRejectedValueOnce(requiredError);
    const badRequestResult = await controller.create(ctx);
    expect(ctx.badRequest).toHaveBeenCalledWith("Coupon code is required");
    expect(badRequestResult).toEqual({ message: "Coupon code is required" });

    couponService.updateCoupon.mockResolvedValue({ id: 2, code: "PARTNERFREE" });
    ctx.params = { id: 2 };
    ctx.request.body = { code: "partnerfree", is_active: false };
    const updated = await controller.update(ctx);
    expect(couponService.updateCoupon).toHaveBeenCalledWith(2, expect.objectContaining({ code: "partnerfree", is_active: false }));
    expect(updated).toEqual({ id: 2, code: "PARTNERFREE" });
  });

  it("returns notFound when a coupon lookup misses", async () => {
    ctx.params = { id: 99 };
    couponService.getCouponById.mockResolvedValue(null);

    const result = await controller.findOne(ctx);

    expect(ctx.notFound).toHaveBeenCalledWith("Coupon not found");
    expect(result).toEqual({ message: "Coupon not found" });
  });
});