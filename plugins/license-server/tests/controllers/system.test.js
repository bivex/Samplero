/**
 * Tests for System Observability Controller (healthz, readyz, metrics)
 */

"use strict";

const systemController = require("../../server/controllers/system");

describe("System Controller", () => {
  beforeEach(() => {
    global.strapi = {
      config: {
        get: jest.fn((key) => {
          if (key === "plugin::license-server") {
            return { signerMode: "local" };
          }
          return null;
        }),
      },
      db: {
        connection: {
          raw: jest.fn().mockResolvedValue([{ 1: 1 }]),
        },
        query: jest.fn(() => ({
          findMany: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
        })),
      },
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };
  });

  test("healthz returns 200 with service info", async () => {
    const ctx = {};
    await systemController.healthz(ctx);

    expect(ctx.body).toBeDefined();
    expect(ctx.body.status).toBe("ok");
    expect(ctx.body.service).toBe("strapi-license-server");
    expect(ctx.body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(ctx.body.timestamp).toBeDefined();
  });

  test("readyz returns 200 when database is healthy", async () => {
    const ctx = {};
    await systemController.readyz(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.status).toBe("ready");
    expect(ctx.body.checks.database).toBe("healthy");
  });

  test("readyz returns 503 when database is down", async () => {
    global.strapi.db.connection.raw = jest.fn().mockRejectedValue(new Error("Connection refused"));

    const ctx = {};
    await systemController.readyz(ctx);

    expect(ctx.status).toBe(503);
    expect(ctx.body.status).toBe("unhealthy");
    expect(ctx.body.checks.database).toContain("unhealthy");
  });

  test("metrics returns Prometheus-formatted text", async () => {
    global.strapi.db.query = jest.fn((model) => ({
      findMany: jest.fn().mockResolvedValue(
        model === "plugin::license-server.license"
          ? [{ status: "active" }, { status: "active" }, { status: "revoked" }]
          : [{ platform: "mac", revoked_at: null }, { platform: "windows", revoked_at: "2026-01-01" }]
      ),
    }));

    const ctx = {
      set: jest.fn(),
    };
    await systemController.metrics(ctx);

    expect(ctx.set).toHaveBeenCalledWith("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    expect(typeof ctx.body).toBe("string");
    expect(ctx.body).toContain("# HELP process_uptime_seconds");
    expect(ctx.body).toContain("process_uptime_seconds");
    expect(ctx.body).toContain("license_server_licenses_total");
    expect(ctx.body).toContain('status="active"');
  });
});
