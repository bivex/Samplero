/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-22 02:32
 * Last Updated: 2026-03-22 02:32
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const copies = [
  {
    source: path.join(rootDir, "node_modules", "toastify-js", "src", "toastify.js"),
    destination: path.join(rootDir, "public", "customer", "vendor", "toastify.js"),
  },
  {
    source: path.join(rootDir, "node_modules", "toastify-js", "src", "toastify.css"),
    destination: path.join(rootDir, "public", "customer", "vendor", "toastify.css"),
  },
];

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFile(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing vendor asset: ${path.relative(rootDir, source)}`);
  }

  ensureParentDir(destination);
  fs.copyFileSync(source, destination);
}

function main() {
  copies.forEach(({ source, destination }) => copyFile(source, destination));
  console.log("Synced customer vendor assets:");
  copies.forEach(({ destination }) => {
    console.log(`- ${path.relative(rootDir, destination)}`);
  });
}

main();

