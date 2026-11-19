#!/usr/bin/env node
// Copies shared pure core modules from src/lib/core -> mobile/src/lib/core
// so Next.js web and Expo mobile execute identical logic with zero drift.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src", "lib", "core");
const dstDir = path.join(root, "mobile", "src", "lib", "core");

fs.mkdirSync(dstDir, { recursive: true });

const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

for (const f of files) {
  const content = fs.readFileSync(path.join(srcDir, f), "utf8");
  fs.writeFileSync(path.join(dstDir, f), content, "utf8");
}

console.log(`Synced ${files.length} shared core modules to mobile/src/lib/core/`);
