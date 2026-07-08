# Falcon — CLI for the GTM Sequencer API

`falcon` puts the entire product on your command line. Every `/api/v1` operation is a subcommand,
generated from the same route registry that backs the OpenAPI spec and the MCP server — so the CLI
can **never drift** from the API, and new endpoints show up automatically.

```bash
npm install -g @outfalcon/falcon
falcon login
falcon campaigns list -o table
```

## Why Falcon

- **Complete** — one command per API operation (campaigns, leads, inboxes, deliverability, flows,
  AI agents, webhooks, analytics, warmup, calls, LinkedIn…), grouped by resource.
- **Agent- and script-friendly** — JSON by default so `falcon … | jq` just works; `--fields` trims
  responses without a second tool.
- **Safe by default** — mutations send an auto-generated `Idempotency-Key`, so a retried command
  never double-creates.
- **Async-aware** — `--wait` follows a bulk job to completion and prints its result.
- **Handles scale** — `--all` auto-follows cursor pagination; the client self-throttles on rate limits.
- **Never stuck** — `falcon api <METHOD> <path>` calls any endpoint directly, including ones newer
  than your installed CLI.

## Authenticating

`falcon login` stores a base URL + API key under a profile in `~/.falcon/config.json`:

```bash
falcon login                       # prompts for base URL + mk_live_ key, validates against /team/me
falcon login --profile prod --base-url https://send.savereplies.com --api-key mk_live_xxx
```

Resolution precedence for every command: **`--api-key` flag > `FALCON_API_KEY` (or `MK_API_KEY`) env >
stored profile**. Base URL: `--base-url` > `FALCON_BASE_URL` > profile > `http://localhost:3000`.
Set `FALCON_CONFIG_DIR` to relocate the config file (e.g. to scope a CI run).

Manage profiles:

```bash
falcon config list
falcon config use prod
falcon config set base-url https://send.savereplies.com --profile staging
```

Mint a key with `falcon api-keys create --name "cli"` (needs the `team` scope) or from the web UI.

## Command shape

```
falcon <resource> <action> [path-args] [--filters] [--body-fields] [global-flags]
```

- **Path params** are positional: `falcon campaigns get <id>`.
- **Documented filters** are flags with validated choices: `falcon campaigns list --archived true`.
- **Request-body fields** are flags: `falcon campaigns create --name "Q3 Launch"`.
- **Whole bodies** via `--data`: a JSON string, `@file.json`, or `-` for stdin (overlaid by field flags).

```bash
falcon leads create --email ada@example.com --first-name Ada
falcon leads create-bulk-upsert --data @leads.json --wait
falcon leads search --company "Acme" --all -o csv > acme.csv
falcon inbox <accountId> send --data '{"to":"x@y.com","subject":"Hi","body":"…"}'
```

## Global flags

| Flag | Purpose |
|------|---------|
| `-o, --output json\|table\|csv\|yaml` | output format (default `json`) |
| `--fields a,b.c` | keep only these dotted fields |
| `--pretty` | pretty-print JSON |
| `--quiet` | suppress output (exit code only) |
| `--api-key`, `--base-url`, `--profile` | override credentials/target |
| `--idempotency-key <k>` | set the Idempotency-Key header explicitly |
| `--dry-run` | print the request instead of sending it |
| `-v, --verbose` | log each request to stderr |

Global flags work **before or after** the subcommand.

## Shell completion

```bash
falcon completion bash  >> ~/.bashrc      # or: eval "$(falcon completion bash)"
falcon completion zsh   >> ~/.zshrc
falcon completion fish  | source
```

## Raw requests

```bash
falcon api get campaigns --fields name
falcon api post campaigns --data '{"name":"New"}'
falcon api get leads/search --query "cursor=" --query "limit=50"
```

## Exit codes

`0` success · `1` request/validation error (message on stderr, prefixed `✗`) · a failed `--wait` job
also exits `1`.

## Keeping the command tree in sync

Every command is generated from `src/vendor/openapi.ts` — a verbatim copy of the sequencer backend's
route registry (`src/api/v1/openapi.ts`), a zero-import, pure-data module. When the API gains routes,
refresh the vendored copy:

```bash
MAILBOXY_OPENAPI=/path/to/backend/src/api/v1/openapi.ts npm run sync:registry
npm run build && npm test
```

The sync script refuses to vendor a file that has imports, so the bundle stays dependency-free. Because
commands are derived from the registry rather than hand-written, they can't drift within a given sync.

## Develop

```bash
npm install
npm run build      # tsup → dist/index.js (single CJS bundle, shebang)
npm test           # vitest
npm run typecheck  # tsc --noEmit
node dist/index.js --help
```
