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

export default ({ env }) => {
  const client = env("DATABASE_CLIENT", "sqlite");

  if (client === "postgres") {
    return {
      connection: {
        client: "postgres",
        connection: {
          connectionString: env("DATABASE_URL"),
          host: env("DATABASE_HOST", "127.0.0.1"),
          port: env.int("DATABASE_PORT", 5432),
          database: env("DATABASE_NAME", "strapi"),
          user: env("DATABASE_USERNAME", "strapi"),
          password: env("DATABASE_PASSWORD", "strapi"),
          schema: env("DATABASE_SCHEMA", "public"),
          ssl: env.bool("DATABASE_SSL", false) && {
            rejectUnauthorized: env.bool("DATABASE_SSL_SELF", false),
          },
        },
        pool: {
          min: env.int("DATABASE_POOL_MIN", 2),
          max: env.int("DATABASE_POOL_MAX", 10),
        },
        debug: false,
      },
    };
  }

  return {
    connection: {
      client: "sqlite",
      connection: {
        filename: env("DATABASE_FILENAME", ".tmp/data.db"),
      },
      useNullAsDefault: true,
    },
  };
};
