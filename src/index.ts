import { Command } from "commander";
import { ROUTE_REGISTRY } from "./registry";
import { buildResourceCommands, resourceIndex } from "./generate";
import { addGlobalOptions } from "./globals";
import { loginCommand } from "./commands/login";
import { configCommand } from "./commands/config";
import { apiCommand } from "./commands/api";
import { completionCommand } from "./commands/completion";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("falcon")
  .description(
    `Falcon — CLI for the GTM Sequencer API.\n` +
      `${ROUTE_REGISTRY.length} operations, generated from the live route registry (always in sync).`
  )
  .version(VERSION, "-V, --version")
  .showSuggestionAfterError(true)
  .enablePositionalOptions() // let subcommands own their positional args
  .configureHelp({ showGlobalOptions: true });

// Global options — visible on the root; hidden copies are added to each leaf command (see globals.ts)
// so they can be written before OR after the subcommand.
addGlobalOptions(program, { hidden: false });

// Hand-written commands.
program.addCommand(loginCommand());
program.addCommand(configCommand());
program.addCommand(apiCommand());
program.addCommand(completionCommand());

// Generated resource commands (one per API tag).
for (const resource of buildResourceCommands()) program.addCommand(resource);

program.addHelpText("after", "\n" + resourceIndex());

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`✗ ${err?.message || err}\n`);
  process.exit(1);
});
