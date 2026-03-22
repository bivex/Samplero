describe("Coupon Service", () => {
  let couponService;
  let couponQuery;

  beforeEach(() => {
    couponQuery = {
      findMany: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    global.strapi = {
      db: {
        query: jest.fn(() => couponQuery),
      },
    };

    const resolved = require.resolve("../../server/services/coupon");
    if (require.cache?.[resolved]) delete require.cache[resolved];
    couponService = require("../../server/services/coupon");
  });

  it("lists coupons with serialized status metadata", async () => {
    couponQuery.findMany.mockResolvedValue([
      { id: 1, code: "fullfree2026", is_active: true, max_redemptions: 3, redemption_count: 1, starts_at: null, expires_at: null, notes: "Launch" },
    ]);

    const result = await couponService.listCoupons({ limit: 10, offset: 0 });

    expect(result).toEqual({
      coupons: [expect.objectContaining({
        id: 1,
        code: "FULLFREE2026",
        remaining_redemptions: 2,
        status_label: "redeemable",
        is_redeemable: true,
      })],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("resolves a valid full-discount coupon into a zero-total payment application", async () => {
    couponQuery.findOne.mockResolvedValue({
      id: 9,
      code: "FULLFREE2026",
      is_active: true,
      covers_full_amount: true,
      max_redemptions: 1,
      redemption_count: 0,
      starts_at: null,
      expires_at: null,
    });

    const result = await couponService.resolveFullDiscountCoupon({ couponCode: " fullfree2026 ", subtotalAmountCents: 2500 });

    expect(result).toEqual(expect.objectContaining({
      coupon: expect.objectContaining({ id: 9 }),
      coupon_code: "FULLFREE2026",
      discount_amount_cents: 2500,
      total_amount_cents: 0,
      payment_method: "coupon",
      payment_id: "coupon:FULLFREE2026",
    }));
  });

  it("rejects unavailable coupons and increments redemption counts for redeemed coupons", async () => {
    couponQuery.findOne
      .mockResolvedValueOnce({
        id: 9,
        code: "FULLFREE2026",
        is_active: true,
        covers_full_amount: true,
        max_redemptions: 1,
        redemption_count: 1,
        starts_at: null,
        expires_at: null,
      })
      .mockResolvedValueOnce({
        id: 9,
        code: "FULLFREE2026",
        is_active: true,
        max_redemptions: 3,
        redemption_count: 1,
      });
    couponQuery.update.mockResolvedValue({
      id: 9,
      code: "FULLFREE2026",
      is_active: true,
      max_redemptions: 3,
      redemption_count: 2,
    });

    await expect(
      couponService.resolveFullDiscountCoupon({ couponCode: "FULLFREE2026", subtotalAmountCents: 1000 }),
    ).rejects.toThrow("Coupon has no redemptions left");

    const redeemed = await couponService.markCouponRedeemed({ couponId: 9 });

    expect(couponQuery.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { redemption_count: 2 },
    });
    expect(redeemed).toEqual(expect.objectContaining({ redemption_count: 2, remaining_redemptions: 1 }));
  });
});