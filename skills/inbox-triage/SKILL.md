---
name: inbox-triage
description: Triage the unified inbox with the Falcon CLI — read the reply feed and threads, reply/forward, label interested/not-interested, unsubscribe, and push repliers into a campaign. Use when asked to work replies from the terminal.
---

# Triage replies with Falcon

Assumes `falcon login` is done (see [[falcon-quickstart]]). Most thread actions are scoped to a sender
inbox, so they take an `<accountId>` positional. List inboxes with `falcon email-accounts list`.

## See what needs attention

```bash
falcon inbox feed -o table --fields id,from,subject,category      # cross-account reply feed
falcon inbox counts                                               # unread / category badges
falcon inbox threads <accountId> -o table                        # threads for one inbox
```

## Read a conversation

```bash
falcon inbox conversation <accountId> --data '{"thread_id":"…"}'   # full message history
```

(Confirm arg/field shapes with `falcon inbox conversation --help`.)

## Respond

```bash
falcon inbox create-reply <accountId> \
  --data '{"thread_id":"…","body":"Thanks — how does Tuesday look?"}'
falcon inbox create-forward <accountId> --data '{"thread_id":"…","to":"colleague@yourco.com"}'
falcon inbox create-send <accountId> --data '{"to":"x@y.com","subject":"Hi","body":"…"}'
```

Reuse a canned response by adding `"template_id":"…"` to the reply/send body (see `reply-templates`).

## Label outcomes

```bash
falcon inbox create-threads-interested <accountId> --data '{"thread_ids":["…"]}'
falcon inbox create-threads-not-interested <accountId> --data '{"thread_ids":["…"]}'
falcon inbox create-threads-unsubscribe-lead <accountId> --data '{"thread_ids":["…"]}'
```

## Re-enroll a replier

```bash
falcon inbox create-threads-push-to-campaign <accountId> \
  --data '{"thread_ids":["…"],"campaign_id":"…"}'
```

Tip: pipe `falcon inbox feed` through `jq` to batch-collect thread ids for the label/reply actions.
