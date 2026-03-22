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

const license = require("./license");
const activation = require("./activation");
const activationClaim = require("./activation-claim");
const webhook = require("./webhook");
const product = require("./product");
const order = require("./order");
const coupon = require("./coupon");

module.exports = {
  license,
  activation,
  "activation-claim": activationClaim,
  webhook,
  product,
  order,
  coupon,
};
