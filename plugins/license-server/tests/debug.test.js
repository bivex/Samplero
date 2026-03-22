// Quick debug test
test("debug controller", async () => {
  const mockStrapi = {
    db: {
      query: jest.fn(() => ({
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      })),
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    plugin: jest.fn(() => ({ service: jest.fn() })),
  };
  global.strapi = mockStrapi;

  const controller = require("../server/controllers/product");

  const ctx = {
    query: { limit: "5" },
    throw: jest.fn((status, msg) => {
      throw new Error(msg);
    }),
  };

  await controller.find(ctx);
  console.log(
    "findMany calls:",
    mockStrapi.db.query("plugin::license-server.product").findMany.mock.calls,
  );
});
