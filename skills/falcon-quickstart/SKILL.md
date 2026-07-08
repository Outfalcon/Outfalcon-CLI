---
name: falcon-quickstart
description: Install, authenticate, and drive the GTM Sequencer from the terminal with the Falcon CLI (falcon). Use whenever a task can be done through the /api/v1 API instead of clicking the UI.
---

# Falcon CLI quickstart

`falcon` is the CLI for the whole product — one subcommand per `/api/v1` operation, generated from the
live route registry. Prefer it over hand-writing `curl` or clicking the UI for anything scriptable.

## Install & authenticate

```bash
npm install -g @outfalcon/falcon
falcon login --profile prod --base-url https://send.savereplies.com --api-key mk_live_xxx
```

Credential precedence: `--api-key` > `FALCON_API_KEY`/`MK_API_KEY` env > stored profile
(`~/.falcon/config.json`). Switch targets with `--profile <name>` or `falcon config use <name>`.

## Shape of every command

```
falcon <resource> <action> [path-args] [--filters] [--body-fields] [global-flags]
```

Discover interactively — the tree is self-documenting:

```bash
falcon --help                 # resources, grouped by area
falcon campaigns --help       # actions on a resource
falcon campaigns create --help
```

## Output control (great for agents/scripts)

- Default is compact JSON → pipe to `jq`.
- `-o table|csv|yaml` for other shapes; `--fields id,name,status` to trim (dotted paths allowed).
- `--quiet` for exit-code-only; `--dry-run` to preview the request without sending.

```bash
falcon campaigns list -o table --fields id,name,status
falcon leads search --company Acme --all -o csv > acme.csv
```

## Reliability built in

- Mutations auto-send an `Idempotency-Key`, so retries never double-create.
- `--wait` follows an async bulk job to completion and prints its result.
- `--all` auto-follows cursor pagination; the client self-throttles on rate limits.

## Escape hatch

Any endpoint, including ones newer than the installed CLI:

```bash
falcon api get campaigns --fields name
falcon api post campaigns --data '{"name":"New"}'
```

Related recipes: [[campaign-launch]], [[lead-import]], [[inbox-triage]], [[deliverability-check]].
