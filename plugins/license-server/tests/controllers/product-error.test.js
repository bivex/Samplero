const freshRequire = (modulePath) => {
  const resolved = require.resolve(modulePath);
  if (require.cache?.[resolved]) delete require.cache[resolved];
  return require(modulePath);
};

describe("Product controller error paths", () => {
  let controller;
  let ctx;

  beforeEach(() => {
    ctx = { params: {}, query: {}, request: { body: {} }, state: {}, throw: jest.fn(), notFound: jest.fn(), forbidden: jest.fn(), unauthorized: jest.fn() };
    global.strapi = {
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      db: { query: jest.fn() },
      plugin: jest.fn(() => ({ provider: { getSignedUrl: jest.fn() } })),
    };
    controller = freshRequire("../../server/controllers/product");
  });

  it("passes find errors to ctx.throw", async () => {
    const err = new Error("product find failed");
    global.strapi.db.query = jest.fn(() => ({ findMany: jest.fn().mockRejectedValue(err), count: jest.fn().mockResolvedValue(0) }));
    await controller.find(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("passes findOne errors to ctx.throw", async () => {
    const err = new Error("product findOne failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
    await controller.findOne(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("returns notFound when slug lookup misses a product", async () => {
    ctx.params = { slug: "missing" };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.findBySlug(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Product not found");
  });

  it("passes slug lookup errors to ctx.throw", async () => {
    const err = new Error("product slug lookup failed");
    ctx.params = { slug: "boom" };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err) }));
    await controller.findBySlug(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("passes create errors to ctx.throw", async () => {
    const err = new Error("product create failed");
    ctx.request.body = { name: "Broken" };
    global.strapi.db.query = jest.fn(() => ({ create: jest.fn().mockRejectedValue(err) }));
    await controller.create(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("passes update errors to ctx.throw", async () => {
    const err = new Error("product update failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ update: jest.fn().mockRejectedValue(err) }));
    await controller.update(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("returns notFound when deleting a missing product", async () => {
    ctx.params = { id: 999 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.delete(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Product not found");
  });

  it("passes delete errors to ctx.throw", async () => {
    const err = new Error("product delete failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockRejectedValue(err), delete: jest.fn() }));
    await controller.delete(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("passes getVersions errors to ctx.throw", async () => {
    const err = new Error("versions failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ findMany: jest.fn().mockRejectedValue(err) }));
    await controller.getVersions(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("passes createVersion errors to ctx.throw", async () => {
    const err = new Error("create version failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockRejectedValue(err) }));
    await controller.createVersion(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("returns notFound when deleting a missing version", async () => {
    ctx.params = { id: 1, versionId: 999 };
    global.strapi.db.query = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) }));
    await controller.deleteVersion(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Version not found");
  });

  it("passes getLatestVersion errors to ctx.throw", async () => {
    const err = new Error("latest failed");
    ctx.params = { id: 1 };
    global.strapi.db.query = jest.fn(() => ({ findMany: jest.fn().mockRejectedValue(err) }));
    await controller.getLatestVersion(ctx);
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });

  it("returns notFound when version has no download URL", async () => {
    ctx.params = { productId: 1, versionId: 1 };
    ctx.state = { user: { id: 5 } };
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ id: 1, status: "active" }) };
      return { findOne: jest.fn().mockResolvedValue({ id: 1, download_url: null }) };
    });
    await controller.getDownloadUrl(ctx);
    expect(ctx.notFound).toHaveBeenCalledWith("Download not available");
  });

  it("returns raw download URL when provider has no signer", async () => {
    ctx.params = { productId: 1, versionId: 1 };
    ctx.state = { user: { id: 5 } };
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ id: 1, status: "active" }) };
      return { findOne: jest.fn().mockResolvedValue({ id: 1, download_url: "https://example.com/file.zip" }) };
    });
    global.strapi.plugin = jest.fn(() => ({ provider: {} }));
    const result = await controller.getDownloadUrl(ctx);
    expect(result.download_url).toBe("https://example.com/file.zip");
  });

  it("logs and throws getDownloadUrl failures", async () => {
    const err = new Error("signing failed");
    ctx.params = { productId: 1, versionId: 1 };
    ctx.state = { user: { id: 5 } };
    global.strapi.db.query = jest.fn((model) => {
      if (model === "plugin::license-server.license") return { findOne: jest.fn().mockResolvedValue({ id: 1, status: "active" }) };
      return { findOne: jest.fn().mockResolvedValue({ id: 1, download_url: "https://example.com/file.zip" }) };
    });
    global.strapi.plugin = jest.fn(() => ({ provider: { getSignedUrl: jest.fn().mockRejectedValue(err) } }));
    await controller.getDownloadUrl(ctx);
    expect(global.strapi.log.error).toHaveBeenCalledWith("[Product] Get download URL failed:", "signing failed");
    expect(ctx.throw).toHaveBeenCalledWith(500, err);
  });
});