/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:33
 * Last Updated: 2026-03-22 02:33
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { describe, expect, it, mock } from 'bun:test';
import responseSign from '../src/middlewares/response-sign';

function createMiddleware(pluginConfig: Record<string, any> = {}) {
  return responseSign(
    {},
    {
      strapi: {
        config: {
          get(key: string) {
            if (key === 'plugin::license-server') {
              return { serverSecret: 'test-secret', ...pluginConfig };
            }
            return {};
          },
        },
        log: { error: mock(() => {}) },
      },
    },
  );
}

function createCtx(overrides: Record<string, any> = {}) {
  const headers: Record<string, string> = {};
  return {
    path: '/api/license-server/products',
    body: { ok: true },
    set(name: string, value: string) {
      headers[name] = value;
    },
    headers,
    ...overrides,
  };
}

describe('response-sign middleware', () => {
  it('signs JSON responses under /api', async () => {
    const middleware = createMiddleware();
    const ctx = createCtx();

    await middleware(ctx, async () => {});

    expect(ctx.headers['x-response-signature']).toBeString();
    expect(ctx.headers['x-response-signed-at']).toBeString();
    expect(ctx.body._signature).toBe(ctx.headers['x-response-signature']);
    expect(ctx.body._signedAt).toBe(ctx.headers['x-response-signed-at']);
  });

  it('skips non-api responses like static customer assets', async () => {
    const middleware = createMiddleware();
    const streamLike = { pipe() {} };
    const ctx = createCtx({ path: '/customer/index.html', body: streamLike });

    await middleware(ctx, async () => {});

    expect(ctx.headers['x-response-signature']).toBeUndefined();
    expect(ctx.body).toBe(streamLike);
  });
});