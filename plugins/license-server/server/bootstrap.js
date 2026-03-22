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

const ROLE_CONFIGS = [
  {
    type: "authenticated",
    name: "Authenticated",
    description: "Default role given to authenticated user.",
    permissions: [
      "plugin::license-server.license.find",
      "plugin::license-server.activation.revokeMine",
      "plugin::license-server.activation-claim.listMine",
      "plugin::license-server.activation-claim.approve",
      "plugin::license-server.activation-claim.reject",
      "plugin::license-server.product.getDownloadUrl",
      "plugin::license-server.product.getMyDownloads",
      "plugin::license-server.order.create",
      "plugin::license-server.order.find",
      "plugin::license-server.order.findOne",
      "plugin::license-server.order.redeemCoupon",
      "plugin::license-server.order.getItems",
    ],
  },
  {
    type: "support",
    name: "Support",
    description: "License Server support role",
    permissions: [
      "plugin::license-server.license.find",
      "plugin::license-server.order.find",
      "plugin::license-server.order.findOne",
      "plugin::license-server.order.getItems",
    ],
  },
  {
    type: "admin",
    name: "Admin",
    description: "License Server admin role",
    permissions: [
      "plugin::license-server.license.find",
      "plugin::license-server.order.find",
      "plugin::license-server.order.findOne",
      "plugin::license-server.order.create",
      "plugin::license-server.order.getItems",
    ],
  },
];

const enablePermissions = ({ permissionsMap, actions, roleType, strapi }) => {
  for (const actionId of actions) {
    const [namespace, controller, action] = actionId.split(".");
    const actionConfig = permissionsMap?.[namespace]?.controllers?.[controller]?.[action];

    if (!actionConfig) {
      strapi.log.warn(
        `[License Server] Missing permission action ${actionId} for role ${roleType}`,
      );
      continue;
    }

    actionConfig.enabled = true;
  }

  return permissionsMap;
};

async function setupRoles(strapi) {
  try {
    const roleService = strapi.service("plugin::users-permissions.role");
    const usersPermissionsService = strapi.service(
      "plugin::users-permissions.users-permissions",
    );
    const roleQuery = strapi.db.query("plugin::users-permissions.role");
    const existingRoles = await roleService.find();

    for (const roleConfig of ROLE_CONFIGS) {
      let role = existingRoles.find((r) => r.type === roleConfig.type);

      if (!role) {
        role = await roleQuery.create({
          data: {
            name: roleConfig.name,
            type: roleConfig.type,
            description: roleConfig.description,
          },
        });
        strapi.log.info(`[License Server] Created role: ${roleConfig.type}`);
      }

      const currentRole = await roleService.findOne(role.id);
      const permissions = enablePermissions({
        permissionsMap:
          currentRole?.permissions ||
          usersPermissionsService.getActions({ defaultEnable: false }),
        actions: roleConfig.permissions,
        roleType: roleConfig.type,
        strapi,
      });

      await roleService.updateRole(role.id, {
        name: role.name || roleConfig.name,
        description: role.description || roleConfig.description,
        permissions,
      });
    }

    strapi.log.info("[License Server] RBAC roles initialized");
  } catch (err) {
    strapi.log.error("[License Server] Failed to setup RBAC:", err);
  }
}

const PRODUCT_CONTENT_TYPE = "plugin::license-server.product";

async function ensureMeilisearchProductIndex(strapi) {
  try {
    const meilisearchPlugin = strapi.plugin("meilisearch");

    if (!meilisearchPlugin) {
      return;
    }

    const store = meilisearchPlugin.service("store");
    const meilisearch = meilisearchPlugin.service("meilisearch");

    if (!store || !meilisearch) {
      return;
    }

    if (typeof store.syncCredentials === "function") {
      await store.syncCredentials();
    }

    const { host } = await store.getCredentials();
    if (!host) {
      strapi.log.info("[License Server] Meilisearch host not configured, skipping product indexing");
      return;
    }

    const shouldReindex = Boolean(
      strapi.config?.get?.("plugin::license-server.meilisearchReindexOnBootstrap", false),
    );

    if (shouldReindex) {
      await meilisearch.updateContentTypeInMeiliSearch({ contentType: PRODUCT_CONTENT_TYPE });
      strapi.log.info("[License Server] Product catalog reindexed in Meilisearch");
      return;
    }

    const indexedContentTypes = await store.getIndexedContentTypes();
    if (indexedContentTypes.includes(PRODUCT_CONTENT_TYPE)) {
      strapi.log.info("[License Server] Product catalog already indexed in Meilisearch");
      return;
    }

    await meilisearch.addContentTypeInMeiliSearch({ contentType: PRODUCT_CONTENT_TYPE });
    strapi.log.info("[License Server] Product catalog indexed in Meilisearch");
  } catch (err) {
    strapi.log.error("[License Server] Meilisearch product indexing failed:", err.message);
  }
}

module.exports = ({ strapi }) => {
  strapi.log.info("[License Server] Plugin bootstrapped");

  if (strapi.plugin("users-permissions")) {
    setupRoles(strapi).catch((err) => {
      strapi.log.error("[License Server] RBAC setup failed:", err.message);
    });
  }

  ensureMeilisearchProductIndex(strapi).catch((err) => {
    strapi.log.error("[License Server] Meilisearch bootstrap failed:", err.message);
  });
};
