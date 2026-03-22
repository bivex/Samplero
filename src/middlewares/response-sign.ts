/**
 * Copyright (c) 2026 Bivex
 * Response signing middleware - adds HMAC signature to all API responses
 */

import crypto from 'crypto';

const isStreamLike = (value: any) =>
  !!value && typeof value === 'object' && typeof value.pipe === 'function';

export default (config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    await next();

    const pluginConfig = strapi.config.get('plugin::license-server') || {};
    const serverSecret = pluginConfig.serverSecret;

    if (!serverSecret || serverSecret === 'change-me-in-production') {
      return;
    }

    if (!ctx.path?.startsWith('/api/')) {
      return;
    }

    const skipPaths = [
      '/admin',
      '/health',
      '/_health',
      '/connect',
    ];

    const shouldSkip = skipPaths.some((path: string) => ctx.path.startsWith(path));
    if (shouldSkip) {
      return;
    }

    if (!ctx.body) {
      return;
    }

    if (ctx.body && ctx.body._signature !== undefined) {
      return;
    }

    if (isStreamLike(ctx.body)) {
      return;
    }

    try {
      const signedAt = new Date().toISOString();
      const payload = JSON.stringify(ctx.body);
      const signature = crypto
        .createHmac('sha256', serverSecret)
        .update(payload)
        .digest('base64');
      const isPlainObject =
        typeof ctx.body === 'object' &&
        ctx.body !== null &&
        !Array.isArray(ctx.body) &&
        !Buffer.isBuffer(ctx.body);

      ctx.set('x-response-signature', signature);
      ctx.set('x-response-signed-at', signedAt);

      if (!isPlainObject) {
        return;
      }

      ctx.body = {
        ...ctx.body,
        _signature: signature,
        _signedAt: signedAt,
      };
    } catch (err: any) {
      strapi.log.error('[ResponseSign] Failed to sign response:', err.message);
    }
  };
};
