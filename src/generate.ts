// Generate the command tree from ROUTE_REGISTRY: `falcon <resource> <action> [args] [flags]`.
// One command per API operation, grouped by resource (tag). Path params become positional args,
// documented query filters and request-body fields become flags, and the registry's semantic
// markers (cursor / async / idempotent / flag) wire up --all, --wait and auto-idempotency.
import { Command, Option } from "commander";
import { readFileSync } from "fs";
import { ROUTE_REGISTRY, TAGS, TAG_GROUPS, FLAG_LABELS, COMPONENT_SCHEMAS, type RouteDef } from "./registry";
import { FalconClient } from "./client";
import { resolveAuth } from "./config";
import { render, type OutputFormat } from "./output";
import { waitForJob } from "./jobs";
import { addGlobalOptions } from "./globals";

// Global flag names we must not shadow with a generated body/query flag.
const RESERVED = new Set([
  "output", "fields", "pretty", "quiet", "apiKey", "baseUrl", "profile",
  "idempotencyKey", "dryRun", "yes", "verbose", "wait", "all", "cursor",
  "limit", "data", "help", "version", "pollInterval",
]);

export function slugifyTag(tag: string): string {
  return tag.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pathParams(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

const VERB: Record<string, string> = { post: "create", patch: "update", put: "update", delete: "delete" };

/**
 * Derive a readable action name from a route, relative to its resource base segment.
 *   GET  /campaigns                 -> list
 *   GET  /campaigns/{id}            -> get
 *   POST /campaigns                 -> create
 *   PATCH/campaigns/{id}            -> update
 *   DELETE /campaigns/{id}          -> delete
 *   GET  /campaigns/{id}/leads      -> leads
 *   DELETE /campaigns/bulk          -> delete-bulk
 *   GET  /campaigns/search-by-...   -> search-by-contact
 */
export function deriveActionName(route: RouteDef): string {
  const segments = route.path.split("/").filter(Boolean);
  const rest = segments.slice(1); // drop the resource base
  const literals = rest.filter((s) => !s.startsWith("{"));
  const hasParam = rest.some((s) => s.startsWith("{"));

  if (literals.length === 0) {
    if (route.method === "get") return hasParam ? "get" : "list";
    return VERB[route.method] || route.method;
  }
  const literalName = literals.join("-");
  // For GET, the literal reads fine on its own (leads, metrics, search-by-contact).
  // For writes, prefix the verb so `create`/`delete` intent is explicit and names stay unique.
  if (route.method === "get") return literalName;
  return `${VERB[route.method] || route.method}-${literalName}`;
}

interface FieldSpec {
  name: string;      // schema property name
  flag: string;      // --kebab-name
  type: string;      // json-schema type
  enum?: any[];
  required: boolean;
  description?: string;
}

function kebab(s: string): string {
  return s.replace(/_/g, "-").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Flatten a request-body schema's top-level scalar/enum properties into CLI flags. */
function bodyFields(route: RouteDef): FieldSpec[] {
  if (!route.reqSchema) return [];
  const schema = COMPONENT_SCHEMAS[route.reqSchema];
  if (!schema || !schema.properties) return [];
  const required: string[] = schema.required || [];
  const fields: FieldSpec[] = [];
  for (const [name, def] of Object.entries<any>(schema.properties)) {
    const flag = kebab(name);
    if (RESERVED.has(flag) || RESERVED.has(name)) continue; // fall back to --data for these
    fields.push({
      name,
      flag,
      type: Array.isArray(def.type) ? def.type.find((t: string) => t !== "null") || "string" : def.type || "string",
      enum: def.enum,
      required: required.includes(name),
      description: def.description,
    });
  }
  return fields;
}

function coerce(value: string, type: string): any {
  switch (type) {
    case "integer":
      return parseInt(value, 10);
    case "number":
      return parseFloat(value);
    case "boolean":
      return /^(true|1|yes|y)$/i.test(value);
    case "array":
    case "object":
      return JSON.parse(value);
    default:
      return value;
  }
}

function readData(raw: string): any {
  let text = raw;
  if (raw === "-") {
    text = readFileSync(0, "utf8"); // stdin
  } else if (raw.startsWith("@")) {
    text = readFileSync(raw.slice(1), "utf8");
  }
  return JSON.parse(text);
}

function hasBody(route: RouteDef): boolean {
  return route.body === true || !!route.reqSchema;
}

/** Build the leaf action handler for a single route. */
function makeAction(route: RouteDef, params: string[], fields: FieldSpec[], queryDefs: NonNullable<RouteDef["query"]>) {
  return async (...cmdArgs: any[]) => {
    const command: Command = cmdArgs[cmdArgs.length - 1];
    const opts = command.optsWithGlobals();
    const positionals = cmdArgs.slice(0, params.length);

    const auth = resolveAuth({ apiKey: opts.apiKey, baseUrl: opts.baseUrl, profile: opts.profile });
    if (!auth.apiKey && !opts.dryRun) {
      fail("No API key. Run `falcon login`, pass --api-key, or set FALCON_API_KEY.");
    }

    // Substitute path params in declaration order.
    let path = route.path;
    params.forEach((p, i) => {
      path = path.replace(`{${p}}`, encodeURIComponent(String(positionals[i])));
    });

    // Query from documented filters (+ cursor/limit for cursor routes).
    const query: Record<string, unknown> = {};
    for (const q of queryDefs) {
      const v = opts[camel(q.name)];
      if (v === undefined) continue;
      if (q.enum && !q.enum.map(String).includes(String(v))) {
        fail(`--${kebab(q.name)} must be one of: ${q.enum.join(", ")}`);
      }
      query[q.name] = v;
    }
    if (route.cursor) {
      if (opts.limit !== undefined) query.limit = opts.limit;
    }

    // Body from --data plus generated field flags.
    let body: any = undefined;
    if (hasBody(route)) {
      if (opts.data !== undefined) body = readData(opts.data);
      if (fields.length) {
        const overlay: Record<string, any> = body && typeof body === "object" && !Array.isArray(body) ? body : {};
        let touched = body && typeof body === "object" && !Array.isArray(body);
        for (const f of fields) {
          const val = opts[camel(f.flag)];
          if (val === undefined) continue;
          if (f.enum && !f.enum.map(String).includes(String(val))) {
            fail(`--${f.flag} must be one of: ${f.enum.join(", ")}`);
          }
          overlay[f.name] = coerce(String(val), f.type);
          touched = true;
        }
        if (touched) body = overlay;
      }
      if (body === undefined) body = {}; // route wants a body; send an empty object
    }

    const client = new FalconClient({
      baseUrl: auth.baseUrl,
      apiKey: auth.apiKey,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });

    try {
      // Cursor auto-pagination: follow meta.next_cursor and concatenate the data arrays.
      if (route.cursor && opts.all && !opts.dryRun) {
        const acc: any[] = [];
        let cursor: string | undefined = opts.cursor ?? "";
        while (true) {
          const res = await client.request(route.method, path, { query: { ...query, cursor } });
          if (Array.isArray(res.data)) acc.push(...res.data);
          else if (res.data != null) acc.push(res.data);
          const next = res.meta?.next_cursor;
          if (!next) break;
          cursor = next;
        }
        emit(acc, opts);
        return;
      }

      if (route.cursor && opts.cursor !== undefined) query.cursor = opts.cursor;

      const res = await client.request(route.method, path, {
        query: Object.keys(query).length ? query : undefined,
        body,
        idempotencyKey: opts.idempotencyKey,
        autoIdempotency: route.idempotent && opts.idempotencyKey === undefined,
      });

      if (opts.dryRun) return;

      // Async job follow.
      if (route.async && opts.wait && res.status === 202 && res.data?.job_id) {
        const job = await waitForJob(client, res.data.job_id, {
          intervalMs: opts.pollInterval ? Number(opts.pollInterval) * 1000 : undefined,
        });
        emit(job, opts);
        if (job.status === "failed") process.exitCode = 1;
        return;
      }

      // Non-cursor pagination hint.
      if (res.meta?.next_cursor) {
        process.stderr.write(`↪ more results — pass --cursor ${res.meta.next_cursor} (or --all)\n`);
      }
      emit(res.status === 204 ? { ok: true } : res.data, opts);
    } catch (err: any) {
      fail(err?.message || String(err));
    }
  };
}

function emit(data: any, opts: any): void {
  if (opts.quiet) return;
  const format = (opts.output || "json") as OutputFormat;
  const out = render(data, { format, fields: opts.fields, pretty: opts.pretty ?? format !== "json" });
  process.stdout.write(out + "\n");
}

function fail(msg: string): never {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(1);
}

function camel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Build one commander Command per resource (tag), each with its route actions. */
export function buildResourceCommands(): Command[] {
  const byTag = new Map<string, RouteDef[]>();
  for (const r of ROUTE_REGISTRY) {
    if (!byTag.has(r.tag)) byTag.set(r.tag, []);
    byTag.get(r.tag)!.push(r);
  }

  const commands: Command[] = [];
  for (const tag of TAGS) {
    const routes = byTag.get(tag.name);
    if (!routes || !routes.length) continue;
    const resource = new Command(slugifyTag(tag.name)).description(tag.description);

    const used = new Set<string>();
    for (const route of routes) {
      let name = deriveActionName(route);
      // De-dupe within a resource (rare: two routes collapse to the same name).
      if (used.has(name)) {
        const params = pathParams(route.path);
        name = params.length ? `${name}-by-${params[params.length - 1]}` : `${route.method}-${name}`;
        let n = 2;
        while (used.has(name)) name = `${deriveActionName(route)}-${n++}`;
      }
      used.add(name);

      const params = pathParams(route.path);
      const fields = bodyFields(route);
      const queryDefs = route.query || [];

      const cmd = new Command(name);
      let desc = route.summary;
      if (route.flag) desc += `  [needs ${FLAG_LABELS[route.flag]}]`;
      cmd.description(desc);
      if (route.description) cmd.addHelpText("after", `\n${route.description}`);

      for (const p of params) cmd.argument(`<${p}>`, `path parameter: ${p}`);

      for (const q of queryDefs) {
        const o = new Option(`--${kebab(q.name)} <value>`, q.description || `filter: ${q.name}`);
        if (q.enum) o.choices(q.enum.map(String));
        cmd.addOption(o);
      }
      for (const f of fields) {
        const label = f.description ? `${f.description}` : `body field: ${f.name}`;
        const o = new Option(`--${f.flag} <value>`, f.required ? `(required) ${label}` : label);
        if (f.enum) o.choices(f.enum.map(String));
        cmd.addOption(o);
      }
      if (hasBody(route)) {
        cmd.option("--data <json>", "request body as JSON, @file.json, or - for stdin");
      }
      if (route.cursor) {
        cmd.option("--cursor <token>", "pagination cursor (keyset mode)");
        cmd.option("--limit <n>", "max rows per page (<=200)");
        cmd.option("--all", "auto-follow the cursor and return every page");
      }
      if (route.async) {
        cmd.option("--wait", "poll the async job to completion and print its result");
        cmd.option("--poll-interval <sec>", "seconds between job polls (with --wait)");
      }

      addGlobalOptions(cmd, { hidden: true });
      cmd.action(makeAction(route, params, fields, queryDefs));
      resource.addCommand(cmd);
    }
    commands.push(resource);
  }
  return commands;
}

/** A grouped index of resources (by TAG_GROUP) for the root --help. */
export function resourceIndex(): string {
  const lines: string[] = ["Resources (run `falcon <resource> --help`):", ""];
  for (const group of TAG_GROUPS) {
    lines.push(`  ${group.name}`);
    const slugs = group.tags.map(slugifyTag);
    lines.push("    " + slugs.join("  "));
    lines.push("");
  }
  lines.push("Plus: login · config · api (raw request) · completion");
  return lines.join("\n");
}
