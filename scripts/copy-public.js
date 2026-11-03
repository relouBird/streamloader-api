const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "..", "src", "public");
const destination = path.resolve(__dirname, "..", "dist", "public");

if (!fs.existsSync(source)) {
  throw new Error(`Public assets directory not found: ${source}`);
}

fs.cpSync(source, destination, { recursive: true });
console.log(`Copied public assets to ${destination}`);
