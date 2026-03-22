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

module.exports = async (policyContext, config, { strapi }) => {
  const ctx = policyContext;
  const ip = ctx.request.ip;
  const redisService = strapi.plugin("redis")?.service("default");

  if (!redisService) {
    strapi.log.warn("[RateLimit] Redis not available, skipping rate limit");
    return true;
  }

  const rateLimitKey = `rate:${ip}:${ctx.request.path}`;
  const maxRequests = config.maxRequests || 100;
  const windowSeconds = config.windowSeconds || 60;

  try {
    const current = await redisService.get(rateLimitKey);

    if (current && parseInt(current) >= maxRequests) {
      strapi.log.warn(`[RateLimit] Rate limit exceeded for IP: ${ip}`);
      return ctx.tooManyRequests("Rate limit exceeded");
    }

    if (current) {
      await redisService.incr(rateLimitKey);
    } else {
      await redisService.set(rateLimitKey, "1", "EX", windowSeconds);
    }
  } catch (err) {
    strapi.log.error("[RateLimit] Error:", err.message);
  }

  return true;
};
