import { describe, expect, test, beforeEach } from 'bun:test';
import systemController from '../plugins/license-server/server/controllers/system';

describe('System Observability Integration', () => {
  beforeEach(() => {
    (global as any).strapi = {
      config: {
        get: (key: string) => {
          if (key === 'plugin::license-server') {
            return { signerMode: 'local' };
          }
          return null;
        },
      },
      db: {
        connection: {
          raw: async () => [{ 1: 1 }],
        },
        query: () => ({
          findMany: async () => [],
          findOne: async () => null,
        }),
      },
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };
  });

  test('GET /healthz returns ok with uptime and timestamp', async () => {
    const ctx: any = {};
    await systemController.healthz(ctx);

    expect(ctx.body).toBeDefined();
    expect(ctx.body.status).toBe('ok');
    expect(ctx.body.service).toBe('strapi-license-server');
    expect(typeof ctx.body.uptime_seconds).toBe('number');
    expect(ctx.body.timestamp).toBeDefined();
  });

  test('GET /readyz returns 200 ready when DB is connected', async () => {
    const ctx: any = {};
    await systemController.readyz(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.status).toBe('ready');
    expect(ctx.body.checks.database).toBe('healthy');
  });

  test('GET /metrics returns prometheus exposition format', async () => {
    const ctx: any = {
      set: () => {},
    };
    await systemController.metrics(ctx);

    expect(typeof ctx.body).toBe('string');
    expect(ctx.body).toContain('process_uptime_seconds');
    expect(ctx.body).toContain('process_heap_bytes');
  });
});
