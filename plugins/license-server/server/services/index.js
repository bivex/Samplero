/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 04:55
 * Last Updated: 2026-03-05 04:55
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

"use strict";

const crypto = require("./crypto");
const activationClaim = require("./activation-claim");
const license = require("./license");
const purchase = require("./purchase");
const coupon = require("./coupon");
const validation = require("./validation");
const s3 = require("./s3");

module.exports = {
  crypto,
  "activation-claim": activationClaim,
  license,
  purchase,
  coupon,
  validation,
  s3,
};
