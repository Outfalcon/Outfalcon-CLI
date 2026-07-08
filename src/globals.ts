// Global options are declared visibly on the root program (for `falcon --help`) AND, as hidden
// copies without defaults, on every leaf command — so they parse whether written before or after
// the subcommand (`falcon --api-key K campaigns list` and `falcon campaigns list --api-key K` both
// work). Defaults live ONLY on the root copy; the hidden leaf copies stay unset so they never clobber
// a value the user passed before the subcommand when optsWithGlobals() merges parent→child.
import { Command, Option } from "commander";

export function addGlobalOptions(cmd: Command, { hidden }: { hidden: boolean }): Command {
  const mk = (o: Option) => (hidden ? o.hideHelp() : o);
  // No default on `output` — commander's optsWithGlobals() lets an ancestor's value win over a
  // descendant's, so a root default would clobber a leaf `-o table`. The "json" fallback is applied
  // at read-time (see emit()/api command) instead. Keep the hint in the description for --help.
  const output = new Option("-o, --output <format>", "output format (default: json)").choices(["json", "table", "csv", "yaml"]);
  cmd
    .addOption(mk(new Option("--api-key <key>", "API key (overrides env + profile)")))
    .addOption(mk(new Option("--base-url <url>", "API base URL (overrides env + profile)")))
    .addOption(mk(new Option("--profile <name>", "config profile to use")))
    .addOption(mk(output))
    .addOption(mk(new Option("--fields <list>", "comma-separated dotted fields to keep (e.g. id,name,status)")))
    .addOption(mk(new Option("--pretty", "pretty-print JSON")))
    .addOption(mk(new Option("--quiet", "suppress output (exit code only)")))
    .addOption(mk(new Option("--idempotency-key <key>", "set the Idempotency-Key header explicitly")))
    .addOption(mk(new Option("--dry-run", "print the request instead of sending it")))
    .addOption(mk(new Option("-v, --verbose", "log each request to stderr")));
  return cmd;
}
