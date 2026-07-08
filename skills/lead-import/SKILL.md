---
name: lead-import
description: Import, upsert, and search leads with the Falcon CLI — single leads, large async bulk-upsert, CSV into a list, and filtered search/export. Use when asked to load, dedupe, or pull leads from the terminal.
---

# Import & search leads with Falcon

Assumes `falcon login` is done (see [[falcon-quickstart]]).

## One-off lead

```bash
falcon leads create --email ada@example.com --first-name Ada --company "Analytical Engines"
```

## Bulk upsert (async, up to 50k) — the workhorse

Upsert-by-email with non-empty-field merge. Returns a job; `--wait` follows it to completion.

```bash
# leads.json → { "leads": [ { "email": "...", "first_name": "..." }, ... ] }
falcon leads create-bulk-upsert --data @leads.json --wait
# → { "status":"completed", "result": { "created": N, "updated": M, "errors": [] } }
```

Prefer this over looping `leads create` per row — one request, safe to retry (auto Idempotency-Key),
and you get a clean created/updated/errors summary.

## CSV into a named list

```bash
LIST=$(falcon leads create-lists --name "Acme prospects" -o json | jq -r '.id')
falcon leads create-lists-upload-preview "$LIST" --data @rows.json   # map columns, sanity-check
falcon leads create-lists-upload "$LIST" --data @rows.json           # commit the import
```

Check field shapes with `falcon leads create-lists-upload-preview --help`.

## Filtered search & export

All filters AND together; at least one is required. Paginate everything with `--all`.

```bash
falcon leads search --company Acme --title "VP" --all -o csv > acme.csv
falcon leads by-email --email ada@example.com          # look up one lead
falcon leads lists-facets "$LIST"                      # available filter values for a list
```

## Push to a campaign

```bash
falcon leads create-push-to-campaign --data '{"campaign_id":"…","list_id":"'"$LIST"'"}'
```

See [[campaign-launch]] to take it from list → live campaign.
