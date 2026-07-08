# Falcon

**Your entire cold-email stack, in the terminal.** `falcon` wraps the GTM Sequencer API so you can run
campaigns, leads, inboxes, deliverability, automations, and analytics from the command line, a script,
a CI pipeline, or an AI agent — **249 operations, one command each.**

```bash
npm install -g @outfalcon/falcon
falcon login
falcon campaigns list -o table
```

Built for humans *and* automation: JSON by default so it pipes to `jq`, safe retries via automatic
idempotency keys, one-flag pagination and job-waiting, and a raw escape hatch for anything not yet
wrapped. Every command is generated from the live API registry, so the CLI never drifts from the API.

---

## What you can do

- **Campaigns** — create, sequence (steps + A/B variants), schedule, assign inboxes, launch, pause, duplicate, measure.
- **Leads** — import one or 50,000, upsert-by-email, CSV into lists, advanced filtered search, export, push into campaigns.
- **Unified inbox** — read the reply feed, reply/forward, label interested/not-interested, unsubscribe, re-enroll repliers.
- **Deliverability** — domain/inbox health, SPF/DKIM/DMARC/MX checks, alert rules.
- **Sender infrastructure** — connect inboxes, set limits/signatures, warmup, health rechecks.
- **Automation** — flows/subsequences, AI reply agents, reply templates, tasks.
- **Platform** — workspaces (agency), team/RBAC, API keys, webhooks, analytics, blocklist.

Run `falcon --help` for the grouped map, `falcon <resource> --help` for a resource, and
`falcon <resource> <action> --help` for a command's flags.

---

## Setup

```bash
# 1. Install
npm install -g @outfalcon/falcon

# 2. Log in (prompts for your instance URL + mk_live_ API key, validates against the API)
falcon login --profile prod --base-url https://send.yourinstance.com --api-key mk_live_xxx

# 3. Verify
falcon team me --pretty
```

Mint an API key with `falcon api-keys create --name cli` (needs the `team` scope) or from the web UI.

### Authentication

Credentials resolve in this order, for both the key and the base URL:

| | Key | Base URL |
|---|---|---|
| 1. flag | `--api-key` | `--base-url` |
| 2. env | `FALCON_API_KEY` / `MK_API_KEY` | `FALCON_BASE_URL` |
| 3. profile | stored by `falcon login` | stored by `falcon login` |

Profiles live in `~/.falcon/config.json` (relocate with `FALCON_CONFIG_DIR`). Keep several — one per
workspace or environment — and switch with `--profile <name>` or `falcon config use <name>`.

---

## Quick start — launch a campaign end to end

```bash
# Create a campaign (comes with one empty step + an "A" variant)
CID=$(falcon campaigns create --name "Q3 Launch" -o json | jq -r '.id')

# Write the first step's copy
falcon campaigns sequences "$CID"                       # find step + variant ids
falcon campaigns update-variants <variantId> \
  --data '{"subject":"Quick question, {{first_name}}","body":"Hi {{first_name}}, …"}'

# Assign sender inboxes (by id, or by tag), then add leads
falcon campaigns create-accounts-by-tag "$CID" --data '{"tag_id":"<tag>"}'
falcon leads create-push-to-campaign --data '{"campaign_id":"'"$CID"'","list_id":"<list>"}'

# Preview, test, launch
falcon campaigns create-send-test-email "$CID" --data '{"to":"you@yourco.com"}'
falcon campaigns update-status "$CID" --status active

# Watch it work
falcon campaigns metrics "$CID"
```

---

## Recipes

### Import leads at scale (async, safe to retry)

```bash
# leads.json → { "leads": [ { "email": "...", "first_name": "..." }, ... ] }  (up to 50k)
falcon leads create-bulk-upsert --data @leads.json --wait
# → follows the job to completion: { "result": { "created": 4211, "updated": 380, "errors": [] } }
```

`--wait` polls the async job and prints its result; the upload auto-carries an `Idempotency-Key`, so a
re-run never double-imports.

### Pull a filtered segment to CSV (auto-paginated)

```bash
falcon leads search --company "Acme" --title "VP" --all -o csv > vps-at-acme.csv
```

`--all` follows the cursor across every page; `-o csv` writes a spreadsheet-ready file.

### Triage the reply inbox

```bash
falcon inbox feed -o table --fields from,subject,category      # what needs attention
falcon inbox create-reply <accountId> --data '{"thread_id":"<t>","body":"How's Tuesday?"}'
falcon inbox create-threads-interested <accountId> --data '{"thread_ids":["<t>"]}'
```

### Diagnose deliverability

```bash
falcon deliverability health -o table       # per-domain/inbox rollup
falcon deliverability dns -o table          # SPF / DKIM / DMARC / MX — fix anything not "pass"
falcon alerts list -o table                 # failing / paused inboxes
```

### Use it in CI / scripts

```bash
export FALCON_API_KEY=mk_live_xxx
export FALCON_BASE_URL=https://send.yourinstance.com

# Nightly: fail the job if any sending domain is unhealthy
unhealthy=$(falcon deliverability health -o json | jq '[.[] | select(.status != "healthy")] | length')
[ "$unhealthy" -eq 0 ] || { echo "::error::$unhealthy unhealthy domains"; exit 1; }
```

---

## Output & piping

JSON is the default so everything composes with `jq`. Switch shape with `-o`, trim with `--fields`.

```bash
falcon campaigns list                                  # compact JSON (pipe-friendly)
falcon campaigns list --pretty                         # indented JSON
falcon campaigns list -o table --fields id,name,status # human table, chosen columns
falcon leads search --company Acme --all -o csv         # CSV
falcon campaigns get <id> -o yaml                      # YAML
falcon campaigns update-status <id> --status paused --quiet   # no output, exit code only
```

`--fields` accepts dotted paths (`meta.status`) and works on any format.

---

## Why Falcon (vs. curl, or a thinner CLI)

| | Falcon |
|---|---|
| **Async jobs** | `--wait` follows a bulk job to completion and returns its result |
| **Pagination** | `--all` auto-follows cursors; no manual token juggling |
| **Safe retries** | auto `Idempotency-Key` on mutations — reruns never duplicate |
| **Rate limits** | self-throttles on 429 and honors `Retry-After` transparently |
| **Output** | `json \| table \| csv \| yaml` + `--fields` projection |
| **Profiles** | multi-workspace credentials, switch with one flag |
| **Escape hatch** | `falcon api <method> <path>` reaches any endpoint, even brand-new ones |
| **Never stale** | commands are generated from the API registry, not hand-maintained |

---

## Command reference

Commands are grouped by resource. This is the map; use `--help` on any of them for exact flags.

**Account & access** — `workspaces` · `api-keys` · `team`
**Sending infrastructure** — `email-accounts` · `tags` · `warmup` · `deliverability` · `alerts`
**Leads** — `leads` · `lead-list-groups`
**Campaigns & automation** — `campaigns` · `campaign-groups` · `scheduled-emails` · `flows` · `ai-agents`
**Inbox & engagement** — `inbox` · `ai-replies` · `reply-templates` · `tasks` · `labels` · `ignore-phrases` · `calls` · `linkedin`
**Analytics & platform** — `analytics` · `blocklist` · `webhooks` · `integrations` · `jobs`

Actions follow a predictable shape per resource:

```bash
falcon <resource> list [--filters]          # e.g. falcon email-accounts list -o table
falcon <resource> get <id>                  # e.g. falcon campaigns get <id>
falcon <resource> create [--field v | --data @f.json]
falcon <resource> update <id> [--field v | --data …]
falcon <resource> delete <id>
```

Path parameters are positional; documented filters and request-body fields are flags (with validated
choices where the API defines an enum). Anything can also be passed wholesale with
`--data '<json>'`, `--data @file.json`, or `--data -` (stdin).

### Global flags

| Flag | Purpose |
|------|---------|
| `-o, --output json\|table\|csv\|yaml` | output format (default `json`) |
| `--fields a,b.c` | keep only these dotted fields |
| `--pretty` / `--quiet` | indent JSON / suppress output |
| `--api-key` / `--base-url` / `--profile` | override credentials & target |
| `--idempotency-key <k>` | set the Idempotency-Key header explicitly |
| `--dry-run` | print the request instead of sending it |
| `-v, --verbose` | log each request to stderr |

Global flags work **before or after** the subcommand.

### Raw requests

```bash
falcon api get campaigns --fields name
falcon api post campaigns --data '{"name":"New"}'
falcon api get leads/search --query "cursor=" --query "limit=50"
```

### Shell completion

```bash
falcon completion bash  >> ~/.bashrc     # or: eval "$(falcon completion bash)"
falcon completion zsh   >> ~/.zshrc
falcon completion fish  | source
```

### Exit codes

`0` success · `1` request/validation error (message on stderr, prefixed `✗`) · a failed `--wait` job
also exits `1`.

---

## Keeping the command tree in sync

Every command is generated from `src/vendor/openapi.ts` — a verbatim copy of the backend's route
registry (a zero-import, pure-data module). CI refreshes it daily; to do it locally:

```bash
MAILBOXY_OPENAPI=/path/to/backend/src/api/v1/openapi.ts npm run sync:registry
npm run build && npm test
```

The sync script refuses to vendor a file containing imports, so the bundle stays dependency-free.

## Develop

```bash
npm install
npm run build      # tsup → dist/index.js (single CJS bundle, shebang)
npm test           # vitest (26 tests)
npm run typecheck  # tsc --noEmit
node dist/index.js --help
```

## License

MIT
