// `falcon completion <shell>` — print a shell completion script for resources + actions.
import { Command } from "commander";
import { buildResourceCommands } from "../generate";

const EXTRA = ["login", "config", "api", "completion", "help"];

function commandMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const resource of buildResourceCommands()) {
    map[resource.name()] = resource.commands.map((c) => c.name());
  }
  return map;
}

function bash(map: Record<string, string[]>): string {
  const resources = [...Object.keys(map), ...EXTRA].join(" ");
  const cases = Object.entries(map)
    .map(([res, actions]) => `        ${res}) COMPREPLY=( $(compgen -W "${actions.join(" ")}" -- "$cur") ); return;;`)
    .join("\n");
  return `# falcon bash completion — eval "$(falcon completion bash)"
_falcon() {
  local cur prev words cword
  _get_comp_words_by_ref -n : cur prev words cword 2>/dev/null || { cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"; }
  if [ "$cword" -le 1 ]; then
    COMPREPLY=( $(compgen -W "${resources}" -- "$cur") ); return
  fi
  case "\${words[1]}" in
${cases}
  esac
}
complete -F _falcon falcon
`;
}

function zsh(map: Record<string, string[]>): string {
  const resources = [...Object.keys(map), ...EXTRA].join(" ");
  const cases = Object.entries(map)
    .map(([res, actions]) => `      ${res}) compadd ${actions.join(" ")} ;;`)
    .join("\n");
  return `# falcon zsh completion — eval "$(falcon completion zsh)"
_falcon() {
  if (( CURRENT == 2 )); then
    compadd ${resources}; return
  fi
  case "\${words[2]}" in
${cases}
  esac
}
compdef _falcon falcon
`;
}

function fish(map: Record<string, string[]>): string {
  const lines: string[] = ["# falcon fish completion — falcon completion fish | source"];
  const resources = [...Object.keys(map), ...EXTRA];
  for (const r of resources) lines.push(`complete -c falcon -n '__fish_use_subcommand' -a '${r}'`);
  for (const [res, actions] of Object.entries(map)) {
    for (const a of actions) {
      lines.push(`complete -c falcon -n '__fish_seen_subcommand_from ${res}' -a '${a}'`);
    }
  }
  return lines.join("\n") + "\n";
}

export function completionCommand(): Command {
  return new Command("completion")
    .description("Output a shell completion script (bash | zsh | fish)")
    .argument("<shell>", "bash, zsh, or fish")
    .action((shell: string) => {
      const map = commandMap();
      const out = shell === "zsh" ? zsh(map) : shell === "fish" ? fish(map) : shell === "bash" ? bash(map) : null;
      if (!out) {
        process.stderr.write(`✗ Unsupported shell "${shell}" (bash | zsh | fish)\n`);
        process.exit(1);
      }
      process.stdout.write(out);
    });
}
