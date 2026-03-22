const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Purchase Service", () => {
  let service;
  let purchaseService;
  let licenseService;

  beforeEach(() => {
    licenseService = {
      generateLicenseKey: jest.fn(() => "VST-ABCDE-FGHIJ-KLMNP-QRSTU"),
      maskLicenseKey: jest.fn(() => "VST-*****-*****-*****-QRSTU"),
    };
    purchaseService = {
      fulfillPaidOrder: jest.fn(),
      revokeOrderLicenses: jest.fn(),
      getCustomerDownloads: jest.fn(),
    };

    global.strapi = {
      db: { query: jest.fn() },
      plugin: jest.fn(() => ({
        service: jest.fn((name) => (name === "license" ? licenseService : purchaseService)),
      })),
    };

    service = freshRequire("../../server/services/purchase");
  });

  it("fulfills a pending order and returns license plus download info", async () => {
    const orderFindOne = jest.fn().mockResolvedValue({
      id: 5,
      status: "pending",
      payment_id: null,
      total_amount_cents: 9999,
      currency: "USD",
      user: { id: 7 },
    });
    const orderUpdate = jest.fn().mockResolvedValue({
      id: 5,
      status: "paid",
      payment_id: "pay_1",
      paid_at: new Date("2026-03-05T00:00:00Z"),
      total_amount_cents: 9999,
      currency: "USD",
      user: { id: 7 },
    });
    const orderItemsFindMany = jest.fn().mockResolvedValue([
      { id: 20, quantity: 2, product: { id: 3, name: "Synth", slug: "synth", type: "plugin" } },
    ]);
    const licenseFindOne = jest.fn().mockResolvedValue(null);
    const licenseCreate = jest.fn().mockResolvedValue({
      id: 77,
      uid: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
      status: "active",
      activation_limit: 6,
      product: { id: 3, name: "Synth", slug: "synth", type: "plugin" },
    });
    const versionFindMany = jest.fn().mockResolvedValue([
      { id: 90, product: 3, version: "1.0.0", platform: "mac", is_latest: true, min_license_protocol_version: 1, download_url: "plugins/synth-1.0.0-mac.zip" },
    ]);

    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.order") return { findOne: orderFindOne, update: orderUpdate };
      if (uid === "plugin::license-server.order-item") return { findMany: orderItemsFindMany };
      if (uid === "plugin::license-server.license") return { findOne: licenseFindOne, create: licenseCreate };
      if (uid === "plugin::license-server.plugin-version") return { findMany: versionFindMany };
      return {};
    });

    const result = await service.fulfillPaidOrder({ orderId: 5, paymentId: "pay_1" });

    expect(licenseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ uid: "VST-ABCDE-FGHIJ-KLMNP-QRSTU", user: 7, product: 3, order_item: 20, activation_limit: 6 }),
    }));
    expect(result).toEqual({
      order: expect.objectContaining({
        id: 5,
        status: "paid",
        payment_id: "pay_1",
        order_reference: "LS-000005",
        receipt: expect.objectContaining({ total_items: 2, line_items: [expect.objectContaining({ quantity: 2, line_total_cents: null })] }),
        delivery_summary: expect.objectContaining({ plugin_count: 2, sample_pack_count: 0, license_count: 1, download_count: 1, ready_for_delivery: true }),
        post_purchase: expect.objectContaining({
          headline: "Your plugin purchase is ready",
          message: "Your license key and plugin download are available now.",
          primary_cta: expect.objectContaining({ type: "download_plugin", href: "/api/license-server/products/3/versions/90/download" }),
          secondary_cta: expect.objectContaining({ type: "view_licenses", href: "/api/license-server/me/licenses" }),
          email_hint: expect.objectContaining({ should_send: true, template_key: "plugin_purchase_ready" }),
        }),
      }),
      licenses: [
        expect.objectContaining({
          id: 77,
          license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
          license_key_masked: "VST-*****-*****-*****-QRSTU",
          primary_download: expect.objectContaining({ id: 90 }),
          downloads: [expect.objectContaining({ id: 90, download_endpoint: "/api/license-server/products/3/versions/90/download" })],
        }),
      ],
      downloads: [
        expect.objectContaining({
          id: 77,
          license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
          requires_license_key: true,
          primary_download: expect.objectContaining({ id: 90 }),
        }),
      ],
    });
  });

  it("reuses existing licenses for already paid orders and lists customer downloads", async () => {
    const existingLicense = {
      id: 77,
      uid: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
      status: "active",
      activation_limit: 3,
      product: { id: 3, name: "Synth", slug: "synth", type: "plugin" },
    };
    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.order") {
        return { findOne: jest.fn().mockResolvedValue({ id: 5, status: "paid", user: { id: 7 } }) };
      }
      if (uid === "plugin::license-server.order-item") {
        return { findMany: jest.fn().mockResolvedValue([{ id: 20, quantity: 1, product: { id: 3, name: "Synth", slug: "synth", type: "plugin" } }]) };
      }
      if (uid === "plugin::license-server.license") {
        return {
          findOne: jest.fn().mockResolvedValue(existingLicense),
          findMany: jest.fn().mockResolvedValue([existingLicense]),
          update: jest.fn().mockResolvedValue({}),
        };
      }
      if (uid === "plugin::license-server.plugin-version") {
        return { findMany: jest.fn().mockResolvedValue([{ id: 91, product: 3, version: "1.0.1", platform: "win", is_latest: true, download_url: "plugins/synth-1.0.1-win.zip" }]) };
      }
      return {};
    });

    const fulfilled = await service.fulfillPaidOrder({ orderId: 5, allowExistingPaid: true });
    const downloads = await service.getCustomerDownloads(7);

    expect(fulfilled.licenses).toHaveLength(1);
    expect(downloads).toEqual([
      expect.objectContaining({
        license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
        requires_license_key: true,
        primary_download: expect.objectContaining({ id: 91 }),
        downloads: [expect.objectContaining({ id: 91 })],
      }),
    ]);
  });

  it("includes pending first-activation claims in customer license payloads for cabinet confirmation", async () => {
    const existingLicense = {
      id: 77,
      uid: "VST-ABCDE-FGHIJ-KLMNP-QRSTU",
      status: "active",
      activation_limit: 3,
      product: { id: 3, name: "Synth", slug: "synth", type: "plugin" },
    };
    const pendingClaim = {
      id: 500,
      license: 77,
      status: "pending_confirmation",
      device_fingerprint: "new-device-fingerprint",
      key_hash: "abc123",
      csr_fingerprint: "def456",
      plugin_version: "1.2.3",
      platform: "mac",
      machine_id: "machine-1",
      request_ip: "127.0.0.1",
      risk_score: 25,
      risk_reasons: ["first_activation_requires_owner_confirmation"],
      attempt_count: 1,
      expires_at: "2026-03-06T12:15:00.000Z",
    };
    const activation = {
      id: 700,
      license_id: 77,
      device_fingerprint: "studio-mac-mini",
      certificate_serial: "CERT-700",
      platform: "mac",
      plugin_version: "1.2.3",
      requires_mtls: true,
      last_trust_level: 4,
      last_checkin: "2026-03-06T10:00:00.000Z",
      revoked_at: null,
      createdAt: "2026-03-05T10:00:00.000Z",
      updatedAt: "2026-03-06T10:00:00.000Z",
    };
    const pendingClaimFindMany = jest.fn().mockResolvedValue([
      {
        ...pendingClaim,
        license: { id: 77 },
      },
    ]);

    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.license") {
        return { findMany: jest.fn().mockResolvedValue([existingLicense]) };
      }
      if (uid === "plugin::license-server.activation") {
        return { findMany: jest.fn().mockResolvedValue([activation]) };
      }
      if (uid === "plugin::license-server.plugin-version") {
        return {
          findMany: jest.fn().mockResolvedValue([
            { id: 91, product: 3, version: "1.0.1", platform: "win", is_latest: true, download_url: "plugins/synth-1.0.1-win.zip" },
          ]),
        };
      }
      if (uid === "plugin::license-server.first-activation-claim") {
        return { findMany: pendingClaimFindMany };
      }
      return {};
    });

    const licenses = await service.getCustomerLicenses(7);

    expect(pendingClaimFindMany).toHaveBeenCalledWith({
      where: {
        license: { $in: [77] },
        status: "pending_confirmation",
      },
      populate: ["license"],
      orderBy: [{ createdAt: "desc" }],
    });

    expect(licenses).toEqual([
      expect.objectContaining({
        id: 77,
        activation_claims_endpoint: "/api/license-server/me/licenses/77/activation-claims",
        has_pending_activation_claim: true,
        activations_count: 1,
        active_activations_count: 1,
        available_activation_slots: 2,
        activations: [
          expect.objectContaining({
            id: 700,
            status: "active",
            device_fingerprint: "studio-mac-mini",
            trust_label: "mtls_signed",
            revoke_endpoint: "/api/license-server/me/licenses/77/activations/700/revoke",
          }),
        ],
        pending_activation_claims: [
          expect.objectContaining({
            id: 500,
            status: "pending_confirmation",
            device_fingerprint: "new-device-fingerprint",
            approve_endpoint:
              "/api/license-server/me/licenses/77/activation-claims/500/approve",
            reject_endpoint:
              "/api/license-server/me/licenses/77/activation-claims/500/reject",
          }),
        ],
      }),
    ]);
  });

  it("treats sample packs as download-only purchases without exposing a license key", async () => {
    const orderFindOne = jest.fn().mockResolvedValue({
      id: 8,
      status: "pending",
      payment_id: null,
      total_amount_cents: 2499,
      currency: "USD",
      user: { id: 11 },
    });
    const orderUpdate = jest.fn().mockResolvedValue({
      id: 8,
      status: "paid",
      payment_id: "pay_sample_pack",
      paid_at: new Date("2026-03-05T00:00:00Z"),
      total_amount_cents: 2499,
      currency: "USD",
      user: { id: 11 },
    });
    const orderItemsFindMany = jest.fn().mockResolvedValue([
      { id: 42, quantity: 1, product: { id: 9, name: "Drum Pack", slug: "drum-pack", type: "sample_pack" } },
    ]);
    const licenseFindOne = jest.fn().mockResolvedValue(null);
    const licenseCreate = jest.fn().mockResolvedValue({
      id: 88,
      uid: "DIG-ABCDE-FGHIJ-KLMNP-QRSTU",
      status: "active",
      activation_limit: 3,
      product: { id: 9, name: "Drum Pack", slug: "drum-pack", type: "sample_pack" },
    });
    const versionFindMany = jest.fn().mockResolvedValue([
      {
        id: 120,
        product: { id: 9, slug: "drum-pack" },
        version: "1.0.0",
        platform: "all",
        is_latest: true,
        file_size_bytes: 2048,
        download_url: "sample-packs/drum-pack-v1.zip",
      },
    ]);

    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.order") return { findOne: orderFindOne, update: orderUpdate };
      if (uid === "plugin::license-server.order-item") return { findMany: orderItemsFindMany };
      if (uid === "plugin::license-server.license") return { findOne: licenseFindOne, create: licenseCreate, findMany: jest.fn().mockResolvedValue([licenseCreate.mock.results?.[0]?.value]) };
      if (uid === "plugin::license-server.plugin-version") return { findMany: versionFindMany };
      return {};
    });

    const result = await service.fulfillPaidOrder({ orderId: 8, paymentId: "pay_sample_pack" });

    expect(result.licenses).toEqual([]);
    expect(result.order).toEqual(
      expect.objectContaining({
        order_reference: "LS-000008",
        delivery_summary: expect.objectContaining({ plugin_count: 0, sample_pack_count: 1, license_count: 0, download_count: 1, ready_for_delivery: true }),
        post_purchase: expect.objectContaining({
          headline: "Your sample pack is ready",
          primary_cta: expect.objectContaining({ type: "download_archive", href: "/api/license-server/products/9/versions/120/download" }),
          email_hint: expect.objectContaining({ should_send: true, template_key: "sample_pack_purchase_ready" }),
        }),
      }),
    );
    expect(result.downloads).toEqual([
      expect.objectContaining({
        id: 88,
        delivery: "archive",
        requires_license_key: false,
        primary_download: expect.objectContaining({ id: 120 }),
        archive_url: "/api/license-server/products/9/versions/120/download",
        archive_name: "drum-pack-v1.zip",
        file_size_bytes: 2048,
        product: expect.objectContaining({ type: "sample_pack" }),
        downloads: [expect.objectContaining({ id: 120 })],
      }),
    ]);
    expect(result.downloads[0]).not.toHaveProperty("license_key");

    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.license") {
        return { findMany: jest.fn().mockResolvedValue([{ id: 88, uid: "DIG-ABCDE-FGHIJ-KLMNP-QRSTU", status: "active", product: { id: 9, name: "Drum Pack", slug: "drum-pack", type: "sample_pack" } }]) };
      }
      if (uid === "plugin::license-server.plugin-version") {
        return { findMany: versionFindMany };
      }
      return {};
    });

    expect(await service.getCustomerLicenses(11)).toEqual([]);
    const downloads = await service.getCustomerDownloads(11);
    expect(downloads).toEqual([
      expect.objectContaining({
        id: 88,
        delivery: "archive",
        requires_license_key: false,
        primary_download: expect.objectContaining({ id: 120 }),
        archive_url: "/api/license-server/products/9/versions/120/download",
        archive_name: "drum-pack-v1.zip",
        file_size_bytes: 2048,
      }),
    ]);
    expect(downloads[0]).not.toHaveProperty("license_key");
  });

  it("falls back to a generated archive name when the sample-pack version has no direct file path", async () => {
    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.license") {
        return {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 99,
              uid: "DIG-ZZZZZ-YYYYY-XXXXX-WWWWW",
              status: "active",
              product: { id: 15, name: "FX Pack", slug: "fx-pack", type: "sample_pack" },
            },
          ]),
        };
      }
      if (uid === "plugin::license-server.plugin-version") {
        return {
          findMany: jest.fn().mockResolvedValue([
            { id: 130, product: { id: 15, slug: "fx-pack" }, version: "2.1.0", platform: "mac", is_latest: true, file_size_bytes: null, download_url: "?download=1" },
          ]),
        };
      }
      return {};
    });

    const downloads = await service.getCustomerDownloads(15);

    expect(downloads).toEqual([
      expect.objectContaining({
        primary_download: expect.objectContaining({ id: 130 }),
        archive_url: "/api/license-server/products/15/versions/130/download",
        archive_name: "fx-pack-mac-2.1.0.zip",
        file_size_bytes: null,
      }),
    ]);
  });

  it("decorates pending orders with receipt and order-status CTA even without detailed downloads", () => {
    const order = service.decorateOrderExperience({
      order: {
        id: 19,
        status: "pending",
        total_amount_cents: 3499,
        currency: "USD",
        user: {
          id: 42,
          email: "buyer@example.com",
          username: "buyer",
          password: "$2b$10$secret",
          resetPasswordToken: "reset-me",
          confirmationToken: "confirm-me",
        },
        items: [
          {
            id: 1,
            quantity: 1,
            price_at_purchase: 3499,
            product: { id: 12, name: "Bass Pack", slug: "bass-pack", type: "sample_pack" },
          },
        ],
      },
    });

    expect(order).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 42,
          email: "buyer@example.com",
          username: "buyer",
        }),
        order_reference: "LS-000019",
        receipt: expect.objectContaining({ total_items: 1, line_items: [expect.objectContaining({ line_total_cents: 3499 })] }),
        delivery_summary: expect.objectContaining({ sample_pack_count: 1, ready_for_delivery: false }),
        post_purchase: expect.objectContaining({
          headline: "Order created",
          primary_cta: expect.objectContaining({ type: "view_order", href: "/api/license-server/orders/19" }),
          email_hint: expect.objectContaining({ should_send: false, template_key: "sample_pack_purchase_pending" }),
        }),
      }),
    );
    expect(order.user).not.toHaveProperty("password");
    expect(order.user).not.toHaveProperty("resetPasswordToken");
    expect(order.user).not.toHaveProperty("confirmationToken");
  });

  it("blocks paid fulfillment when an order item has no downloadable asset", async () => {
    const orderFindOne = jest.fn().mockResolvedValue({
      id: 14,
      status: "pending",
      payment_id: null,
      total_amount_cents: 4999,
      currency: "USD",
      user: { id: 3 },
    });
    const orderUpdate = jest.fn().mockResolvedValue({ id: 14, status: "paid" });
    const orderItemsFindMany = jest.fn().mockResolvedValue([
      { id: 55, quantity: 1, product: { id: 4, name: "Broken Pack", slug: "broken-pack", type: "sample_pack" } },
    ]);
    const licenseCreate = jest.fn();
    const versionFindMany = jest.fn().mockResolvedValue([
      { id: 200, product: { id: 4, slug: "broken-pack" }, version: "1.0.0", platform: "all", is_latest: true, download_url: null },
    ]);

    global.strapi.db.query = jest.fn((uid) => {
      if (uid === "plugin::license-server.order") return { findOne: orderFindOne, update: orderUpdate };
      if (uid === "plugin::license-server.order-item") return { findMany: orderItemsFindMany };
      if (uid === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue(null), create: licenseCreate };
      if (uid === "plugin::license-server.plugin-version") return { findMany: versionFindMany };
      return {};
    });

    await expect(service.fulfillPaidOrder({ orderId: 14, paymentId: "pay_missing_asset" })).rejects.toMatchObject({
      code: "PRODUCT_NOT_DELIVERABLE",
      message: "Product Broken Pack has no downloadable asset available",
    });
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(licenseCreate).not.toHaveBeenCalled();
  });
});

