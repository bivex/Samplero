/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05
 * Licensed under the MIT License.
 */

import { Key } from "@strapi/icons";

export const pluginId = "license-server";

export default {
  register(app) {
    app.addMenuLink({
      intlLabel: {
        id: "license-server.plugin.name",
        defaultMessage: "License Server",
      },
      to: `plugins/${pluginId}`,
      icon: Key,
      Component: () => import("./pages/App.jsx"),
    });

    app.registerPlugin({
      id: pluginId,
      name: pluginId,
    });
  },
  bootstrap() {},
};
