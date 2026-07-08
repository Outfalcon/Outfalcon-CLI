import { defineConfig } from "tsup";

// Single-file CJS bundle with a shebang so `dist/index.js` runs as `falcon`.
// The route registry (src/api/v1/openapi.ts, zero imports) is inlined at build time,
// so the published package carries no server dependencies and can never drift from the API.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["cjs"],
  target: "node18",
  clean: true,
  minify: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
});
