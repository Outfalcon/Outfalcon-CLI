// `falcon api <METHOD> <path>` — raw escape hatch to any /api/v1 route, including ones added after
// this CLI was built. Path is relative to /api/v1 (leading slash optional).
import { Command } from "commander";
import { readFileSync } from "fs";
import { FalconClient } from "../client";
import { resolveAuth } from "../config";
import { render, type OutputFormat } from "../output";
import { addGlobalOptions } from "../globals";

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

export function apiCommand(): Command {
  const cmd = new Command("api")
    .description("Make a raw request to any /api/v1 endpoint")
    .argument("<method>", "HTTP method (get, post, patch, put, delete)")
    .argument("<path>", "path relative to /api/v1, e.g. /campaigns or campaigns/{id}")
    .option("-q, --query <k=v>", "query param (repeatable)", collect, [])
    .option("--data <json>", "request body: JSON string, @file.json, or - for stdin");
  addGlobalOptions(cmd, { hidden: true });
  return cmd
    .action(async (method: string, path: string, opts: any, command: Command) => {
      const g = command.optsWithGlobals();
      const auth = resolveAuth({ apiKey: g.apiKey, baseUrl: g.baseUrl, profile: g.profile });
      if (!auth.apiKey && !g.dryRun) {
        process.stderr.write("✗ No API key. Run `falcon login` or pass --api-key.\n");
        process.exit(1);
      }

      const query: Record<string, string> = {};
      for (const pair of opts.query as string[]) {
        const idx = pair.indexOf("=");
        if (idx === -1) {
          process.stderr.write(`✗ --query expects k=v, got "${pair}"\n`);
          process.exit(1);
        }
        query[pair.slice(0, idx)] = pair.slice(idx + 1);
      }

      let body: any;
      if (opts.data !== undefined) {
        let text = opts.data;
        if (opts.data === "-") text = readFileSync(0, "utf8");
        else if (opts.data.startsWith("@")) text = readFileSync(opts.data.slice(1), "utf8");
        body = JSON.parse(text);
      }

      const client = new FalconClient({
        baseUrl: auth.baseUrl,
        apiKey: auth.apiKey,
        dryRun: g.dryRun,
        verbose: g.verbose,
      });

      try {
        const res = await client.request(method, path, {
          query: Object.keys(query).length ? query : undefined,
          body,
          idempotencyKey: g.idempotencyKey,
        });
        if (g.dryRun) return;
        if (g.quiet) return;
        const format = (g.output || "json") as OutputFormat;
        const data = res.status === 204 ? { ok: true } : res.data;
        process.stdout.write(render(data, { format, fields: g.fields, pretty: g.pretty ?? format !== "json" }) + "\n");
      } catch (err: any) {
        process.stderr.write(`✗ ${err?.message || err}\n`);
        process.exit(1);
      }
    });
}
