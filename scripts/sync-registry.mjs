#!/usr/bin/env node
// Regenerate the vendored route registry (src/vendor/openapi.ts) from a live OpenAPI spec.
//
// The CLI's command tree is derived from a compact route registry. Rather than vendor the backend's
// private TypeScript source, we reconstruct an equivalent registry from the PUBLIC OpenAPI JSON the
// backend serves — so syncing needs no repository access and no secrets.
//
//   node scripts/sync-registry.mjs                       # default public prod spec
//   FALCON_OPENAPI_URL=https://my.instance/api/v1/openapi.json node scripts/sync-registry.mjs
//   node scripts/sync-registry.mjs ./some/openapi.json   # or a local file / URL as arg
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEST = resolve(here, "../src/vendor/openapi.ts");
const DEFAULT_URL = "https://send.savereplies.com/api/v1/openapi.json";

const HTTP_METHODS = new Set(["get", "post", "patch", "put", "delete"]);
const FLAG_BY_TAG = { Warmup: "warmup", Calls: "telephony", LinkedIn: "linkedin" };
const FLAG_LABELS = {
  warmup: "email warmup (WARMUP_ENABLED)",
  telephony: "the dialer (Twilio configured)",
  linkedin: "LinkedIn (Unipile configured)",
};

async function loadSpec(source) {
  if (existsSync(source)) return JSON.parse(readFileSync(source, "utf8"));
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Fetch ${source} → HTTP ${res.status}`);
  return res.json();
}

// Reconstruct one RouteDef from an OpenAPI operation. Mirrors how the backend's buildPaths() emits
// the spec, in reverse.
function toRouteDef(pathKey, method, op) {
  const path = pathKey.replace(/^\/api\/v1/, "");
  const params = op.parameters || [];
  const isCursor = params.some((p) => p.in === "query" && p.name === "cursor");
  const isIdem = params.some((p) => p.in === "header" && p.name === "Idempotency-Key");
  const isAsync = !!(op.responses && op.responses["202"]);
  const bodyRef = op.requestBody?.content?.["application/json"]?.schema?.$ref;
  const reqSchema = bodyRef ? bodyRef.split("/").pop() : undefined;
  const tag = (op.tags && op.tags[0]) || "Uncategorized";

  // Documented filters = query params minus the pagination pair auto-added to cursor routes.
  const query = params
    .filter((p) => p.in === "query" && !(isCursor && (p.name === "cursor" || p.name === "limit")))
    .map((p) => {
      const q = { name: p.name };
      if (p.description) q.description = p.description;
      if (p.schema?.enum) q.enum = p.schema.enum.map(String);
      return q;
    });

  const def = { method, path, tag, summary: op.summary || "", scope: op["x-required-scope"] || "none" };
  if (op.description) def.description = op.description;
  if (op.requestBody) def.body = true;
  if (reqSchema) def.reqSchema = reqSchema;
  if (isIdem) def.idempotent = true;
  if (isCursor) def.cursor = true;
  if (isAsync) def.async = true;
  if (query.length) def.query = query;
  if (FLAG_BY_TAG[tag]) def.flag = FLAG_BY_TAG[tag];
  return def;
}

function build(spec) {
  const registry = [];
  for (const [pathKey, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method) || !op || typeof op !== "object") continue;
      registry.push(toRouteDef(pathKey, method, op));
    }
  }
  return {
    registry,
    tags: spec.tags || [],
    tagGroups: spec["x-tagGroups"] || [],
    schemas: spec.components?.schemas || {},
  };
}

function emit({ registry, tags, tagGroups, schemas }, source) {
  const j = (v) => JSON.stringify(v, null, 2);
  return `// AUTO-GENERATED — do not edit by hand.
// Reconstructed from the OpenAPI spec by scripts/sync-registry.mjs (npm run sync:registry).
// Source: ${source}

export interface RouteDef {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  tag: string;
  summary: string;
  description?: string;
  scope: "campaigns" | "leads" | "accounts" | "inbox" | "team" | "none";
  body?: boolean;
  reqSchema?: string;
  idempotent?: boolean;
  cursor?: boolean;
  async?: boolean;
  query?: Array<{ name: string; description?: string; enum?: string[] }>;
  flag?: "warmup" | "telephony" | "linkedin";
}

export const FLAG_LABELS: Record<NonNullable<RouteDef["flag"]>, string> = ${j(FLAG_LABELS)};

export const TAGS: Array<{ name: string; description: string }> = ${j(tags)};

export const TAG_GROUPS: Array<{ name: string; tags: string[] }> = ${j(tagGroups)};

export const ROUTE_REGISTRY: RouteDef[] = ${j(registry)} as unknown as RouteDef[];

export const openapiSpec = { components: { schemas: ${j(schemas)} } } as {
  components: { schemas: Record<string, any> };
};
`;
}

const source = process.argv[2] || process.env.FALCON_OPENAPI_URL || DEFAULT_URL;
const spec = await loadSpec(source);
const data = build(spec);
if (!data.registry.length) {
  console.error(`✗ Reconstructed 0 routes from ${source} — refusing to write.`);
  process.exit(1);
}
writeFileSync(DEST, emit(data, source), "utf8");
console.log(`✓ Synced registry from ${source}\n  ${data.registry.length} operations, ${Object.keys(data.schemas).length} schemas → ${DEST}`);
