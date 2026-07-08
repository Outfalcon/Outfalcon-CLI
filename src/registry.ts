// Single source of truth. `src/vendor/openapi.ts` is a verbatim copy of the sequencer backend's
// `src/api/v1/openapi.ts` — the same registry that backs the OpenAPI spec and the MCP server. It has
// zero imports (pure data), so tsup inlines it with no dependencies. Refresh it with
// `npm run sync:registry` (see scripts/sync-registry.mjs) whenever the API adds routes.
export {
  ROUTE_REGISTRY,
  TAGS,
  TAG_GROUPS,
  FLAG_LABELS,
  openapiSpec,
} from "./vendor/openapi";
export type { RouteDef } from "./vendor/openapi";

import { openapiSpec } from "./vendor/openapi";

/** JSON Schemas for every request body, keyed by the `reqSchema` name used in the registry. */
export const COMPONENT_SCHEMAS = (openapiSpec.components?.schemas || {}) as Record<string, any>;
