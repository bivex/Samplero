/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 06:42
 * Last Updated: 2026-03-05 06:42
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

module.exports = ({ env }) => ({
  auth: {
    secret: env("ADMIN_JWT_SECRET"),
    sessions: {
      maxRefreshTokenLifespan: 2592000,
      maxSessionLifespan: 604800,
    },
  },
  apiToken: {
    salt: env("API_TOKEN_SALT"),
  },
  transfer: {
    token: {
      salt: env("TRANSFER_TOKEN_SALT"),
    },
  },
  flags: {
    nps: env.bool("FLAG_NPS", true),
    promoteEE: env.bool("FLAG_PROMOTE_EE", true),
  },
});
