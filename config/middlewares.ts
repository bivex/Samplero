/**
 * Copyright (c) 2026 Bivex
 *
 * Production-hardened Strapi Middleware Pipeline
 */

export default ({ env }: { env: any }) => [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:', 'http:'],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'market-assets.strapi.io',
            'https://*.amazonaws.com',
          ],
          'media-src': [
            "'self'",
            'data:',
            'blob:',
            'https://*.amazonaws.com',
          ],
          'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          'frame-src': ["'self'"],
          upgradeInsecureRequests: env.bool('SECURITY_UPGRADE_INSECURE_REQUESTS', false) ? [] : null,
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      xframe: {
        value: 'DENY',
      },
      nosniff: true,
      xss: true,
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: env.array('CORS_ORIGINS', [
        'http://localhost:1420',
        'http://127.0.0.1:1420',
        'http://tauri.localhost',
        'tauri://localhost',
        'http://localhost:1337',
        'http://localhost:8443',
        'http://localhost:3000',
      ]),
      headers: [
        'Content-Type',
        'Authorization',
        'Origin',
        'Accept',
        'x-request-nonce',
        'x-request-timestamp',
        'x-request-signature',
        'x-payload-signature',
        'x-request-id',
        'x-forwarded-for',
        'x-forwarded-proto',
      ],
      expose: [
        'x-response-signature',
        'x-response-signed-at',
        'x-request-id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ],
      keepHeadersOnError: true,
    },
  },
  'strapi::query',
  'strapi::body',
  'strapi::session',
  {
    name: 'strapi::favicon',
    config: {
      path: 'public/favicon.ico',
    },
  },
  'strapi::public',
  'global::response-sign',
];
