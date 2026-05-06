# ADR-0011 — AI Operations Co-pilot v0 & Notification Polish (v8B)

Status: Accepted · 2026-04-26

## Context

v7 shipped queue + jobs + preferences. v8A shipped delivery (providers,
inbox, digest, retry metadata). v8B closes two gaps:

1. **Notification polish** — quiet hours that respect each recipient's
   timezone, an explicit retry-backoff schedule, HTML email templates,
   and an inbox surface for owners (not just internal staff).
2. **Read-only AI Operations Co-pilot** — the first assistant wired to
   live data. It produces a daily briefing for the operations dashboard,
   strictly via a small allowlist of read-only tools, with a
   deterministic fallback when AI is disabled.

Both ship behind defaults that keep production safe: AI is OFF unless
`ANTHROPIC_API_KEY` is set AND `AI_DRY_RUN=0`; HTML email is opt-in per
template; quiet-hours timezone defaults to `Asia/Makassar`.

## Decisions

### 1. AI is read-only, allowlisted, with a deterministic fallback

The Co-pilot has access to exactly eight read-only tools, each a thin
wrapper around an existing service the human user could call:

```
getOperationsMetrics       listJobRuns
listOperationTasks         listCalendarFeeds
listBookingConflicts       listServiceRequests
listLowStockItems          listMaintenanceTickets
```

`tools.ts:executeTool` rejects any name not in `ALLOWED_TOOLS`, even one
that exists elsewhere on the server. The provider loop calls
`executeTool` with whatever the model emits as a `tool_use` block, so
the model can't reach a write path through a misspelling or imagined
tool.

When AI is disabled (no key, or `AI_DRY_RUN=1`) the service skips the
network call entirely and persists the deterministic fallback summary
returned by `deterministicFallbackSummary(snapshot)`. The dashboard
always renders *something* — operators never see a blank state because
of an env miss.

When AI is enabled but the model errors / returns invalid JSON, the
service still writes a fallback summary and tags the run as `failed`
with the parse error in `error_message`. The /dashboard/ai/runs surface
shows blocked/failed runs alongside successes.

### 2. AI persistence — three tables

```
ai_assistant_runs        — one row per Co-pilot invocation
        │
        ├─ ai_assistant_tool_calls     — every tool dispatch (incl. blocked)
        │
        └─ ai_operations_summaries     — the rendered narrative + structure
```

- `ai_assistant_runs` carries assistant_key, status, model, token counts,
  latency, input/output summary (truncated), error message, who triggered.
- `ai_assistant_tool_calls` is append-only and includes blocked attempts
  (status='blocked'), giving us an audit trail of any allowlist violation.
- `ai_operations_summaries` stores the full structured response plus the
  `source_snapshot` the model saw — operators can replay context.

All three tables have RLS `internal_read` policies (super_admin / director
write via service-role; everyone with a role gets read).

### 3. Anthropic via plain `fetch` + AbortController

We don't pull in `@anthropic-ai/sdk` — the surface we need is small (one
endpoint, JSON in / JSON out, optional tool-use rounds), and the SDK
ships as ESM-only with peer dep churn. `provider.ts` calls
`https://api.anthropic.com/v1/messages` directly with:

- 20 second timeout via `AbortController`
- max 4 tool-use rounds (`MAX_TURNS`)
- max 1500 output tokens
- the system prompt + tool list + accumulating message history
- truncation of tool results to 8 KB before they go back into the prompt

The structured response is validated with `copilotResponseSchema` (Zod).
Anything that fails the schema falls back; we never persist
hallucinated shapes.

### 4. Daily summary job is disabled by default

`ai_operations_summary_refresh` is registered with `enabled = false` in
the seed catalog and is **not** wired into `/api/cron/run-all`. Operators
who want a fresh briefing waiting at 06:00 local can:

1. Flip the job to `enabled = true` from `/dashboard/jobs`.
2. Wire `/api/cron/ai-operations-summary` into Vercel Cron (or trigger
   manually from the Run-now button).

This avoids surprise token spend the moment someone sets
`ANTHROPIC_API_KEY`.

### 5. Timezone-aware quiet hours, no new dep

`quiet-hours.ts` evaluates each window in the recipient's IANA timezone
using `Intl.DateTimeFormat`. We resolve unknown / null tz to
`Asia/Makassar` (Arconique HQ). The trick for `nextQuietHoursEnd` is to
build a candidate UTC time from the wall-clock components, measure the
offset implied by that guess, and correct — no `date-fns-tz`, no
`luxon`.

`app_users.timezone` is the source per-recipient. Owners without a
linked app_user fall through to `Asia/Makassar`.

### 6. Retry backoff is a tiny pure schedule

`retry.ts` exports `computeNextRetryAt(attempt, maxAttempts, now)` and
`canRetry(deliveryAttempts, maxAttempts)`. The schedule is:

```
attempt 1 → +30 s
attempt 2 → +5 min
attempt 3 → +30 min
attempt ≥ maxAttempts → null  (queue row should mark failed)
```

`notification_queue.max_attempts` defaults to 3. The delivery loop
reads it per row, so operators can override per template via the
existing preferences UI later without a code change.

### 7. HTML email via templates table

`notification_templates` rows live per `(template_key, channel)` with an
optional `html_template`. Resend is updated to send HTML when the body
is set; SMS / WhatsApp ignore HTML. Rendering is `{{var}}` Mustache-lite,
HTML-escaped by default — we deliberately don't ship a `{{{raw}}}`
opt-out so operators can't accidentally inject markup from payload.

### 8. Owner portal inbox

`/owner/inbox` mirrors the internal inbox, scoped through
`isInboxRowVisibleToCurrentOwner` which validates the current app_user
against the inbox row's `app_user_id` *or* the owner_ids they've been
granted via `app_users_owners`. RLS on `in_app_notifications` already
enforces this; the explicit check gives us a clean error path.

## Trade-offs accepted

- **Token cost is per-operator opt-in.** The job stays disabled. Operators
  must flip a flag to spend money on a daily cadence.
- **Context size is capped, not summarised.** We don't run a separate
  summarisation pass over the snapshot; we cap each list at 10 rows and
  trust the model to ask for more via tools when it needs to.
- **Tool surface is intentionally small.** Adding a tool is a deliberate
  three-touch change (allowlist constant, dispatch case, definition). We
  never want this to be a one-line edit.
- **HTML escape is the only mode.** No raw HTML interpolation from
  payload. Operators who need rich content embed it in `html_template`.

## Out of scope (deferred)

- Multi-assistant orchestration. v8B ships exactly one assistant.
- Streaming responses. We read the full `messages` response and then
  render. Not worth the extra plumbing for a daily briefing.
- Owner-facing AI. The Co-pilot is internal; owner portal stays
  deterministic.
- Per-user quiet-hours preferences in UI (the fields exist in
  `notification_preferences`; admin UI for it lands when needed).

## Operational runbook

- **Enable AI**: set `ANTHROPIC_API_KEY` + `AI_DRY_RUN=0` in env, redeploy.
- **Test fallback**: leave `AI_DRY_RUN=1` and click Refresh. The summary
  should still render, tagged "fallback".
- **Refresh AI summary**: click Refresh on `/dashboard/operations` or
  `/dashboard/ai/operations`, or POST `/api/cron/ai-operations-summary`
  with `Authorization: Bearer $CRON_SECRET`.
- **Configure HTML email**: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` +
  `NOTIFICATIONS_DRY_RUN=0`. Edit / add rows in `notification_templates`.
- **Set per-user timezone**: `UPDATE app_users SET timezone =
  'Europe/Berlin' WHERE id = …` (admin UI for this lands later).
