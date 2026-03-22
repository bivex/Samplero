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

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["server/**/*.js", "!server/**/*.json"],
  coverageDirectory: "coverage",
  verbose: true,
  setupFilesAfterEnv: ["./tests/setup.js"],
  testTimeout: 10000,
};
