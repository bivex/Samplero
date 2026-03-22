/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:38
 * Last Updated: 2026-03-05 04:38
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const register = require("./server/register");
const bootstrap = require("./server/bootstrap");
const destroy = require("./server/destroy");
const config = require("./server/config");
const contentTypes = require("./server/content-types");
const controllers = require("./server/controllers");
const services = require("./server/services");
const routes = require("./server/routes");
const policies = require("./server/policies");

module.exports = (plugin) => {
  return {
    register,
    bootstrap,
    destroy,
    config,
    contentTypes,
    controllers,
    services,
    routes,
    policies,
  };
};
