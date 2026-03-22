/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 07:00
 * Last Updated: 2026-03-05 07:00
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const { createStrapi: strapiCreateStrapi } = require("@strapi/strapi");

// Singleton instance
let strapiInstance = null;

/**
 * Create a Strapi instance for testing
 * @returns {Promise<Strapi>}
 */
async function createStrapi() {
  if (strapiInstance) {
    return strapiInstance;
  }

  strapiInstance = strapiCreateStrapi({
    dir: process.cwd(),
    autoReload: false,
    serveAdminPanel: false,
    logger: {
      level: "silent",
    },
  });

  await strapiInstance.load();
  await strapiInstance.start();

  return strapiInstance;
}

/**
 * Cleanup Strapi instance
 */
async function cleanupStrapi() {
  if (strapiInstance) {
    await strapiInstance.stop();
    await strapiInstance.destroy();
    strapiInstance = null;
  }
}

module.exports = {
  createStrapi,
  cleanupStrapi,
};
