/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 05:08
 * Last Updated: 2026-03-05 05:08
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const PRODUCT_UID = "plugin::license-server.product";
const PRODUCT_SEARCH_CONTENT_TYPE = PRODUCT_UID;
const DEFAULT_PRODUCT_LIMIT = 20;
const DEFAULT_PRODUCT_SEARCH_LIMIT = 24;
const DEFAULT_PRODUCT_SEARCH_MIN_QUERY_LENGTH = 2;
const DEFAULT_PRODUCT_SEARCH_CACHE_TTL_SECONDS = 60;
const PRODUCT_SEARCH_CACHE_PREFIX = "product-search";
const productSearchMemoryCache = new Map();

const buildPlatformWhere = (platform) => {
  if (!platform) {
    return undefined;
  }

  if (platform === "all") {
    return "all";
  }

  return { $in: [platform, "all"] };
};

const normalizeInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeBoolean = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return Boolean(value);
};

const normalizePagination = ({ limit, offset, defaultLimit = DEFAULT_PRODUCT_LIMIT }) => ({
  limit: normalizeInteger(limit) ?? defaultLimit,
  offset: normalizeInteger(offset) ?? 0,
});

const getLicenseServerConfig = () => strapi.config?.get?.("plugin::license-server", {}) || {};

const getProductSearchConfig = () => {
  const config = getLicenseServerConfig();

  return {
    minQueryLength:
      normalizeInteger(config.productSearchMinQueryLength) ?? DEFAULT_PRODUCT_SEARCH_MIN_QUERY_LENGTH,
    cacheTtlSeconds:
      normalizeInteger(config.productSearchCacheTtlSeconds) ?? DEFAULT_PRODUCT_SEARCH_CACHE_TTL_SECONDS,
  };
};

const buildProductWhere = ({ type, is_active }) => {
  const where = {};

  if (type) where.type = type;
  if (is_active !== undefined) where.is_active = normalizeBoolean(is_active);

  return where;
};

const sanitizeCoverImageForStorefront = (coverImage) => {
  if (!coverImage || typeof coverImage !== "object") {
    return null;
  }

  return {
    url: coverImage.url || null,
    name: coverImage.name || null,
    alternativeText: coverImage.alternativeText || null,
  };
};

const sanitizeVersionForStorefront = (version) => ({
  id: version?.id,
  version: version?.version || null,
  platform: version?.platform || null,
  min_license_protocol_version: version?.min_license_protocol_version ?? null,
  file_size_bytes: version?.file_size_bytes ?? null,
  changelog: version?.changelog || null,
  is_latest: !!version?.is_latest,
});

const sanitizeVersionsForStorefront = (versions = []) =>
  Array.isArray(versions) ? versions.map((version) => sanitizeVersionForStorefront(version)) : [];

const sanitizeProductForStorefront = (product) => ({
  id: product?.id,
  name: product?.name || "",
  slug: product?.slug || null,
  type: product?.type || null,
  description: product?.description || "",
  price_cents: product?.price_cents ?? null,
  currency: product?.currency || null,
  cover_image: sanitizeCoverImageForStorefront(product?.cover_image),
});

const sanitizeProductDetailForStorefront = (product) => ({
  ...sanitizeProductForStorefront(product),
  ...(Array.isArray(product?.versions)
    ? { versions: sanitizeVersionsForStorefront(product.versions) }
    : {}),
});

const sanitizeProductsForStorefront = (products = []) =>
  Array.isArray(products) ? products.map((product) => sanitizeProductForStorefront(product)) : [];

const isStorefrontRequest = (ctx) => String(ctx.request?.path || "").startsWith("/api/license-server/");

const buildStorefrontProductListResponse = ({ products = [], total, limit, offset, query, cached }) => ({
  products: sanitizeProductsForStorefront(products),
  total,
  limit,
  offset,
  ...(query !== undefined ? { query } : {}),
  ...(cached ? { cached: true } : {}),
});

const pruneExpiredMemorySearchCache = () => {
  const now = Date.now();

  for (const [cacheKey, entry] of productSearchMemoryCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      productSearchMemoryCache.delete(cacheKey);
    }
  }
};

const buildProductSearchCacheKey = ({ query, limit, offset, type }) =>
  `${PRODUCT_SEARCH_CACHE_PREFIX}:${JSON.stringify({ query, limit, offset, type: type || null })}`;

const getRedisService = () => {
  const service = strapi.plugin("redis")?.service("default");

  if (!service || typeof service.get !== "function" || typeof service.set !== "function") {
    return null;
  }

  return service;
};

const getCachedProductSearch = async ({ cacheKey }) => {
  const redisService = getRedisService();

  if (redisService) {
    try {
      const cached = await redisService.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      strapi.log.warn("[Product] Redis search cache read failed:", err.message);
    }
  }

  pruneExpiredMemorySearchCache();
  const cached = productSearchMemoryCache.get(cacheKey);

  if (!cached || cached.expiresAt <= Date.now()) {
    productSearchMemoryCache.delete(cacheKey);
    return null;
  }

  return cached.value;
};

const setCachedProductSearch = async ({ cacheKey, value, ttlSeconds }) => {
  const redisService = getRedisService();

  if (redisService) {
    try {
      await redisService.set(cacheKey, JSON.stringify(value), "EX", ttlSeconds);
      return;
    } catch (err) {
      strapi.log.warn("[Product] Redis search cache write failed:", err.message);
    }
  }

  pruneExpiredMemorySearchCache();
  productSearchMemoryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

const listProducts = async ({ where, limit, offset }) => {
  const [products, total] = await Promise.all([
    strapi.db.query(PRODUCT_UID).findMany({
      where,
      populate: ["cover_image"],
      limit,
      offset,
      orderBy: { createdAt: "desc" },
    }),
    strapi.db.query(PRODUCT_UID).count({ where }),
  ]);

  return {
    products,
    total,
    limit,
    offset,
  };
};

const escapeMeiliFilterValue = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

const buildMeiliSearchFilters = ({ type, is_active }) => {
  const filters = [];

  if (type) {
    filters.push(`type = "${escapeMeiliFilterValue(type)}"`);
  }

  if (is_active !== undefined) {
    filters.push(`is_active = ${normalizeBoolean(is_active)}`);
  }

  return filters.length ? filters : undefined;
};

const getMeilisearchServices = () => {
  const plugin = strapi.plugin("meilisearch");

  if (!plugin) {
    return {};
  }

  return {
    store: plugin.service("store"),
    meilisearch: plugin.service("meilisearch"),
  };
};

const searchProductsInMeilisearch = async ({ query, limit, offset, type, is_active }) => {
  const { store, meilisearch } = getMeilisearchServices();

  if (!store || !meilisearch) {
    const error = new Error("Meilisearch plugin is not available");
    error.status = 503;
    throw error;
  }

  if (typeof store.syncCredentials === "function") {
    await store.syncCredentials();
  }

  const { host, apiKey } = await store.getCredentials();
  if (!host) {
    const error = new Error("Meilisearch is not configured");
    error.status = 503;
    throw error;
  }

  const [indexUid] = meilisearch.getIndexNamesOfContentType({
    contentType: PRODUCT_SEARCH_CONTENT_TYPE,
  });
  const searchUrl = new URL(`/indexes/${encodeURIComponent(indexUid)}/search`, host);
  const response = await fetch(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      q: query,
      limit,
      offset,
      filter: buildMeiliSearchFilters({ type, is_active }),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error?.message || `Meilisearch request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }

  return {
    products: Array.isArray(payload?.hits) ? payload.hits : [],
    total:
      typeof payload?.estimatedTotalHits === "number"
        ? payload.estimatedTotalHits
        : Array.isArray(payload?.hits)
          ? payload.hits.length
          : 0,
    limit,
    offset,
    query,
  };
};

const buildVersionPayload = (body = {}) => {
  const payload = {};

  ["version", "platform"].forEach((field) => {
    if (body[field] !== undefined) {
      payload[field] = body[field];
    }
  });

  ["build_hash", "download_url", "changelog"].forEach((field) => {
    if (body[field] !== undefined) {
      payload[field] = body[field] || null;
    }
  });

  const minProtocol = normalizeInteger(body.min_license_protocol_version);
  if (minProtocol !== undefined) {
    payload.min_license_protocol_version = minProtocol;
  }

  const fileSize = normalizeInteger(body.file_size_bytes);
  if (fileSize !== undefined) {
    payload.file_size_bytes = fileSize;
  }

  const isLatest = normalizeBoolean(body.is_latest);
  if (isLatest !== undefined) {
    payload.is_latest = isLatest;
  }

  return payload;
};

const syncLatestVersionForPlatform = async ({ productId, platform, excludeId }) => {
  const versionQuery = strapi.db.query("plugin::license-server.plugin-version");
  const currentLatest = await versionQuery.findMany({
    where: {
      product: productId,
      platform,
      is_latest: true,
    },
  });

  await Promise.all(
    (currentLatest || [])
      .filter((version) => version?.id !== excludeId)
      .map((version) =>
        versionQuery.update({
          where: { id: version.id },
          data: { is_latest: false },
        }),
      ),
  );
};

module.exports = {
  async find(ctx) {
    const { type, is_active } = ctx.query;
    const { limit, offset } = normalizePagination({
      limit: ctx.query.limit,
      offset: ctx.query.offset,
    });
    const storefrontRequest = isStorefrontRequest(ctx);
    const where = buildProductWhere({
      type,
      is_active: storefrontRequest ? true : is_active,
    });

    try {
      const response = await listProducts({ where, limit, offset });
      return storefrontRequest ? buildStorefrontProductListResponse(response) : response;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async search(ctx) {
    const { q, query, type } = ctx.query;
    const { limit, offset } = normalizePagination({
      limit: ctx.query.limit,
      offset: ctx.query.offset,
      defaultLimit: DEFAULT_PRODUCT_SEARCH_LIMIT,
    });
    const searchQuery = String(q ?? query ?? "").trim();
    const { minQueryLength, cacheTtlSeconds } = getProductSearchConfig();

    try {
      if (!searchQuery) {
        const response = await listProducts({
          where: buildProductWhere({ type, is_active: true }),
          limit,
          offset,
        });

        return buildStorefrontProductListResponse(response);
      }

      if (searchQuery.length < minQueryLength) {
        return ctx.badRequest(`Search query must be at least ${minQueryLength} characters long`);
      }

      const cacheKey = buildProductSearchCacheKey({ query: searchQuery, limit, offset, type });
      const cached = await getCachedProductSearch({ cacheKey });

      if (cached) {
        return {
          ...cached,
          cached: true,
        };
      }

      const response = await searchProductsInMeilisearch({
        query: searchQuery,
        limit,
        offset,
        type,
        is_active: true,
      });

      const storefrontResponse = buildStorefrontProductListResponse(response);
      await setCachedProductSearch({ cacheKey, value: storefrontResponse, ttlSeconds: cacheTtlSeconds });

      return storefrontResponse;
    } catch (err) {
      strapi.log.error("[Product] Search failed:", err.message);
      ctx.throw(err.status === 503 ? 503 : 502, err.message);
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;

    try {
      const product = await strapi.db
        .query(PRODUCT_UID)
        .findOne({
          where: { id },
          populate: ["cover_image", "versions"],
        });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      return product;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async findBySlug(ctx) {
    const { slug } = ctx.params;
    const storefrontRequest = isStorefrontRequest(ctx);

    try {
      const product = await strapi.db
        .query(PRODUCT_UID)
        .findOne({
          where: storefrontRequest ? { slug, is_active: true } : { slug },
          populate: ["cover_image", "versions"],
        });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      return storefrontRequest ? sanitizeProductDetailForStorefront(product) : product;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async create(ctx) {
    const { name, type, description, price_cents, currency, is_active } =
      ctx.request.body;

    try {
      const product = await strapi.db
        .query(PRODUCT_UID)
        .create({
          data: {
            name,
            type,
            description,
            price_cents,
            currency: currency || "USD",
            is_active: is_active !== false,
          },
        });

      return product;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async update(ctx) {
    const { id } = ctx.params;
    const updateData = ctx.request.body;

    try {
      const product = await strapi.db
        .query(PRODUCT_UID)
        .update({
          where: { id },
          data: updateData,
        });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      return product;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async delete(ctx) {
    const { id } = ctx.params;

    try {
      const product = await strapi.db
        .query(PRODUCT_UID)
        .findOne({
          where: { id },
        });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      await strapi.db.query(PRODUCT_UID).delete({
        where: { id },
      });

      return { deleted: true };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async getVersions(ctx) {
    const { id } = ctx.params;
    const { platform } = ctx.query;
    const storefrontRequest = isStorefrontRequest(ctx);

    try {
      if (storefrontRequest) {
        const product = await strapi.db.query(PRODUCT_UID).findOne({
          where: { id, is_active: true },
        });

        if (!product) {
          return ctx.notFound("Product not found");
        }
      }

      const where = { product: id };
      const platformWhere = buildPlatformWhere(platform);
      if (platformWhere) where.platform = platformWhere;

      const versions = await strapi.db
        .query("plugin::license-server.plugin-version")
        .findMany({
          where,
          orderBy: { version: "desc" },
        });

      return storefrontRequest ? sanitizeVersionsForStorefront(versions) : versions;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async createVersion(ctx) {
    const { id } = ctx.params;

    try {
      const product = await strapi.db.query(PRODUCT_UID).findOne({
        where: { id },
      });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      const payload = buildVersionPayload(ctx.request.body);

      if (payload.is_latest) {
        await syncLatestVersionForPlatform({
          productId: id,
          platform: payload.platform,
        });
      }

      return await strapi.db.query("plugin::license-server.plugin-version").create({
        data: {
          ...payload,
          product: id,
        },
      });
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async updateVersion(ctx) {
    const { id, versionId } = ctx.params;

    try {
      const versionQuery = strapi.db.query("plugin::license-server.plugin-version");
      const existingVersion = await versionQuery.findOne({
        where: { id: versionId, product: id },
      });

      if (!existingVersion) {
        return ctx.notFound("Version not found");
      }

      const payload = buildVersionPayload(ctx.request.body);
      const nextPlatform = payload.platform || existingVersion.platform;

      if (payload.is_latest) {
        await syncLatestVersionForPlatform({
          productId: id,
          platform: nextPlatform,
          excludeId: existingVersion.id,
        });
      }

      return await versionQuery.update({
        where: { id: versionId },
        data: payload,
      });
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async deleteVersion(ctx) {
    const { id, versionId } = ctx.params;

    try {
      const versionQuery = strapi.db.query("plugin::license-server.plugin-version");
      const existingVersion = await versionQuery.findOne({
        where: { id: versionId, product: id },
      });

      if (!existingVersion) {
        return ctx.notFound("Version not found");
      }

      await versionQuery.delete({
        where: { id: versionId },
      });

      return { deleted: true };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async getLatestVersion(ctx) {
    const { id } = ctx.params;
    const { platform } = ctx.query;
    const storefrontRequest = isStorefrontRequest(ctx);

    try {
      if (storefrontRequest) {
        const product = await strapi.db.query(PRODUCT_UID).findOne({
          where: { id, is_active: true },
        });

        if (!product) {
          return ctx.notFound("Product not found");
        }
      }

      const where = { product: id, is_latest: true };
      const platformWhere = buildPlatformWhere(platform);
      if (platformWhere) where.platform = platformWhere;

      const versions = await strapi.db
        .query("plugin::license-server.plugin-version")
        .findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { version: "desc" }],
        });

      if (!platform) {
        return storefrontRequest
          ? sanitizeVersionForStorefront(versions[0] || null)
          : versions[0] || null;
      }

      const version = (
        versions.find((version) => version.platform === platform) ||
        versions.find((version) => version.platform === "all") ||
        null
      );

      return storefrontRequest ? sanitizeVersionForStorefront(version) : version;
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async getMyDownloads(ctx) {
    const userId = ctx.state?.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const downloads = await strapi
        .plugin("license-server")
        .service("purchase")
        .getCustomerDownloads(userId);

      return {
        downloads,
        total: downloads.length,
      };
    } catch (err) {
      strapi.log.error("[Product] Get my downloads failed:", err.message);
      ctx.throw(500, err);
    }
  },

  async getDownloadUrl(ctx) {
    const { productId, versionId } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const license = await strapi.db
        .query("plugin::license-server.license")
        .findOne({
          where: {
            user: userId,
            product: productId,
            status: "active",
          },
        });

      if (!license) {
        return ctx.forbidden("No active license for this product");
      }

      const version = await strapi.db
        .query("plugin::license-server.plugin-version")
        .findOne({
          where: { id: versionId, product: productId },
        });

      if (!version) {
        return ctx.notFound("Version not found");
      }

      if (!version.download_url) {
        return ctx.notFound("Download not available");
      }

      const provider = strapi.plugin("upload").provider;
      let signedUrl;

      if (provider.getSignedUrl) {
        const urlPath = version.download_url.startsWith("http")
          ? version.download_url
          : version.download_url;

        signedUrl = await provider.getSignedUrl(urlPath, {
          expiresIn: 3600,
        });
      } else {
        signedUrl = version.download_url;
      }

      return {
        download_url: signedUrl,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
    } catch (err) {
      strapi.log.error("[Product] Get download URL failed:", err.message);
      ctx.throw(500, err);
    }
  },
};
