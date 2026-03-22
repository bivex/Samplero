"use strict";

const path = require("path");

const DEFAULT_ACTIVATION_LIMIT = 3;
const MY_DOWNLOADS_ENDPOINT = "/api/license-server/me/downloads";
const MY_LICENSES_ENDPOINT = "/api/license-server/me/licenses";
const buildOrderEndpoint = (orderId) => `/api/license-server/orders/${orderId}`;
const buildActivationClaimsEndpoint = (licenseId) =>
  `/api/license-server/me/licenses/${licenseId}/activation-claims`;
const buildApproveActivationClaimEndpoint = (licenseId, claimId) =>
  `/api/license-server/me/licenses/${licenseId}/activation-claims/${claimId}/approve`;
const buildRejectActivationClaimEndpoint = (licenseId, claimId) =>
  `/api/license-server/me/licenses/${licenseId}/activation-claims/${claimId}/reject`;
const buildRevokeActivationEndpoint = (licenseId, activationId) =>
  `/api/license-server/me/licenses/${licenseId}/activations/${activationId}/revoke`;

const buildDownloadEndpoint = (productId, versionId) =>
  `/api/license-server/products/${productId}/versions/${versionId}/download`;

const isPluginProduct = (product) => product?.type === "plugin";
const isSamplePackProduct = (product) => product?.type === "sample_pack";
const hasDownloadAsset = (version) =>
  typeof version?.download_url === "string" && version.download_url.trim().length > 0;
const ACTIVATION_TRUST_LABELS = {
  0: "none",
  1: "api_key",
  2: "mtls",
  3: "signed",
  4: "mtls_signed",
};

const serializeProduct = (product) =>
  product
    ? {
        id: product.id,
        name: product.name,
        slug: product.slug,
        type: product.type,
      }
    : null;

const buildOrderReference = (orderId) => `LS-${String(orderId || 0).padStart(6, "0")}`;

const buildArchiveName = (version, product) => {
  const source = version?.download_url ? String(version.download_url).split("?")[0] : "";
  const basename = source ? path.posix.basename(source) : "";

  if (basename && basename !== "/" && basename !== ".") {
    return basename;
  }

  return `${product?.slug || `product-${product?.id || "asset"}`}-${version?.platform || "bundle"}-${version?.version || "download"}.zip`;
};

async function getOrderItems(orderId) {
  return strapi.db.query("plugin::license-server.order-item").findMany({
    where: { order: orderId },
    populate: ["product", "license"],
  });
}

async function getVersionsByProductId(productIds) {
  if (!productIds.length) return new Map();

  const versions = await strapi.db.query("plugin::license-server.plugin-version").findMany({
    where: { product: { $in: productIds } },
    populate: ["product"],
    orderBy: [{ is_latest: "desc" }, { createdAt: "desc" }],
  });

  return versions.reduce((map, version) => {
    if (!hasDownloadAsset(version)) {
      return map;
    }

    const productId = version.product?.id || version.product;
    const row = {
      id: version.id,
      version: version.version,
      platform: version.platform,
      is_latest: !!version.is_latest,
      min_license_protocol_version: version.min_license_protocol_version,
      file_size_bytes: version.file_size_bytes ?? null,
      archive_name: buildArchiveName(version, version.product),
      download_endpoint: buildDownloadEndpoint(productId, version.id),
    };
    map.set(productId, [...(map.get(productId) || []), row]);
    return map;
  }, new Map());
}

async function getPendingClaimsByLicenseId(licenseIds) {
  const normalizedLicenseIds = [...new Set((licenseIds || []).filter(Boolean))];

  if (!normalizedLicenseIds.length) {
    return new Map();
  }

  const query = strapi.db.query("plugin::license-server.first-activation-claim");
  const claims = await query.findMany({
    where: {
      license: { $in: normalizedLicenseIds },
      status: "pending_confirmation",
    },
    populate: ["license"],
    orderBy: [{ createdAt: "desc" }],
  });

  return claims.reduce((map, claim) => {
    const licenseId = claim.license?.id || claim.license;
    if (!licenseId) {
      return map;
    }
    const summary = {
      id: claim.id,
      status: claim.status,
      device_fingerprint: claim.device_fingerprint,
      key_hash: claim.key_hash || null,
      csr_fingerprint: claim.csr_fingerprint || null,
      plugin_version: claim.plugin_version || null,
      platform: claim.platform || null,
      machine_id: claim.machine_id || null,
      request_ip: claim.request_ip || null,
      risk_score: claim.risk_score || 0,
      risk_reasons: claim.risk_reasons || [],
      attempt_count: claim.attempt_count || 0,
      expires_at: claim.expires_at,
      approve_endpoint: buildApproveActivationClaimEndpoint(licenseId, claim.id),
      reject_endpoint: buildRejectActivationClaimEndpoint(licenseId, claim.id),
    };

    map.set(licenseId, [...(map.get(licenseId) || []), summary]);
    return map;
  }, new Map());
}

function getActivationTrustLabel(level) {
  return ACTIVATION_TRUST_LABELS[Number(level)] || "unknown";
}

function toMillis(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function getActivationsByLicenseId(licenseIds) {
  const normalizedLicenseIds = [...new Set((licenseIds || []).filter(Boolean))];

  if (!normalizedLicenseIds.length) {
    return new Map();
  }

  const activationQuery = strapi.db.query("plugin::license-server.activation");

  if (typeof activationQuery?.findMany !== "function") {
    return new Map();
  }

  const activations = await activationQuery.findMany({
    where: { license_id: { $in: normalizedLicenseIds } },
  });

  return activations
    .slice()
    .sort((left, right) => {
      const leftRevoked = left?.revoked_at ? 1 : 0;
      const rightRevoked = right?.revoked_at ? 1 : 0;

      if (leftRevoked !== rightRevoked) {
        return leftRevoked - rightRevoked;
      }

      return (
        toMillis(right?.last_checkin || right?.updatedAt || right?.createdAt) -
        toMillis(left?.last_checkin || left?.updatedAt || left?.createdAt)
      );
    })
    .reduce((map, activation) => {
      const licenseId = activation.license_id || activation.license?.id;
      const summary = {
        id: activation.id,
        status: activation.revoked_at ? "revoked" : "active",
        active: !activation.revoked_at,
        device_fingerprint: activation.device_fingerprint || null,
        certificate_serial: activation.certificate_serial || null,
        platform: activation.platform || null,
        plugin_version: activation.plugin_version || null,
        requires_mtls: !!activation.requires_mtls,
        last_trust_level: activation.last_trust_level ?? 0,
        trust_label: getActivationTrustLabel(activation.last_trust_level),
        activated_at: activation.createdAt || null,
        updated_at: activation.updatedAt || null,
        last_check_in_at: activation.last_checkin || null,
        revoked_at: activation.revoked_at || null,
        revoke_endpoint: activation.revoked_at
          ? null
          : buildRevokeActivationEndpoint(licenseId, activation.id),
      };

      map.set(licenseId, [...(map.get(licenseId) || []), summary]);
      return map;
    }, new Map());
}

function createProductNotDeliverableError(product) {
  const productLabel = product?.name || `#${product?.id || "unknown"}`;
  const err = new Error(`Product ${productLabel} has no downloadable asset available`);
  err.code = "PRODUCT_NOT_DELIVERABLE";
  err.productId = product?.id || null;
  return err;
}

async function assertProductsDeliverable(products) {
  const normalizedProducts = products.filter(Boolean);

  if (!normalizedProducts.length) {
    return new Map();
  }

  const versionsByProduct = await getVersionsByProductId(
    [...new Set(normalizedProducts.map((product) => product.id).filter(Boolean))],
  );

  for (const product of normalizedProducts) {
    if (!versionsByProduct.get(product.id)?.length) {
      throw createProductNotDeliverableError(product);
    }
  }

  return versionsByProduct;
}

function serializePurchaseItem(license, versionsByProduct, licenseService) {
  const product = license.product;
  const productId = product?.id || license.product;
  const downloads = versionsByProduct.get(productId) || [];
  const primaryDownload = downloads[0] || null;
  const basePayload = {
    id: license.id,
    status: license.status,
    issued_at: license.issued_at,
    expires_at: license.expires_at,
    product: serializeProduct(product),
    downloads,
    primary_download: primaryDownload,
  };

  if (isSamplePackProduct(product)) {
    return {
      ...basePayload,
      delivery: "archive",
      requires_license_key: false,
      archive_url: primaryDownload?.download_endpoint || null,
      archive_name: primaryDownload?.archive_name || null,
      file_size_bytes: primaryDownload?.file_size_bytes ?? null,
    };
  }

  return {
    ...basePayload,
    license_key: license.uid,
    license_key_masked: licenseService.maskLicenseKey(license.uid),
    activation_limit: license.activation_limit,
    requires_license_key: isPluginProduct(product),
  };
}

function serializeOrderLineItem(item) {
  const quantity = Math.max(1, item?.quantity || 1);
  const unitPrice = item?.price_at_purchase ?? null;

  return {
    id: item?.id ?? null,
    quantity,
    unit_price_cents: unitPrice,
    line_total_cents: unitPrice == null ? null : unitPrice * quantity,
    product: serializeProduct(item?.product),
    has_license: !!item?.license,
  };
}

function getDeliveryCounts(orderItems, downloads, licenses) {
  const items = Array.isArray(orderItems) ? orderItems : [];
  const pluginCount = items
    .filter((item) => isPluginProduct(item?.product))
    .reduce((sum, item) => sum + Math.max(1, item?.quantity || 1), 0);
  const samplePackCount = items
    .filter((item) => isSamplePackProduct(item?.product))
    .reduce((sum, item) => sum + Math.max(1, item?.quantity || 1), 0);

  return {
    plugin_count: pluginCount,
    sample_pack_count: samplePackCount,
    license_count: Array.isArray(licenses) ? licenses.length : 0,
    download_count: Array.isArray(downloads) ? downloads.length : 0,
    total_items: items.reduce((sum, item) => sum + Math.max(1, item?.quantity || 1), 0),
  };
}

function buildEmailHint({ order, orderReference, deliveryCounts }) {
  const isMixed = deliveryCounts.plugin_count > 0 && deliveryCounts.sample_pack_count > 0;
  const templateBase = isMixed
    ? "mixed_purchase"
    : deliveryCounts.plugin_count > 0
      ? "plugin_purchase"
      : deliveryCounts.sample_pack_count > 0
        ? "sample_pack_purchase"
        : "order";

  if (order?.status === "paid") {
    return {
      should_send: true,
      template_key: `${templateBase}_ready`,
      subject: `Your order ${orderReference} is ready`,
    };
  }

  if (order?.status === "refunded") {
    return {
      should_send: true,
      template_key: `${templateBase}_refunded`,
      subject: `Order ${orderReference} refunded`,
    };
  }

  return {
    should_send: false,
    template_key: `${templateBase}_${order?.status || "updated"}`,
    subject: `Order ${orderReference} ${order?.status || "updated"}`,
  };
}

function buildPostPurchase({ order, orderReference, deliveryCounts, downloads = [], hasDetailedDownloads = false }) {
  const singleDownload = downloads.length === 1 ? downloads[0] : null;
  const couponMessage = order?.payment_method === "coupon" && order?.coupon_code
    ? ` Coupon ${order.coupon_code} covered the full order amount.`
    : "";

  if (order?.status === "paid") {
    if (deliveryCounts.sample_pack_count > 0 && deliveryCounts.plugin_count === 0) {
      return {
        headline: "Your sample pack is ready",
        message: singleDownload?.archive_name
          ? `${singleDownload.archive_name} is ready to download.${couponMessage}`
          : `Your archive is ready to download.${couponMessage}`,
        primary_cta:
          hasDetailedDownloads && singleDownload?.archive_url
            ? {
                type: "download_archive",
                label: singleDownload.archive_name
                  ? `Download ${singleDownload.archive_name}`
                  : "Download ZIP",
                href: singleDownload.archive_url,
              }
            : {
                type: "view_downloads",
                label: "Open My Downloads",
                href: MY_DOWNLOADS_ENDPOINT,
              },
        secondary_cta: {
          type: "view_order",
          label: "View Order",
          href: buildOrderEndpoint(order?.id),
        },
        email_hint: buildEmailHint({ order, orderReference, deliveryCounts }),
      };
    }

    if (deliveryCounts.plugin_count > 0 && deliveryCounts.sample_pack_count === 0) {
      return {
        headline: "Your plugin purchase is ready",
        message: `Your license key and plugin download are available now.${couponMessage}`,
        primary_cta:
          hasDetailedDownloads && singleDownload?.primary_download?.download_endpoint
            ? {
                type: "download_plugin",
                label: singleDownload.primary_download.archive_name
                  ? `Download ${singleDownload.primary_download.archive_name}`
                  : "Download Plugin",
                href: singleDownload.primary_download.download_endpoint,
              }
            : {
                type: "view_downloads",
                label: "Open My Downloads",
                href: MY_DOWNLOADS_ENDPOINT,
              },
        secondary_cta: {
          type: "view_licenses",
          label: "Open My Licenses",
          href: MY_LICENSES_ENDPOINT,
        },
        email_hint: buildEmailHint({ order, orderReference, deliveryCounts }),
      };
    }

    return {
      headline: "Your purchase is ready",
      message: `Your license keys and downloads are now available.${couponMessage}`,
      primary_cta: {
        type: "view_downloads",
        label: "Open My Downloads",
        href: MY_DOWNLOADS_ENDPOINT,
      },
      secondary_cta: {
        type: "view_licenses",
        label: "Open My Licenses",
        href: MY_LICENSES_ENDPOINT,
      },
      email_hint: buildEmailHint({ order, orderReference, deliveryCounts }),
    };
  }

  if (order?.status === "refunded") {
    return {
      headline: "Order refunded",
      message: "This order was refunded and related access may be revoked.",
      primary_cta: {
        type: "view_order",
        label: "View Order",
        href: buildOrderEndpoint(order?.id),
      },
      secondary_cta: null,
      email_hint: buildEmailHint({ order, orderReference, deliveryCounts }),
    };
  }

  return {
    headline: "Order created",
    message: "Your order is pending payment confirmation.",
    primary_cta: {
      type: "view_order",
      label: "View Order Status",
      href: buildOrderEndpoint(order?.id),
    },
    secondary_cta: null,
    email_hint: buildEmailHint({ order, orderReference, deliveryCounts }),
  };
}

function decorateOrderExperience({ order, orderItems = order?.items || [], downloads = [], licenses = [] }) {
  if (!order) {
    return null;
  }

  const lineItems = (Array.isArray(orderItems) ? orderItems : []).map(serializeOrderLineItem);
  const orderReference = buildOrderReference(order.id);
  const deliveryCounts = getDeliveryCounts(orderItems, downloads, licenses);
  const sanitizedUser = order.user
    ? {
        id: order.user.id ?? null,
        documentId: order.user.documentId ?? null,
        username: order.user.username ?? null,
        email: order.user.email ?? null,
        confirmed: order.user.confirmed ?? null,
        blocked: order.user.blocked ?? null,
      }
    : undefined;

  return {
    ...order,
    ...(sanitizedUser ? { user: sanitizedUser } : {}),
    order_reference: orderReference,
    receipt: {
      order_reference: orderReference,
      subtotal_amount_cents: order.subtotal_amount_cents ?? order.total_amount_cents ?? null,
      discount_amount_cents: order.discount_amount_cents ?? 0,
      total_amount_cents: order.total_amount_cents ?? null,
      currency: order.currency ?? null,
      coupon_code: order.coupon_code ?? null,
      payment_method: order.payment_method ?? null,
      total_items: deliveryCounts.total_items,
      line_items: lineItems,
    },
    delivery_summary: {
      ...deliveryCounts,
      ready_for_delivery: order.status === "paid",
    },
    post_purchase: buildPostPurchase({
      order,
      orderReference,
      deliveryCounts,
      downloads,
      hasDetailedDownloads: downloads.length > 0,
    }),
  };
}

async function serializePurchases(licenses) {
  const licenseService = strapi.plugin("license-server").service("license");
  const productIds = [
    ...new Set(licenses.map((license) => license.product?.id || license.product).filter(Boolean)),
  ];
  const versionsByProduct = await getVersionsByProductId(productIds);

  return licenses.map((license) => serializePurchaseItem(license, versionsByProduct, licenseService));
}

module.exports = {
  async assertProductsDeliverable(products) {
    return assertProductsDeliverable(products);
  },

  decorateOrderExperience({ order, orderItems, downloads = [], licenses = [] }) {
    return decorateOrderExperience({ order, orderItems, downloads, licenses });
  },

  async fulfillPaidOrder({ orderId, paymentId = null, expirationDays = null, allowExistingPaid = false }) {
    const orderQuery = strapi.db.query("plugin::license-server.order");
    const licenseQuery = strapi.db.query("plugin::license-server.license");
    const order = await orderQuery.findOne({
      where: { id: orderId },
      populate: ["user"],
    });

    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "pending" && !(allowExistingPaid && order.status === "paid")) {
      throw new Error("ORDER_NOT_PENDING");
    }

    const orderItems = await getOrderItems(orderId);
    await assertProductsDeliverable(orderItems.map((item) => item.product));

    const paidOrder =
      order.status === "paid"
        ? order
        : await orderQuery.update({
            where: { id: orderId },
            data: { status: "paid", paid_at: new Date(), payment_id: paymentId || order.payment_id },
            populate: ["user"],
          });

    const licenseService = strapi.plugin("license-server").service("license");
    const licenses = [];

    for (const item of orderItems) {
      let license = await licenseQuery.findOne({
        where: { order_item: item.id },
        populate: ["product", "user"],
      });

      if (!license) {
        license = await licenseQuery.create({
          data: {
            uid: licenseService.generateLicenseKey(item.product),
            user: paidOrder.user?.id || paidOrder.user,
            product: item.product?.id || item.product,
            order_item: item.id,
            status: "active",
            activation_limit: DEFAULT_ACTIVATION_LIMIT * Math.max(1, item.quantity || 1),
            issued_at: new Date(),
            expires_at: expirationDays
              ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
              : null,
          },
          populate: ["product", "user"],
        });
      }

      licenses.push(license);
    }

    const serializedPurchases = await serializePurchases(licenses);
    const serializedLicenses = serializedPurchases.filter((item) => isPluginProduct(item.product));

    return {
      order: decorateOrderExperience({
        order: {
        id: paidOrder.id,
        status: paidOrder.status,
        paid_at: paidOrder.paid_at,
        payment_id: paidOrder.payment_id,
        payment_method: paidOrder.payment_method,
        coupon_code: paidOrder.coupon_code,
        subtotal_amount_cents: paidOrder.subtotal_amount_cents,
        discount_amount_cents: paidOrder.discount_amount_cents,
        total_amount_cents: paidOrder.total_amount_cents,
        currency: paidOrder.currency,
        },
        orderItems,
        downloads: serializedPurchases,
        licenses: serializedLicenses,
      }),
      licenses: serializedLicenses,
      downloads: serializedPurchases,
    };
  },

  async revokeOrderLicenses({ orderId, reason = "payment.refunded" }) {
    const order = await strapi.db.query("plugin::license-server.order").findOne({
      where: { id: orderId },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const orderItems = await getOrderItems(orderId);
    const licenses = await strapi.db.query("plugin::license-server.license").findMany({
      where: { order_item: { $in: orderItems.map((item) => item.id) } },
    });
    for (const license of licenses) {
      await strapi.db.query("plugin::license-server.license").update({
        where: { id: license.id },
        data: { status: "revoked", revoked_at: new Date(), revocation_reason: reason },
      });
    }
    return licenses;
  },

  async getCustomerLicenses(userId) {
    const licenses = await strapi.db.query("plugin::license-server.license").findMany({
      where: { user: userId },
      populate: ["product", "user"],
      orderBy: { issued_at: "desc" },
    });
    const serializedPurchases = await serializePurchases(licenses);
    const pluginPurchases = serializedPurchases.filter((item) => isPluginProduct(item.product));
    const pendingClaimsByLicenseId = await getPendingClaimsByLicenseId(
      pluginPurchases.map((item) => item.id),
    );
    const activationsByLicenseId = await getActivationsByLicenseId(
      pluginPurchases.map((item) => item.id),
    );

    return pluginPurchases.map((item) => {
      const pendingClaims = pendingClaimsByLicenseId.get(item.id) || [];
      const activations = activationsByLicenseId.get(item.id) || [];
      const activeActivationsCount = activations.filter((activation) => activation.active).length;

      return {
        ...item,
        activations,
        activations_count: activations.length,
        active_activations_count: activeActivationsCount,
        available_activation_slots: Math.max(
          Number(item.activation_limit ?? DEFAULT_ACTIVATION_LIMIT) - activeActivationsCount,
          0,
        ),
        activation_claims_endpoint: buildActivationClaimsEndpoint(item.id),
        has_pending_activation_claim: pendingClaims.length > 0,
        pending_activation_claims: pendingClaims,
      };
    });
  },

  async getCustomerDownloads(userId) {
    const licenses = await strapi.db.query("plugin::license-server.license").findMany({
      where: { user: userId, status: "active" },
      populate: ["product", "user"],
      orderBy: { issued_at: "desc" },
    });
    return serializePurchases(licenses);
  },
};