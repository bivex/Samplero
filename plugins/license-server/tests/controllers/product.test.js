/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05
 * Licensed under the MIT License.
 */

describe("Product Controller", () => {
  let productController;
  let mockCtx;
  let originalFetch;

  const mockProduct = {
    id: 1,
    name: "Test Product",
    slug: "test-product",
    type: "vst3",
    description: "Test description",
    price_cents: 4999,
    currency: "USD",
    is_active: true,
    cover_image: null,
    versions: [],
  };

  const mockVersion = {
    id: 1,
    version: "1.0.0",
    platform: "win",
    is_latest: true,
    download_url: "https://example.com/download",
  };

  beforeEach(() => {
    mockCtx = {
      params: {},
      query: {},
      request: { body: {}, path: "/license-server/products" },
      throw: jest.fn(),
      notFound: jest.fn((msg) => ({ message: msg })),
      badRequest: jest.fn(),
      forbidden: jest.fn(),
      unauthorized: jest.fn(),
    };

    global.strapi = {
      config: {
        get: jest.fn(() => ({
          freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
          requireFreshnessStore: false,
        })),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      config: {
        get: jest.fn((key, fallback) => {
          if (key === "plugin::license-server") {
            return {
              productSearchMinQueryLength: 2,
              productSearchCacheTtlSeconds: 60,
            };
          }

          return fallback;
        }),
      },
      db: {
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        })),
      },
      plugin: jest.fn(() => ({
        provider: {
          getSignedUrl: jest.fn().mockResolvedValue("https://signed-url.com/file"),
        },
        service: jest.fn(() => ({
          getCustomerDownloads: jest.fn().mockResolvedValue([
            { id: 1, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU", downloads: [] },
          ]),
        })),
      })),
    };

    originalFetch = global.fetch;
    global.fetch = jest.fn();

    const resolvedControllerPath = require.resolve("../../server/controllers/product");
    delete require.cache[resolvedControllerPath];
    productController = require("../../server/controllers/product");
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("find", () => {
    it("should return products with pagination", async () => {
      const products = [mockProduct];
      mockCtx.query = { limit: "20", offset: "0" };

      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue(products),
        count: jest.fn().mockResolvedValue(1),
      }));

      const result = await productController.find(mockCtx);

      expect(result.products).toEqual(products);
      expect(result.total).toBe(1);
    });

    it("should sanitize storefront product listings and force active-only filtering", async () => {
      mockCtx.request.path = "/api/license-server/products";
      mockCtx.query = { is_active: "false" };
      const findMany = jest.fn().mockResolvedValue([
        { ...mockProduct, documentId: "prod-doc", createdAt: "2026-03-06T00:00:00.000Z" },
      ]);

      strapi.db.query = jest.fn(() => ({
        findMany,
        count: jest.fn().mockResolvedValue(1),
      }));

      const result = await productController.find(mockCtx);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { is_active: true } }),
      );
      expect(result).toEqual({
        products: [
          expect.objectContaining({
            id: 1,
            name: "Test Product",
            slug: "test-product",
            cover_image: null,
          }),
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
      expect(result.products[0]).not.toHaveProperty("documentId");
      expect(result.products[0]).not.toHaveProperty("createdAt");
      expect(result.products[0]).not.toHaveProperty("is_active");
    });

    it("should filter by type", async () => {
      mockCtx.query = { type: "vst3" };

      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue([mockProduct]),
        count: jest.fn().mockResolvedValue(1),
      }));

      await productController.find(mockCtx);

      expect(strapi.db.query).toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("should return Meilisearch hits for storefront queries", async () => {
      mockCtx.query = {
        q: "synth",
        limit: "12",
        offset: "0",
        is_active: "true",
        type: "plugin",
      };

      const syncCredentials = jest.fn().mockResolvedValue(undefined);
      const getCredentials = jest
        .fn()
        .mockResolvedValue({ host: "http://127.0.0.1:7700", apiKey: "private-key" });
      const getIndexNamesOfContentType = jest.fn().mockReturnValue(["products"]);

      strapi.plugin = jest.fn((name) => {
        if (name === "meilisearch") {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === "store") {
                return { syncCredentials, getCredentials };
              }

              if (serviceName === "meilisearch") {
                return { getIndexNamesOfContentType };
              }

              return null;
            }),
          };
        }

        return {
          provider: {
            getSignedUrl: jest.fn().mockResolvedValue("https://signed-url.com/file"),
          },
          service: jest.fn(() => ({
            getCustomerDownloads: jest.fn().mockResolvedValue([]),
          })),
        };
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          hits: [mockProduct],
          estimatedTotalHits: 1,
        }),
      });

      const result = await productController.search(mockCtx);
      const [url, options] = global.fetch.mock.calls[0];

      expect(syncCredentials).toHaveBeenCalled();
      expect(getIndexNamesOfContentType).toHaveBeenCalledWith({
        contentType: "plugin::license-server.product",
      });
      expect(String(url)).toBe("http://127.0.0.1:7700/indexes/products/search");
      expect(options.headers.Authorization).toBe("Bearer private-key");
      expect(JSON.parse(options.body)).toEqual({
        q: "synth",
        limit: 12,
        offset: 0,
        filter: ['type = "plugin"', "is_active = true"],
      });
      expect(result.products).toEqual([
        {
          id: 1,
          name: "Test Product",
          slug: "test-product",
          type: "vst3",
          description: "Test description",
          price_cents: 4999,
          currency: "USD",
          cover_image: null,
        },
      ]);
      expect(result.total).toBe(1);
    });

    it("should fall back to the normal catalog response when query is empty", async () => {
      mockCtx.query = { q: "   ", limit: "24", offset: "0", is_active: "true" };
      const findMany = jest.fn().mockResolvedValue([mockProduct]);
      const count = jest.fn().mockResolvedValue(1);

      strapi.db.query = jest.fn(() => ({ findMany, count }));

      const result = await productController.search(mockCtx);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_active: true },
          limit: 24,
          offset: 0,
        }),
      );
      expect(result.products).toEqual([
        {
          id: 1,
          name: "Test Product",
          slug: "test-product",
          type: "vst3",
          description: "Test description",
          price_cents: 4999,
          currency: "USD",
          cover_image: null,
        },
      ]);
      expect(result.total).toBe(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should reject too-short queries", async () => {
      mockCtx.query = { q: "p" };

      await productController.search(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "Search query must be at least 2 characters long",
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should force is_active=true even when the request asks for inactive products", async () => {
      mockCtx.query = { q: "synth", is_active: "false" };

      const syncCredentials = jest.fn().mockResolvedValue(undefined);
      const getCredentials = jest
        .fn()
        .mockResolvedValue({ host: "http://127.0.0.1:7700", apiKey: "private-key" });
      const getIndexNamesOfContentType = jest.fn().mockReturnValue(["products"]);

      strapi.plugin = jest.fn((name) => {
        if (name === "meilisearch") {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === "store") {
                return { syncCredentials, getCredentials };
              }

              if (serviceName === "meilisearch") {
                return { getIndexNamesOfContentType };
              }

              return null;
            }),
          };
        }

        return null;
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [mockProduct], estimatedTotalHits: 1 }),
      });

      await productController.search(mockCtx);

      expect(JSON.parse(global.fetch.mock.calls[0][1].body).filter).toEqual(["is_active = true"]);
    });

    it("should cache repeated search results", async () => {
      mockCtx.query = { q: "cacheable-query" };

      const syncCredentials = jest.fn().mockResolvedValue(undefined);
      const getCredentials = jest
        .fn()
        .mockResolvedValue({ host: "http://127.0.0.1:7700", apiKey: "private-key" });
      const getIndexNamesOfContentType = jest.fn().mockReturnValue(["products"]);

      strapi.plugin = jest.fn((name) => {
        if (name === "meilisearch") {
          return {
            service: jest.fn((serviceName) => {
              if (serviceName === "store") {
                return { syncCredentials, getCredentials };
              }

              if (serviceName === "meilisearch") {
                return { getIndexNamesOfContentType };
              }

              return null;
            }),
          };
        }

        return null;
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [mockProduct], estimatedTotalHits: 1 }),
      });

      const firstResult = await productController.search(mockCtx);
      const secondResult = await productController.search(mockCtx);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(firstResult.cached).toBeUndefined();
      expect(secondResult.cached).toBe(true);
      expect(secondResult.products).toEqual(firstResult.products);
    });
  });

  describe("findOne", () => {
    it("should return product by id", async () => {
      mockCtx.params = { id: 1 };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(mockProduct),
      }));

      const result = await productController.findOne(mockCtx);

      expect(result.name).toBe("Test Product");
    });

    it("should return 404 for non-existent product", async () => {
      mockCtx.params = { id: 999 };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));

      await productController.findOne(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Product not found");
    });
  });

  describe("findBySlug", () => {
    it("should return product by slug", async () => {
      mockCtx.params = { slug: "test-product" };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(mockProduct),
      }));

      const result = await productController.findBySlug(mockCtx);

      expect(result.slug).toBe("test-product");
    });

    it("should sanitize storefront product detail responses", async () => {
      mockCtx.params = { slug: "test-product" };
      mockCtx.request.path = "/api/license-server/products/test-product";

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
          ...mockProduct,
          documentId: "prod-doc",
          versions: [{ ...mockVersion, build_hash: "build-1" }],
        }),
      }));

      const result = await productController.findBySlug(mockCtx);

      expect(result).toEqual({
        id: 1,
        name: "Test Product",
        slug: "test-product",
        type: "vst3",
        description: "Test description",
        price_cents: 4999,
        currency: "USD",
        cover_image: null,
        versions: [
          expect.objectContaining({
            id: 1,
            version: "1.0.0",
            platform: "win",
            is_latest: true,
          }),
        ],
      });
      expect(result).not.toHaveProperty("documentId");
      expect(result.versions[0]).not.toHaveProperty("download_url");
      expect(result.versions[0]).not.toHaveProperty("build_hash");
    });
  });

  describe("create", () => {
    it("should create product", async () => {
      mockCtx.request.body = {
        name: "New Product",
        type: "vst3",
        description: "Test",
        price_cents: 4999,
        currency: "USD",
      };

      strapi.db.query = jest.fn(() => ({
        create: jest.fn().mockResolvedValue(mockProduct),
      }));

      const result = await productController.create(mockCtx);

      expect(result).toBeDefined();
    });
  });

  describe("update", () => {
    it("should update product", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.request.body = { name: "Updated Name" };

      strapi.db.query = jest.fn(() => ({
        update: jest.fn().mockResolvedValue({ ...mockProduct, name: "Updated Name" }),
      }));

      const result = await productController.update(mockCtx);

      expect(result.name).toBe("Updated Name");
    });

    it("should return 404 for non-existent product", async () => {
      mockCtx.params = { id: 999 };
      mockCtx.request.body = { name: "Updated" };

      strapi.db.query = jest.fn(() => ({
        update: jest.fn().mockResolvedValue(null),
      }));

      await productController.update(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Product not found");
    });
  });

  describe("delete", () => {
    it("should delete product", async () => {
      mockCtx.params = { id: 1 };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(mockProduct),
        delete: jest.fn().mockResolvedValue({ id: 1 }),
      }));

      const result = await productController.delete(mockCtx);

      expect(result.deleted).toBe(true);
    });
  });

  describe("getVersions", () => {
    it("should return product versions", async () => {
      mockCtx.params = { id: 1 };

      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue([mockVersion]),
      }));

      const result = await productController.getVersions(mockCtx);

      expect(result).toHaveLength(1);
    });

    it("should sanitize storefront version responses", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.request.path = "/api/license-server/products/1/versions";

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.product") {
          return { findOne: jest.fn().mockResolvedValue({ id: 1, is_active: true }) };
        }

        return {
          findMany: jest.fn().mockResolvedValue([
            {
              ...mockVersion,
              build_hash: "build-1",
              min_license_protocol_version: 2,
              file_size_bytes: 4096,
              changelog: "Patch release",
            },
          ]),
        };
      });

      const result = await productController.getVersions(mockCtx);

      expect(result).toEqual([
        {
          id: 1,
          version: "1.0.0",
          platform: "win",
          min_license_protocol_version: 2,
          file_size_bytes: 4096,
          changelog: "Patch release",
          is_latest: true,
        },
      ]);
      expect(result[0]).not.toHaveProperty("download_url");
      expect(result[0]).not.toHaveProperty("build_hash");
    });

    it("should include platform-specific and cross-platform versions when filtering", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.query = { platform: "mac" };
      const findMany = jest.fn().mockResolvedValue([
        { ...mockVersion, id: 2, platform: "mac" },
        { ...mockVersion, id: 3, platform: "all" },
      ]);

      strapi.db.query = jest.fn(() => ({ findMany }));

      const result = await productController.getVersions(mockCtx);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product: 1,
            platform: { $in: ["mac", "all"] },
          }),
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe("createVersion", () => {
    it("should create a product version and clear previous latest on the same platform", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.request.body = {
        version: "1.2.0",
        platform: "win",
        min_license_protocol_version: "2",
        file_size_bytes: "4096",
        is_latest: true,
      };

      const productQuery = { findOne: jest.fn().mockResolvedValue(mockProduct) };
      const versionQuery = {
        findMany: jest.fn().mockResolvedValue([{ ...mockVersion, id: 99, platform: "win" }]),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ ...mockVersion, id: 2, version: "1.2.0" }),
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.product") return productQuery;
        return versionQuery;
      });

      const result = await productController.createVersion(mockCtx);

      expect(versionQuery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product: 1, platform: "win", is_latest: true }),
        }),
      );
      expect(versionQuery.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { is_latest: false },
      });
      expect(versionQuery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            product: 1,
            version: "1.2.0",
            platform: "win",
            min_license_protocol_version: 2,
            file_size_bytes: 4096,
            is_latest: true,
          }),
        }),
      );
      expect(result.id).toBe(2);
    });
  });

  describe("updateVersion", () => {
    it("should update an existing version and preserve platform latest uniqueness", async () => {
      mockCtx.params = { id: 1, versionId: 5 };
      mockCtx.request.body = {
        version: "1.2.1",
        is_latest: true,
      };

      const versionQuery = {
        findOne: jest.fn().mockResolvedValue({ ...mockVersion, id: 5, product: 1, platform: "win" }),
        findMany: jest.fn().mockResolvedValue([
          { ...mockVersion, id: 5, platform: "win" },
          { ...mockVersion, id: 6, platform: "win" },
        ]),
        update: jest.fn().mockResolvedValue({ ...mockVersion, id: 5, version: "1.2.1" }),
      };

      strapi.db.query = jest.fn(() => versionQuery);

      const result = await productController.updateVersion(mockCtx);

      expect(versionQuery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product: 1, platform: "win", is_latest: true }),
        }),
      );
      expect(versionQuery.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { is_latest: false },
      });
      expect(versionQuery.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { version: "1.2.1", is_latest: true },
      });
      expect(result.version).toBe("1.2.1");
    });

    it("should return 404 when updating a missing version", async () => {
      mockCtx.params = { id: 1, versionId: 999 };

      const versionQuery = { findOne: jest.fn().mockResolvedValue(null) };
      strapi.db.query = jest.fn(() => versionQuery);

      await productController.updateVersion(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Version not found");
    });
  });

  describe("deleteVersion", () => {
    it("should delete an existing version", async () => {
      mockCtx.params = { id: 1, versionId: 5 };

      const versionQuery = {
        findOne: jest.fn().mockResolvedValue({ ...mockVersion, id: 5, product: 1 }),
        delete: jest.fn().mockResolvedValue({ id: 5 }),
      };
      strapi.db.query = jest.fn(() => versionQuery);

      const result = await productController.deleteVersion(mockCtx);

      expect(versionQuery.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("getLatestVersion", () => {
    it("should return latest version", async () => {
      mockCtx.params = { id: 1 };

      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue([mockVersion]),
      }));

      const result = await productController.getLatestVersion(mockCtx);

      expect(result).toBeDefined();
    });

    it("should fall back to a cross-platform asset when no exact platform latest version exists", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.query = { platform: "mac" };
      const allVersion = { ...mockVersion, id: 4, platform: "all" };
      const findMany = jest.fn().mockResolvedValue([allVersion]);

      strapi.db.query = jest.fn(() => ({ findMany }));

      const result = await productController.getLatestVersion(mockCtx);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product: 1,
            is_latest: true,
            platform: { $in: ["mac", "all"] },
          }),
        }),
      );
      expect(result).toEqual(allVersion);
    });

    it("should prefer an exact platform latest version over a cross-platform asset", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.query = { platform: "mac" };
      const macVersion = { ...mockVersion, id: 5, platform: "mac" };
      const allVersion = { ...mockVersion, id: 6, platform: "all" };

      strapi.db.query = jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue([allVersion, macVersion]),
      }));

      const result = await productController.getLatestVersion(mockCtx);

      expect(result).toEqual(macVersion);
    });

    it("should sanitize storefront latest-version responses", async () => {
      mockCtx.params = { id: 1 };
      mockCtx.request.path = "/api/license-server/products/1/versions/latest";

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.product") {
          return { findOne: jest.fn().mockResolvedValue({ id: 1, is_active: true }) };
        }

        return {
          findMany: jest.fn().mockResolvedValue([
            {
              ...mockVersion,
              build_hash: "build-1",
              min_license_protocol_version: 3,
              file_size_bytes: 8192,
              changelog: "Security update",
            },
          ]),
        };
      });

      const result = await productController.getLatestVersion(mockCtx);

      expect(result).toEqual({
        id: 1,
        version: "1.0.0",
        platform: "win",
        min_license_protocol_version: 3,
        file_size_bytes: 8192,
        changelog: "Security update",
        is_latest: true,
      });
      expect(result).not.toHaveProperty("download_url");
      expect(result).not.toHaveProperty("build_hash");
    });
  });

  describe("getDownloadUrl", () => {
    it("should return 401 if not authenticated", async () => {
      mockCtx.params = { productId: 1, versionId: 1 };
      mockCtx.state = {};

      await productController.getDownloadUrl(mockCtx);

      expect(mockCtx.unauthorized).toHaveBeenCalledWith("Authentication required");
    });

    it("should return 403 if no license", async () => {
      mockCtx.params = { productId: 1, versionId: 1 };
      mockCtx.state = { user: { id: 1 } };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));

      await productController.getDownloadUrl(mockCtx);

      expect(mockCtx.forbidden).toHaveBeenCalledWith("No active license for this product");
    });

    it("should return 404 if version not found", async () => {
      mockCtx.params = { productId: 1, versionId: 1 };
      mockCtx.state = { user: { id: 1 } };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue({ id: 1, status: "active" }) };
        }
        return { findOne: jest.fn().mockResolvedValue(null) };
      });

      await productController.getDownloadUrl(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Version not found");
    });

    it("should return signed download URL", async () => {
      mockCtx.params = { productId: 1, versionId: 1 };
      mockCtx.state = { user: { id: 1 } };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue({ id: 1, status: "active" }) };
        }
        return { findOne: jest.fn().mockResolvedValue(mockVersion) };
      });

      const result = await productController.getDownloadUrl(mockCtx);

      expect(result.download_url).toBeDefined();
      expect(result.expires_at).toBeDefined();
    });
  });

  describe("getMyDownloads", () => {
    it("should require authentication and return customer downloads", async () => {
      await productController.getMyDownloads(mockCtx);
      expect(mockCtx.unauthorized).toHaveBeenCalledWith("Authentication required");

      mockCtx.state = { user: { id: 7 } };
      const result = await productController.getMyDownloads(mockCtx);

      expect(result).toEqual({
        downloads: [
          { id: 1, license_key: "VST-ABCDE-FGHIJ-KLMNP-QRSTU", downloads: [] },
        ],
        total: 1,
      });
    });
  });
});

describe("Activation Controller Extended", () => {
  let activationController;
  let mockCtx;

  const mockActivation = {
    id: 1,
    license_id: 1,
    device_fingerprint: "test-fp",
    last_checkin: new Date(),
    revoked_at: null,
    requires_mtls: false,
  };

  const mockLicense = {
    id: 1,
    uid: "test-license",
    status: "active",
  };

  beforeEach(() => {
    mockCtx = {
      params: {},
      request: { body: {}, headers: {} },
      state: {},
      throw: jest.fn(),
      notFound: jest.fn((msg) => ({ message: msg })),
      badRequest: jest.fn((msg) => ({ message: msg })),
      forbidden: jest.fn((msg) => ({ message: msg })),
      conflict: jest.fn((msg) => ({ message: msg })),
      serviceUnavailable: jest.fn((msg) => ({ message: msg })),
    };

    global.strapi = {
      config: {
        get: jest.fn(() => ({
          freshnessMaxSkewSeconds: 60 * 60 * 24 * 365,
          requireFreshnessStore: false,
        })),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      db: {
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          update: jest.fn(),
        })),
      },
      plugin: jest.fn(() => ({
        service: jest.fn(() => ({
          heartbeat: jest.fn().mockResolvedValue({ valid: true }),
          hydrateActivation: jest.fn(async (value) => value),
        })),
      })),
    };

    activationController = require("../../server/controllers/activation");
  });

  describe("findOne", () => {
    it("should return activation by id", async () => {
      mockCtx.params = { id: 1 };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(mockActivation),
      }));

      const result = await activationController.findOne(mockCtx);

      expect(result.id).toBe(1);
    });

    it("should return 404 if not found", async () => {
      mockCtx.params = { id: 999 };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));

      await activationController.findOne(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Activation not found");
    });
  });

  describe("heartbeat with lookup", () => {
    it("should return 400 if no activation_id or license_key", async () => {
      mockCtx.request.body = {};
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-1",
        "x-request-timestamp": "2026-03-06T06:30:00.000Z",
      };

      await activationController.heartbeat(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "activation_id or license_key is required",
      );
    });

    it("should lookup by activation_id", async () => {
      mockCtx.request.body = { activation_id: 1, device_fingerprint: "test-fp" };
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-2",
        "x-request-timestamp": "2026-03-06T06:31:00.000Z",
      };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(mockActivation),
        update: jest.fn().mockResolvedValue({}),
      }));

      const result = await activationController.heartbeat(mockCtx);

      expect(result).toBeDefined();
    });

    it("should lookup by license_key and device_fingerprint", async () => {
      mockCtx.request.body = {
        license_key: "test-license",
        device_fingerprint: "test-fp",
      };
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-3",
        "x-request-timestamp": "2026-03-06T06:32:00.000Z",
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(mockLicense) };
        }
        return {
          findOne: jest.fn().mockResolvedValue(mockActivation),
          update: jest.fn().mockResolvedValue({}),
        };
      });

      const result = await activationController.heartbeat(mockCtx);

      expect(result).toBeDefined();
    });

    it("should return 404 if activation not found", async () => {
      mockCtx.request.body = { activation_id: 999, device_fingerprint: "test-fp" };
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-4",
        "x-request-timestamp": "2026-03-06T06:33:00.000Z",
      };

      strapi.db.query = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));

      await activationController.heartbeat(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("Activation not found");
    });

    it("should return 404 if license not found for heartbeat lookup", async () => {
      mockCtx.request.body = {
        license_key: "invalid-key",
        device_fingerprint: "test-fp",
      };
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-5",
        "x-request-timestamp": "2026-03-06T06:34:00.000Z",
      };

      strapi.db.query = jest.fn((model) => {
        if (model === "plugin::license-server.license") {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        return { findOne: jest.fn().mockResolvedValue(null) };
      });

      await activationController.heartbeat(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("License not found");
    });

    it("should require device_fingerprint for unsigned activation_id lookup", async () => {
      mockCtx.request.body = { activation_id: 1 };
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-lookup-6",
        "x-request-timestamp": "2026-03-06T06:35:00.000Z",
      };

      await activationController.heartbeat(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith(
        "device_fingerprint is required when activation_id is used without payload signature",
      );
    });
  });
});

describe("License Controller Extended", () => {
  let licenseController;
  let mockCtx;

  const mockActivation = {
    id: 1,
    license_id: 1,
    device_fingerprint: "test-fp",
    last_checkin: new Date(),
    revoked_at: null,
    requires_mtls: false,
  };

  const mockLicense = {
    id: 1,
    uid: "test-license",
    status: "active",
  };

  beforeEach(() => {
    mockCtx = {
      params: {},
      query: {},
      request: { body: {}, headers: {} },
      state: {},
      throw: jest.fn(),
      notFound: jest.fn((msg) => ({ message: msg })),
      badRequest: jest.fn(),
      forbidden: jest.fn((msg) => ({ message: msg })),
      conflict: jest.fn((msg) => ({ message: msg })),
      serviceUnavailable: jest.fn((msg) => ({ message: msg })),
      unauthorized: jest.fn(),
    };

    global.strapi = {
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      db: {
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          deleteMany: jest.fn(),
        })),
      },
      plugin: jest.fn(() => ({
        service: jest.fn(() => ({
          activateLicense: jest.fn(),
          validateLicense: jest.fn(),
          deactivateLicense: jest.fn(),
          getLicenseStatus: jest.fn(),
          revokeLicense: jest.fn(),
        })),
      })),
    };

    licenseController = require("../../server/controllers/license");
  });

  describe("getLicenseStatus", () => {
    it("should return 400 if no license_key", async () => {
      mockCtx.query = {};

      await licenseController.getLicenseStatus(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalledWith("license_key is required");
    });

    it("should return license status", async () => {
      mockCtx.query = { license_key: "test-license" };
      mockCtx.request.headers = { "x-request-nonce": "nonce-1" };

      const mockStatus = { status: "active", expires_at: null };
      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") {
            return { reserveNonce: jest.fn().mockResolvedValue(true) };
          }

          return {
            getLicenseStatus: jest.fn().mockResolvedValue(mockStatus),
          };
        }),
      }));

      licenseController = require("../../server/controllers/license");

      const result = await licenseController.getLicenseStatus(mockCtx);

      expect(result.status).toBe("active");
    });

    it("should return 404 if license not found", async () => {
      mockCtx.query = { license_key: "invalid-key" };
      mockCtx.request.headers = { "x-request-nonce": "nonce-2" };

      strapi.plugin = jest.fn(() => ({
        service: jest.fn((name) => {
          if (name === "crypto") {
            return { reserveNonce: jest.fn().mockResolvedValue(true) };
          }

          return {
            getLicenseStatus: jest.fn().mockResolvedValue(null),
          };
        }),
      }));

      licenseController = require("../../server/controllers/license");

      await licenseController.getLicenseStatus(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("License not found");
    });
  });

  describe("validate with query params", () => {
    it("should return 400 if no activation info", async () => {
      mockCtx.query = {};
      mockCtx.state = {};
      mockCtx.request.headers = {
        "x-request-nonce": "nonce-license-1",
        "x-request-timestamp": "2026-03-06T06:42:00.000Z",
      };

      await licenseController.validate(mockCtx);

      expect(mockCtx.badRequest).toHaveBeenCalled();
    });
  });

  describe("revoke - error cases", () => {
    it("should return 404 if license not found", async () => {
      mockCtx.params = { id: 999 };

      strapi.plugin = jest.fn(() => ({
        service: jest.fn(() => ({
          revokeLicense: jest.fn().mockRejectedValue(new Error("LICENSE_NOT_FOUND")),
        })),
      }));

      licenseController = require("../../server/controllers/license");

      await licenseController.revoke(mockCtx);

      expect(mockCtx.notFound).toHaveBeenCalledWith("License not found");
    });
  });
});
