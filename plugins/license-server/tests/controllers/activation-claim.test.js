const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

const createCtx = () => ({
  params: { licenseId: 1, claimId: 500 },
  state: { user: { id: 1 } },
  request: { body: {} },
  unauthorized: jest.fn(),
  forbidden: jest.fn(),
  notFound: jest.fn(),
  badRequest: jest.fn(),
  throw: jest.fn(),
});

describe("activation-claim controller", () => {
  let fixtures;
  let service;
  let controller;

  beforeEach(() => {
    fixtures = require("../__fixtures__");
    service = {
      listClaimsForAdmin: jest.fn().mockResolvedValue({
        claims: [fixtures.firstActivationClaim],
        total: 1,
        limit: 10,
        offset: 0,
      }),
      listClaimsForOwner: jest.fn().mockResolvedValue([fixtures.firstActivationClaim]),
      approveClaimAsAdmin: jest.fn().mockResolvedValue({ status: "approved", activation_id: 7 }),
      approveClaim: jest.fn().mockResolvedValue({ status: "approved", activation_id: 7 }),
      rejectClaimAsAdmin: jest.fn().mockResolvedValue({ status: "rejected", claim_id: 500 }),
      rejectClaim: jest.fn().mockResolvedValue({ status: "rejected", claim_id: 500 }),
    };
    global.strapi = {
      plugin: jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "activation-claim") return service;
          return {};
        }),
      })),
    };
    controller = freshRequire("../../server/controllers/activation-claim");
  });

  it("lists the current user's claims for a license", async () => {
    const ctx = createCtx();
    const result = await controller.listMine(ctx);

    expect(service.listClaimsForOwner).toHaveBeenCalledWith({
      ownerUserId: 1,
      licenseId: 1,
    });
    expect(result).toEqual([fixtures.firstActivationClaim]);
  });

  it("lists admin claims with pagination filters", async () => {
    const ctx = createCtx();
    ctx.query = {
      status: "pending_confirmation",
      limit: "10",
      offset: "0",
      search: "alice",
      sortBy: "risk_score",
      sortDir: "desc",
    };

    const result = await controller.listAdmin(ctx);

    expect(service.listClaimsForAdmin).toHaveBeenCalledWith({
      status: "pending_confirmation",
      limit: "10",
      offset: "0",
      search: "alice",
      sortBy: "risk_score",
      sortDir: "desc",
    });
    expect(result).toEqual(expect.objectContaining({ total: 1 }));
  });

  it("approves the claim for the authenticated owner", async () => {
    const ctx = createCtx();
    const result = await controller.approve(ctx);

    expect(service.approveClaim).toHaveBeenCalledWith({
      claimId: 500,
      licenseId: 1,
      actorUserId: 1,
    });
    expect(result).toEqual({ status: "approved", activation_id: 7 });
  });

  it("approves the claim for the authenticated admin", async () => {
    const ctx = createCtx();
    const result = await controller.approveAdmin(ctx);

    expect(service.approveClaimAsAdmin).toHaveBeenCalledWith({
      claimId: 500,
      actorUserId: 1,
    });
    expect(result).toEqual({ status: "approved", activation_id: 7 });
  });

  it("maps forbidden claim actions to 403", async () => {
    const ctx = createCtx();
    service.rejectClaim.mockRejectedValue(new Error("FORBIDDEN"));

    await controller.reject(ctx);

    expect(ctx.forbidden).toHaveBeenCalledWith("Forbidden");
  });

  it("passes admin rejection reasons through to the service", async () => {
    const ctx = createCtx();
    ctx.request.body = { reason: "high_risk" };

    await controller.rejectAdmin(ctx);

    expect(service.rejectClaimAsAdmin).toHaveBeenCalledWith({
      claimId: 500,
      actorUserId: 1,
      reason: "high_risk",
    });
  });
});