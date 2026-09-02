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
  redisStore: Map<string, { value: string; expiresAt: number }>;
}

const createAssetAndRateLimitHarness = () => {
  const state: TestState = {
    users: [
      { id: 1, email: "producer@example.com", username: "producer1", role: { type: "authenticated" } },
      { id: 2, email: "intruder@example.com", username: "intruder2", role: { type: "authenticated" } },
    ],
    products: [
      {
        id: 10,
        name: "Analog PolySynth VST",
        slug: "analog-polysynth",
        type: "plugin",
        price_cents: 14900,
        currency: "USD",
        max_activations: 2,
        is_active: true,
      },
      {
        id: 20,
        name: "Vintage Drum Machine VST",
        slug: "vintage-drum-machine",
        type: "plugin",
        price_cents: 9900,
        currency: "USD",
        max_activations: 1,
        is_active: true,
      },
      {
        id: 30,
        name: "Lo-Fi Beats Sample Pack",
        slug: "lo-fi-beats-pack",
        type: "sample_pack",
        price_cents: 2900,
        currency: "USD",
        is_active: true,
      },
    ],
    pluginVersions: [
      {
        id: 101,
        product: { id: 10, name: "Analog PolySynth VST", slug: "analog-polysynth", type: "plugin" },
        version: "1.2.0",
        platform: "mac",
        file_path: "plugins/polysynth-1.2.0-mac.pkg",
        download_url: "plugins/polysynth-1.2.0-mac.pkg",
        file_size_bytes: 45200000,
        min_license_protocol_version: 1,
        is_latest: true,
        changelog: "Apple Silicon native support",
        createdAt: "2026-03-01T00:00:00Z",
      },
      {
        id: 102,
        product: { id: 10, name: "Analog PolySynth VST", slug: "analog-polysynth", type: "plugin" },
        version: "1.2.0",
        platform: "windows",
        file_path: "plugins/polysynth-1.2.0-win.exe",
        download_url: "plugins/polysynth-1.2.0-win.exe",
        file_size_bytes: 48900000,
        min_license_protocol_version: 1,
        is_latest: true,
        changelog: "Windows 11 VST3 performance enhancements",
        createdAt: "2026-03-01T00:00:00Z",
      },
      {
        id: 103,
        product: { id: 10, name: "Analog PolySynth VST", slug: "analog-polysynth", type: "plugin" },
        version: "1.1.0",
        platform: "mac",
        file_path: "plugins/polysynth-1.1.0-mac.pkg",
        download_url: "plugins/polysynth-1.1.0-mac.pkg",
        file_size_bytes: 42100000,
        min_license_protocol_version: 1,
        is_latest: false,
        changelog: "Initial release",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: 301,
        product: { id: 30, name: "Lo-Fi Beats Sample Pack", slug: "lo-fi-beats-pack", type: "sample_pack" },
        version: "1.0.0",
        platform: "all",
        file_path: "samples/lo-fi-pack-wav-24bit.zip",
        download_url: "samples/lo-fi-pack-wav-24bit.zip",
        file_size_bytes: 850000000,
        is_latest: true,
        createdAt: "2026-02-15T00:00:00Z",
      },
    ],
    licenses: [
      {
        id: 501,
        uid: "VST-POLY-ACTIVE-USER1",
        user: { id: 1, email: "producer@example.com" },
        user_id: 1,
        product: { id: 10, name: "Analog PolySynth VST", slug: "analog-polysynth", type: "plugin" },
        product_id: 10,
        status: "active",
        issued_at: new Date().toISOString(),
      },
      {
        id: 502,
        uid: "VST-POLY-REVOKED-USER1",
        user: { id: 1, email: "producer@example.com" },
        user_id: 1,
        product: { id: 20, name: "Vintage Drum Machine VST", slug: "vintage-drum-machine", type: "plugin" },
        product_id: 20,
        status: "revoked",
        revoked_at: new Date().toISOString(),
        issued_at: new Date().toISOString(),
      },
      {
        id: 503,
        uid: "DIG-LOFI-ACTIVE-USER1",
        user: { id: 1, email: "producer@example.com" },
        user_id: 1,
        product: { id: 30, name: "Lo-Fi Beats Sample Pack", slug: "lo-fi-beats-pack", type: "sample_pack" },
        product_id: 30,
        status: "active",
        issued_at: new Date().toISOString(),
      },
    ],
    redisStore: new Map(),
  };

  const redisService = {
    get: mock(async (key: string) => {
      const entry = state.redisStore.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        state.redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: mock(async (key: string, value: string, mode?: string, ttlSeconds?: number) => {
      const ttl = ttlSeconds ? ttlSeconds * 1000 : 60000;
      state.redisStore.set(key, { value: String(value), expiresAt: Date.now() + ttl });
      return "OK";
    }),
    incr: mock(async (key: string) => {
      const entry = state.redisStore.get(key);
      const currentVal = entry ? parseInt(entry.value, 10) : 0;
      const newVal = currentVal + 1;
      const expiresAt = entry ? entry.expiresAt : Date.now() + 60000;
      state.redisStore.set(key, { value: String(newVal), expiresAt });
      return newVal;
    }),
  };

  const uploadProvider = {
    getSignedUrl: mock(async (filePath: string, options: { expiresIn: number }) => {
      return `https://s3.amazonaws.com/samplero-secure-vault/${filePath}?X-Amz-Security-Token=valid&X-Amz-Expires=${options.expiresIn}`;
    }),
  };

  (global as any).strapi = {
    log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    config: {
      get: mock((path: string, defaultValue: any) => {
        if (path === "plugin::license-server") {
          return {
            productSearchMinQueryLength: 2,
            productSearchCacheTtlSeconds: 60,
          };
        }
        return defaultValue;
      }),
    },
    plugin: mock((pluginName: string) => {
      if (pluginName === "redis") {
        return { service: mock(() => redisService) };
      }
      if (pluginName === "upload") {
        return { provider: uploadProvider };
      }
      if (pluginName === "meilisearch") {
        return {
          service: mock((name: string) => {
            if (name === "store") {
              return {
                syncCredentials: mock(async () => {}),
                getCredentials: mock(async () => ({ host: "http://127.0.0.1:7700", apiKey: "masterKey" })),
              };
            }
            if (name === "meilisearch") {
              return {
                getIndexNamesOfContentType: mock(() => ["product"]),
              };
            }
            return {};
          }),
        };
      }
      if (pluginName === "license-server") {
        return {
          service: mock((name: string) => {
            if (name === "purchase") {
              return purchaseService;
            }
            if (name === "license") {
              return {
                maskLicenseKey: mock((key: string) => (key ? `${key.slice(0, 4)}****` : "")),
              };
            }
            return {};
          }),
        };
      }
      return {};
    }),
    db: {
      query: mock((model: string) => {
        if (model === "plugin::license-server.product") {
          return {
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id) return state.products.find((p) => p.id === Number(where.id)) || null;
              if (where?.slug) return state.products.find((p) => p.slug === where.slug) || null;
              return null;
            }),
            findMany: mock(async ({ where }: any = {}) => {
              let items = [...state.products];
              if (where?.is_active !== undefined) items = items.filter((p) => p.is_active === where.is_active);
              if (where?.type) items = items.filter((p) => p.type === where.type);
              return items;
            }),
          };
        }

        if (model === "plugin::license-server.plugin-version" || model === "plugin::license-server.product-version") {
          return {
            findOne: mock(async ({ where }: any = {}) => {
              if (where?.id && where?.product) {
                return state.pluginVersions.find((v) => v.id === Number(where.id) && Number(v.product?.id || v.product) === Number(where.product)) || null;
              }
              if (where?.product && where?.is_latest) {
                return state.pluginVersions.find((v) => Number(v.product?.id || v.product) === Number(where.product) && v.is_latest) || null;
              }
              if (where?.id) {
                return state.pluginVersions.find((v) => v.id === Number(where.id)) || null;
              }
              return null;
            }),
            findMany: mock(async ({ where, orderBy }: any = {}) => {
              let items = [...state.pluginVersions];
              if (where?.product?.$in) {
                const ids = where.product.$in.map(Number);
                items = items.filter((v) => ids.includes(Number(v.product?.id || v.product)));
              } else if (where?.product) {
                items = items.filter((v) => Number(v.product?.id || v.product) === Number(where.product));
              }
              if (where?.platform) {
                if (typeof where.platform === "string") {
                  items = items.filter((v) => v.platform === where.platform || v.platform === "all");
                } else if (where.platform.$in) {
                  items = items.filter((v) => where.platform.$in.includes(v.platform) || v.platform === "all");
                }
              }
              if (orderBy?.version === "desc") {
                items.sort((a, b) => b.version.localeCompare(a.version));
              }
              return items;
            }),
          };
        }

        if (model === "plugin::license-server.license") {
          return {
            findOne: mock(async ({ where }: any = {}) => {
              return state.licenses.find((l) => {
                const matchUser = !where?.user || Number(l.user?.id || l.user_id || l.user) === Number(where.user);
                const matchProd = !where?.product || Number(l.product?.id || l.product_id || l.product) === Number(where.product);
                const matchStatus = !where?.status || l.status === where.status;
                return matchUser && matchProd && matchStatus;
              }) || null;
            }),
            findMany: mock(async ({ where }: any = {}) => {
              let items = [...state.licenses];
              if (where?.user) items = items.filter((l) => Number(l.user?.id || l.user_id || l.user) === Number(where.user));
              if (where?.status) items = items.filter((l) => l.status === where.status);
              return items;
            }),
          };
        }

        if (model === "plugin::license-server.first-activation-claim" || model === "plugin::license-server.activation-claim") {
          return {
            findMany: mock(async () => []),
          };
        }

        if (model === "plugin::license-server.activation") {
          return {
            findMany: mock(async () => []),
          };
        }

        return {};
      }),
    },
  };

  const purchaseService = freshRequire("../plugins/license-server/server/services/purchase");
  const productController = freshRequire("../plugins/license-server/server/controllers/product");
  const rateLimitPolicy = freshRequire("../plugins/license-server/server/policies/rate-limit");

  const app = new Koa();
  const router = new Router({ prefix: "/api/license-server" });

  // Error handling and context helpers
  app.use(async (ctx, next) => {
    try {
      const c = ctx as any;
      const authHeader = ctx.get("x-user-id");
      if (authHeader) {
        c.state = { user: state.users.find((u) => u.id === Number(authHeader)) || null };
      } else {
        c.state = { user: null };
      }

      c.notFound = (msg: string) => { ctx.status = 404; ctx.body = { error: msg }; return ctx.body; };
      c.badRequest = (msg: string) => { ctx.status = 400; ctx.body = { error: msg }; return ctx.body; };
      c.forbidden = (msg: string) => { ctx.status = 403; ctx.body = { error: msg }; return ctx.body; };
      c.unauthorized = (msg: string) => { ctx.status = 401; ctx.body = { error: msg }; return ctx.body; };
      c.tooManyRequests = (msg: string) => {
        ctx.status = 429;
        ctx.set("Retry-After", "60");
        ctx.body = { error: msg || "Rate limit exceeded" };
        return ctx.body;
      };
      c.throw = (status: any, message: any) => {
        const err = new Error(message?.message || message || "Request failed");
        (err as any).status = typeof status === "number" ? status : 500;
        throw err;
      };
      await next();
    } catch (err: any) {
      ctx.status = err.status || 500;
      ctx.body = { error: err.message };
    }
  });

  // Rate-limit middleware factory
  const applyRateLimit = (maxRequests: number, windowSeconds = 60) => async (ctx: any, next: any) => {
    const allowed = await rateLimitPolicy(ctx, { maxRequests, windowSeconds }, { strapi: (global as any).strapi });
    if (allowed === true) {
      await next();
    }
  };

  // Wire product and download routes
  router.get("/products", async (ctx) => { ctx.body = await productController.find(ctx); });
  router.get("/products/search", applyRateLimit(3, 60), async (ctx) => { ctx.body = await productController.search(ctx); });
  router.get("/products/:id/versions", async (ctx) => { ctx.body = await productController.getVersions(ctx); });
  router.get("/products/:id/versions/latest", async (ctx) => { ctx.body = await productController.getLatestVersion(ctx); });
  router.get("/products/:productId/versions/:versionId/download", async (ctx) => {
    ctx.body = await productController.getDownloadUrl(ctx);
  });
  router.get("/me/downloads", async (ctx) => { ctx.body = await productController.getMyDownloads(ctx); });

  app.use(router.routes());
  app.use(router.allowedMethods());

  const originalFetch = global.fetch;
  (global as any).fetch = mock(async (url: any, opts: any) => {
    if (String(url).includes("/indexes/product/search") || String(url).includes("/search")) {
      return new Response(
        JSON.stringify({
          hits: [
            {
              id: 10,
              name: "Analog PolySynth VST",
              slug: "analog-polysynth",
              type: "plugin",
              price_cents: 14900,
              is_active: true,
            },
          ],
          estimatedTotalHits: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(url, opts);
  });

  return {
    client: request(app.callback()),
    state,
    redisService,
    uploadProvider,
    productController,
    purchaseService,
    cleanup: () => {
      (global as any).fetch = originalFetch;
    },
  };
};

describe("Asset Downloads & Rate Limiting End-to-End (E2E) Suite", () => {
  afterEach(() => {
    delete (global as any).strapi;
  });

  it("Scenario 1: Secure Asset Download with Valid Active License generates Presigned S3 URL", async () => {
    const { client, uploadProvider } = createAssetAndRateLimitHarness();

    // Authenticated customer (User 1) requests download for version 101 of Analog PolySynth (Product 10)
    const res = await client
      .get("/api/license-server/products/10/versions/101/download")
      .set("x-user-id", "1")
      .expect(200);

    expect(res.body).toHaveProperty("download_url");
    expect(res.body.download_url).toContain("https://s3.amazonaws.com/samplero-secure-vault/plugins/polysynth-1.2.0-mac.pkg");
    expect(res.body.download_url).toContain("X-Amz-Expires=3600");
    expect(res.body).toHaveProperty("expires_at");

    // Verify S3 provider was invoked with correct TTL
    expect(uploadProvider.getSignedUrl).toHaveBeenCalledWith(
      "plugins/polysynth-1.2.0-mac.pkg",
      expect.objectContaining({ expiresIn: 3600 }),
    );
  });

  it("Scenario 2: Unauthorized Download Protection blocks unauthenticated and unentitled requests", async () => {
    const { client } = createAssetAndRateLimitHarness();

    // 1. Unauthenticated request without session -> 401 Unauthorized
    const unauthRes = await client
      .get("/api/license-server/products/10/versions/101/download")
      .expect(401);

    expect(unauthRes.body.error).toContain("Authentication required");

    // 2. User without any license for product 10 -> 403 Forbidden
    const unentitledUserRes = await client
      .get("/api/license-server/products/10/versions/101/download")
      .set("x-user-id", "2")
      .expect(403);

    expect(unentitledUserRes.body.error).toContain("No active license for this product");

    // 3. User 1 has Product 20, but the license is revoked -> 403 Forbidden
    const revokedLicenseRes = await client
      .get("/api/license-server/products/20/versions/101/download")
      .set("x-user-id", "1")
      .expect(403);

    expect(revokedLicenseRes.body.error).toContain("No active license for this product");
  });

  it("Scenario 3: Multi-Platform Binary Asset Resolution and Filtering", async () => {
    const { client } = createAssetAndRateLimitHarness();

    // 1. Request all versions for product 10
    const allVersionsRes = await client
      .get("/api/license-server/products/10/versions")
      .expect(200);

    expect(allVersionsRes.body.length).toBe(3);

    // 2. Filter by macOS platform
    const macVersionsRes = await client
      .get("/api/license-server/products/10/versions?platform=mac")
      .expect(200);

    expect(macVersionsRes.body.length).toBe(2);
    for (const v of macVersionsRes.body) {
      expect(["mac", "all"]).toContain(v.platform);
    }

    // 3. Filter by Windows platform
    const winVersionsRes = await client
      .get("/api/license-server/products/10/versions?platform=windows")
      .expect(200);

    expect(winVersionsRes.body.length).toBe(1);
    expect(winVersionsRes.body[0].platform).toBe("windows");
    expect(winVersionsRes.body[0].file_size_bytes).toBe(48900000);

    // 4. Latest version resolution
    const latestRes = await client
      .get("/api/license-server/products/10/versions/latest")
      .expect(200);

    expect(latestRes.body).toHaveProperty("version");
    expect(latestRes.body.version).toBe("1.2.0");

    // 5. Non-existent product versions -> 404
    await client
      .get("/api/license-server/products/999/versions/latest")
      .expect(404);
  });

  it("Scenario 4: Customer Cabinet Downloads Aggregation (/me/downloads)", async () => {
    const { client } = createAssetAndRateLimitHarness();

    // User 1 requests their entitled customer downloads hub
    const res = await client
      .get("/api/license-server/me/downloads")
      .set("x-user-id", "1")
      .expect(200);

    expect(res.body).toHaveProperty("downloads");
    expect(res.body).toHaveProperty("total");

    const downloads = res.body.downloads;
    // User 1 has active license for PolySynth (10) and Lo-Fi Pack (30), but revoked for Drum Machine (20)
    expect(downloads.length).toBe(2);

    const synthDownload = downloads.find((d: any) => d.product.id === 10);
    expect(synthDownload).toBeDefined();
    expect(synthDownload.product.type).toBe("plugin");
    expect(synthDownload.primary_download).toEqual(expect.objectContaining({
      version: "1.2.0",
      download_endpoint: "/api/license-server/products/10/versions/101/download",
    }));

    const samplePackDownload = downloads.find((d: any) => d.product.id === 30);
    expect(samplePackDownload).toBeDefined();
    expect(samplePackDownload.product.type).toBe("sample_pack");
    expect(samplePackDownload.requires_license_key).toBe(false);
    expect(samplePackDownload.license_key).toBeUndefined(); // Sample packs do not require VST license key
    expect(samplePackDownload.delivery).toBe("archive");
  });

  it("Scenario 5: Redis Distributed Rate-Limiting Protection (429 Too Many Requests & Retry-After)", async () => {
    const { client } = createAssetAndRateLimitHarness();

    // Threshold configured as 3 requests per 60 seconds
    // Request 1: OK
    await client
      .get("/api/license-server/products/search?q=analog")
      .expect(200);

    // Request 2: OK
    await client
      .get("/api/license-server/products/search?q=analog")
      .expect(200);

    // Request 3: OK (reaches max limit)
    await client
      .get("/api/license-server/products/search?q=analog")
      .expect(200);

    // Request 4: Rate limit triggered -> 429 Too Many Requests
    const rateLimitedRes = await client
      .get("/api/license-server/products/search?q=analog")
      .expect(429);

    expect(rateLimitedRes.body.error).toBe("Rate limit exceeded");
    expect(rateLimitedRes.headers["retry-after"]).toBe("60");
  });

  it("Scenario 6: Product Search Query Guard against Short Term Flooding", async () => {
    const { client } = createAssetAndRateLimitHarness();

    // 1-character query rejected to prevent database table scan flooding
    const shortQueryRes = await client
      .get("/api/license-server/products/search?q=a")
      .expect(400);

    expect(shortQueryRes.body.error).toContain("Search query must be at least 2 characters long");
  });
});
