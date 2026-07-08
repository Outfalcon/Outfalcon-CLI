// `falcon login` — store a base URL + API key under a named profile, validated against the API.
import { Command } from "commander";
import { createInterface } from "readline";
import { FalconClient } from "../client";
import { setProfile, resolveAuth, DEFAULT_BASE_URL, configPath } from "../config";

function prompt(question: string, { silent = false }: { silent?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (silent) {
    // Mask the API key while typing.
    const out = process.stdout as any;
    (rl as any)._writeToOutput = (str: string) => {
      if (str.includes(question)) out.write(str);
      else out.write("*");
    };
  }
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); process.stdout.write("\n"); resolve(a.trim()); }));
}

export function loginCommand(): Command {
  return new Command("login")
    .description("Store an API key + base URL for a profile (validated against /team/me)")
    .option("--profile <name>", "profile name to store under", "default")
    .option("--api-key <key>", "mk_live_ API key (skips the prompt)")
    .option("--base-url <url>", "API base URL (skips the prompt)")
    .action(async (opts) => {
      const existing = resolveAuth({ profile: opts.profile });
      const baseUrl =
        opts.baseUrl ||
        (await prompt(`Base URL [${existing.baseUrl || DEFAULT_BASE_URL}]: `)) ||
        existing.baseUrl ||
        DEFAULT_BASE_URL;
      const apiKey = opts.apiKey || (await prompt("API key (mk_live_…): ", { silent: true }));

      if (!apiKey) {
        process.stderr.write("✗ No API key provided.\n");
        process.exit(1);
      }

      const client = new FalconClient({ baseUrl, apiKey });
      try {
        const res = await client.request("get", "/team/me");
        setProfile(opts.profile, { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }, true);
        const me = res.data || {};
        process.stdout.write(
          `✓ Logged in as ${me.rbac_role || me.role || "api_key"} (profile "${opts.profile}") → ${baseUrl}\n` +
            `  saved to ${configPath()}\n`
        );
      } catch (err: any) {
        process.stderr.write(`✗ Login failed: ${err?.message || err}\n`);
        process.exit(1);
      }
    });
}
