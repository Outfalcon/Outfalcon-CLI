// `falcon config …` — inspect and edit stored profiles.
import { Command } from "commander";
import { loadConfig, saveConfig, configPath } from "../config";

function redactKey(k?: string): string {
  if (!k) return "(none)";
  return k.length > 12 ? k.slice(0, 12) + "…" : k.slice(0, 4) + "…";
}

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage stored profiles (~/.falcon/config.json)");

  cmd
    .command("list")
    .description("List profiles and the active one")
    .action(() => {
      const cfg = loadConfig();
      const names = Object.keys(cfg.profiles);
      if (!names.length) {
        process.stdout.write(`No profiles yet. Run \`falcon login\`.\n(${configPath()})\n`);
        return;
      }
      for (const name of names) {
        const p = cfg.profiles[name];
        const mark = name === cfg.current ? "*" : " ";
        process.stdout.write(`${mark} ${name}\t${p.baseUrl || "(default)"}\t${redactKey(p.apiKey)}\n`);
      }
    });

  cmd
    .command("use <profile>")
    .description("Set the active profile")
    .action((profile: string) => {
      const cfg = loadConfig();
      if (!cfg.profiles[profile]) {
        process.stderr.write(`✗ No such profile: ${profile}\n`);
        process.exit(1);
      }
      cfg.current = profile;
      saveConfig(cfg);
      process.stdout.write(`✓ Active profile: ${profile}\n`);
    });

  cmd
    .command("set <key> <value>")
    .description("Set base-url or api-key on a profile (--profile, default: active)")
    .option("--profile <name>", "profile to edit")
    .action((key: string, value: string, opts: { profile?: string }) => {
      const cfg = loadConfig();
      const name = opts.profile || cfg.current || "default";
      const p = cfg.profiles[name] || {};
      if (key === "base-url" || key === "baseUrl") p.baseUrl = value.replace(/\/+$/, "");
      else if (key === "api-key" || key === "apiKey") p.apiKey = value;
      else {
        process.stderr.write(`✗ Unknown key "${key}" (use base-url | api-key)\n`);
        process.exit(1);
      }
      cfg.profiles[name] = p;
      if (!cfg.current) cfg.current = name;
      saveConfig(cfg);
      process.stdout.write(`✓ ${name}.${key} updated\n`);
    });

  cmd
    .command("get [profile]")
    .description("Show a profile (key redacted)")
    .action((profile?: string) => {
      const cfg = loadConfig();
      const name = profile || cfg.current || "default";
      const p = cfg.profiles[name];
      if (!p) {
        process.stderr.write(`✗ No such profile: ${name}\n`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({ profile: name, baseUrl: p.baseUrl, apiKey: redactKey(p.apiKey) }, null, 2) + "\n");
    });

  cmd
    .command("path")
    .description("Print the config file path")
    .action(() => {
      process.stdout.write(configPath() + "\n");
    });

  return cmd;
}
