export default [
  "strapi::logger",
  "strapi::errors",
  "strapi::security",
  {
    name: "strapi::cors",
    config: {
      origin: [
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://tauri.localhost",
        "tauri://localhost",
      ],
      headers: [
        "Content-Type",
        "Authorization",
        "Origin",
        "Accept",
        "x-request-nonce",
        "x-request-timestamp",
        "x-request-signature",
      ],
      expose: [
        "x-response-signature",
        "x-response-signed-at",
      ],
      keepHeadersOnError: true,
    },
  },
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
  "global::response-sign",
];
