#!/usr/bin/env node
// Refresh the vendored route registry from the sequencer backend.
//
// `src/vendor/openapi.ts` is a verbatim copy of the backend's `src/api/v1/openapi.ts` (a zero-import,
// pure-data module). This script copies the current version over so the CLI's command tree stays in
// lockstep with the API. Point it at your backend checkout via env or arg:
//
//   MAILBOXY_OPENAPI=/path/to/backend/src/api/v1/openapi.ts npm run sync:registry
//   node scripts/sync-registry.mjs /path/to/backend/src/api/v1/openapi.ts
//
// Default source: a sibling `../Mailboxy/src/api/v1/openapi.ts` checkout.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, "../src/vendor/openapi.ts");
const src = resolve(
  process.argv[2] || process.env.MAILBOXY_OPENAPI || resolve(here, "../../Mailboxy/src/api/v1/openapi.ts")
);

if (!existsSync(src)) {
  console.error(`✗ Source registry not found: ${src}`);
  console.error("  Pass a path or set MAILBOXY_OPENAPI to the backend's src/api/v1/openapi.ts");
  process.exit(1);
}

// Guard: the registry must stay import-free so it can be bundled with no dependencies.
const text = readFileSync(src, "utf8");
if (/^\s*import\s|\brequire\s*\(/m.test(text)) {
  console.error(`✗ Refusing to vendor ${src}: it has imports (must be pure data).`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`✓ Synced registry\n  from ${src}\n  to   ${dest}`);
