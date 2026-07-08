---
name: campaign-launch
description: Create, configure, and launch a cold-email campaign end-to-end with the Falcon CLI — steps/variants, sender inboxes, leads, then activate. Use when asked to set up or start a campaign from the terminal.
---

# Launch a campaign with Falcon

Assumes `falcon login` is done (see [[falcon-quickstart]]). Capture ids from JSON output with `jq`.

## 1. Create the campaign

A new campaign comes pre-seeded with one empty step (order 1) and one "A" variant at 100% — fill those
in rather than adding a duplicate first step.

```bash
CID=$(falcon campaigns create --name "Q3 Launch" -o json | jq -r '.id')
```

## 2. Write the first step's copy

Find the step + variant ids, then set the subject/body on the variant:

```bash
falcon campaigns sequences "$CID"              # shows steps[] with variants[]
falcon campaigns update-variants <variantId> \
  --data '{"subject":"Quick question, {{first_name}}","body":"Hi {{first_name}}, …"}'
```

Add follow-up steps as needed:

```bash
falcon campaigns create-steps "$CID" --data '{"wait_days":3}'
falcon campaigns create-steps-variants <stepId> --data '{"subject":"Re: …","body":"…"}'
```

Check the exact body fields with `falcon campaigns create-steps --help` / `update-variants --help`.

## 3. Assign sender inboxes

By explicit account ids, or by an inbox tag (assign every inbox carrying that tag):

```bash
falcon campaigns create-accounts "$CID" --data '{"account_ids":["…","…"]}'
falcon campaigns create-accounts-by-tag "$CID" --data '{"tag_id":"…"}'
```

## 4. Add leads

Push an existing lead list into the campaign, or add leads directly:

```bash
falcon leads create-push-to-campaign --data '{"campaign_id":"'"$CID"'","list_id":"…"}'
# or
falcon campaigns create-leads "$CID" --data '{"leads":[{"email":"a@b.com","first_name":"Ada"}]}'
```

## 5. Preview, test, launch

```bash
falcon campaigns create-preview "$CID" --data '{"lead_email":"a@b.com"}'
falcon campaigns create-send-test-email "$CID" --data '{"to":"you@yourco.com"}'
falcon campaigns update-status "$CID" --status active
```

## Monitor

```bash
falcon campaigns metrics "$CID"
falcon campaigns analytics-by-date "$CID" -o table
```

Pause anytime: `falcon campaigns update-status "$CID" --status paused`.
