const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("activation-claim service", () => {
  let fixtures;
  let service;
  let claimQuery;
  let licenseQuery;
  let licenseService;

  const cloneLicenseFixture = (license) => ({
    ...license,
    user: license?.user ? { ...license.user } : license?.user,
    product: license?.product ? { ...license.product } : license?.product,
    activations: Array.isArray(license?.activations) ? [...license.activations] : license?.activations,
  });

  const clonePendingClaimFixture = (claim) => ({
    ...claim,
    license: claim?.license ? { ...claim.license } : claim?.license,
    owner_user: claim?.owner_user ? { ...claim.owner_user } : claim?.owner_user,
    risk_reasons: Array.isArray(claim?.risk_reasons) ? [...claim.risk_reasons] : claim?.risk_reasons,
    expires_at: new Date(Date.now() + 15 * 60 * 1000),
  });

  beforeEach(() => {
    const baseFixtures = require("../__fixtures__");
    fixtures = {
      ...baseFixtures,
      validLicense: cloneLicenseFixture(baseFixtures.validLicense),
      firstActivationClaim: clonePendingClaimFixture(baseFixtures.firstActivationClaim),
    };
    claimQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    licenseQuery = {
      findOne: jest.fn(),
    };
    licenseService = {
      finalizeFirstActivationClaim: jest.fn().mockResolvedValue({
        status: "approved",
        activation_id: 901,
      }),
    };

    global.strapi = {
      db: {
        query: jest.fn((uid) => {
          if (uid === "plugin::license-server.first-activation-claim") return claimQuery;
          if (uid === "plugin::license-server.license") return licenseQuery;
          throw new Error(`Unexpected query uid ${uid}`);
        }),
      },
      plugin: jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "license") return licenseService;
          return {};
        }),
      })),
    };

    service = freshRequire("../../server/services/activation-claim");
  });

  it("lists only serialized owner claims for the requested license", async () => {
    licenseQuery.findOne.mockResolvedValue(fixtures.validLicense);
    claimQuery.findMany.mockResolvedValue([fixtures.firstActivationClaim]);

    const claims = await service.listClaimsForOwner({
      ownerUserId: fixtures.validLicense.user.id,
      licenseId: fixtures.validLicense.id,
    });

    expect(claims).toEqual([
      expect.objectContaining({
        id: fixtures.firstActivationClaim.id,
        status: "pending_confirmation",
        license_id: fixtures.validLicense.id,
      }),
    ]);
    expect(claims[0].csr).toBeUndefined();
  });

  it("approves a pending claim and finalizes the first activation", async () => {
    claimQuery.findOne.mockResolvedValue(fixtures.firstActivationClaim);
    claimQuery.update.mockResolvedValue({
      ...fixtures.firstActivationClaim,
      status: "approved",
    });

    const result = await service.approveClaim({
      claimId: fixtures.firstActivationClaim.id,
      licenseId: fixtures.validLicense.id,
      actorUserId: fixtures.validLicense.user.id,
    });

    expect(licenseService.finalizeFirstActivationClaim).toHaveBeenCalledWith({
      claim: fixtures.firstActivationClaim,
    });
    expect(claimQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: fixtures.firstActivationClaim.id },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: "approved" }));
  });

  it("lists paginated admin claims with nested license context", async () => {
    claimQuery.findMany.mockResolvedValue([
      {
        ...fixtures.firstActivationClaim,
        license: fixtures.validLicense,
      },
    ]);
    claimQuery.count.mockResolvedValue(1);

    const result = await service.listClaimsForAdmin({
      status: "pending_confirmation",
      limit: "10",
      offset: "0",
    });

    expect(result).toEqual({
      claims: [
        expect.objectContaining({
          id: fixtures.firstActivationClaim.id,
          license: expect.objectContaining({ uid: fixtures.validLicense.uid }),
        }),
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("filters and sorts admin claims when search controls are used", async () => {
    claimQuery.findMany.mockResolvedValue([
      {
        ...fixtures.firstActivationClaim,
        device_fingerprint: "device-alpha",
        risk_score: 10,
        createdAt: "2026-03-06T12:00:00.000Z",
        license: {
          ...fixtures.validLicense,
          product: { id: 101, name: "Ultimate Synth Bundle", slug: "ultimate-synth-bundle" },
        },
        owner_user: { id: 1, email: "alice@example.com" },
      },
      {
        ...fixtures.firstActivationClaim,
        id: 501,
        device_fingerprint: "device-beta",
        risk_score: 90,
        createdAt: "2026-03-06T12:05:00.000Z",
        license: {
          ...fixtures.validLicense,
          uid: "license-uuid-bob",
          product: { id: 102, name: "Drum Master Pro", slug: "drum-master-pro" },
          user: { id: 2, email: "bob@example.com" },
        },
        owner_user: { id: 2, email: "bob@example.com" },
      },
    ]);

    const result = await service.listClaimsForAdmin({
      limit: "10",
      offset: "0",
      search: "bob",
      sortBy: "risk_score",
      sortDir: "desc",
    });

    expect(claimQuery.findMany).toHaveBeenCalledWith({
      where: {},
      populate: ["license", "license.user", "license.product", "owner_user", "approved_by"],
      orderBy: [{ createdAt: "desc" }],
    });
    expect(result).toEqual({
      claims: [expect.objectContaining({ id: 501, risk_score: 90 })],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("rejects a claim when another user tries to approve it", async () => {
    claimQuery.findOne.mockResolvedValue(fixtures.firstActivationClaim);

    await expect(
      service.approveClaim({
        claimId: fixtures.firstActivationClaim.id,
        licenseId: fixtures.validLicense.id,
        actorUserId: 999,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("marks a pending claim rejected with the owner reason", async () => {
    claimQuery.findOne.mockResolvedValue(fixtures.firstActivationClaim);
    claimQuery.update.mockResolvedValue({
      ...fixtures.firstActivationClaim,
      status: "rejected",
      rejection_reason: "not my device",
    });

    const result = await service.rejectClaim({
      claimId: fixtures.firstActivationClaim.id,
      licenseId: fixtures.validLicense.id,
      actorUserId: fixtures.validLicense.user.id,
      reason: "not my device",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "rejected",
        rejection_reason: "not my device",
      }),
    );
  });

  it("allows admins to approve and reject pending claims without owner scope", async () => {
    claimQuery.findOne.mockResolvedValue(fixtures.firstActivationClaim);
    claimQuery.update.mockResolvedValue({
      ...fixtures.firstActivationClaim,
      status: "rejected",
      rejection_reason: "admin_rejected",
    });

    await service.approveClaimAsAdmin({
      claimId: fixtures.firstActivationClaim.id,
      actorUserId: 777,
    });
    expect(licenseService.finalizeFirstActivationClaim).toHaveBeenCalledWith({
      claim: fixtures.firstActivationClaim,
    });

    const rejected = await service.rejectClaimAsAdmin({
      claimId: fixtures.firstActivationClaim.id,
      actorUserId: 777,
    });

    expect(rejected).toEqual(expect.objectContaining({ rejection_reason: "admin_rejected" }));
  });

  it("falls back to device_fingerprint when machine_id is missing", async () => {
    claimQuery.create.mockResolvedValue(fixtures.firstActivationClaim);

    await service.createPendingClaim({
      license: fixtures.validLicense,
      deviceFingerprint: "tauri-smoke-y4fq5zj811",
      pluginVersion: "1.0.0-demo",
      platform: "mac",
      riskScore: 25,
      riskReasons: ["first_activation_requires_owner_confirmation"],
    });

    expect(claimQuery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          device_fingerprint: "tauri-smoke-y4fq5zj811",
          machine_id: "tauri-smoke-y4fq5zj811",
        }),
      }),
    );
  });
});