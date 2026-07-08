---
name: deliverability-check
description: Audit sending health with the Falcon CLI — domain/inbox health rollups, SPF/DKIM/DMARC/MX checks, alert rules and alert events. Use when asked to check deliverability or diagnose why sends are bouncing.
---

# Check deliverability with Falcon

Assumes `falcon login` is done (see [[falcon-quickstart]]).

## Health rollup first

```bash
falcon deliverability health -o table              # per-domain/inbox health summary
falcon deliverability timeseries -o table          # trend over time
```

## DNS / authentication

```bash
falcon deliverability dns -o table                 # SPF / DKIM / DMARC / MX per sending domain
falcon deliverability create-dns-recheck --data '{"domain":"yourco.com"}'
```

Anything not `pass` here is the usual root cause of spam-foldering or bounces — fix DNS before scaling.

## Failing inboxes

```bash
falcon alerts list -o table                        # which sender inboxes are erroring/paused
falcon email-accounts list --fields id,email,send_status,health -o table
falcon email-accounts create-recheck-connection <accountId>   # re-probe after a fix
```

## Alert rules

Automate the watch — e.g. page when a domain's bounce rate crosses a threshold:

```bash
falcon deliverability rules -o table
falcon deliverability create-rules --data '{
  "name":"High bounce","metric":"bounce_rate","comparator":"above",
  "threshold":0.05,"window_days":7,"scope":"domain","min_sends":30
}'
falcon deliverability alerts -o table              # recent alert events
falcon deliverability create-alerts-ack --data '{"alert_id":"…"}'
```

Confirm rule fields with `falcon deliverability create-rules --help` (metric/comparator/scope are
validated enums). Warmup pool status lives under `falcon warmup …`.
