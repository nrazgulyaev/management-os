# Packet C · PR 3 — cron runners (statement-preparer + owner-concierge)

**Goal:** Close the two cron / trigger plumbing gaps flagged in Packet A:
- `statement-preparer` — 1st-of-month 06:00 cron (registry entry exists, no job-runner file)
- `owner-concierge` — post-insert hook on `owner_messages` (registry entry exists, no action-side trigger)

After this PR, both agents actually run on schedule / on event. No new tables.

## What to build

### 1. `src/features/jobs/statement-preparer-job.ts` (new)

Pattern source: `src/features/jobs/notification-digest-job.ts` (~110 lines, good exemplar).

Skeleton:

```ts
import "server-only";
import { withJobLock } from "./locks";
import { getDb } from "@/lib/db/client";
import { runStatementPreparerAgent } from "@/features/ai-agents/statements/statement-preparer";

export async function runStatementPreparerJob() {
  return withJobLock("statement-preparer", async () => {
    const db = getDb();
    if (!db) return { skipped: true, reason: "no-db" };

    // Find all (organizationId, ownerId, period) triples that need a statement
    // for the prior month. Implementation:
    //   - resolve "prior month" from org's timezone (use existing helper)
    //   - SELECT distinct (organizationId, ownerId) from owners where active
    //   - filter out (ownerId, period) pairs that already have a statement row
    //   - call runStatementPreparerAgent per missing pair
    //   - collect results; return { runs, skipped, errors }

    return { runs: 0, skipped: 0, errors: 0 };  // stub to fill in
  });
}
```

The agent body (`runStatementPreparerAgent`) already exists in `src/features/ai-agents/statements/statement-preparer.ts` — this job is just the orchestrator.

### 2. Register in `src/features/jobs/definitions.ts`

Add following the existing daily-cron pattern (look at `low-stock-job` or `preventive-tasks-job` for shape):

```ts
{
  code: "statement-preparer",
  cron: "0 6 1 * *",                    // 1st of month, 06:00 UTC
  handler: runStatementPreparerJob,
  dedupeKey: (now) => `statement-preparer-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
}
```

The `dedupeKey` ensures the job runs once per month even if the cron fires twice (cold-start retry, etc.).

### 3. `src/features/owner-portal/messaging/actions.ts` — post-insert trigger

When an `owner_messages` row is inserted with `actor_kind = 'owner'`, the `owner-concierge` agent should run.

Current pattern: existing message-write action (verify name — likely `postOwnerMessage` or similar). Add at the end of the success path, after the DB insert and `revalidatePath` calls:

```ts
import { triggerOwnerConcierge } from "@/features/ai-agents/concierge/owner-concierge";

// ... existing insert ...

if (input.actorKind === "owner") {
  // Fire-and-forget — don't block the action response on agent latency.
  // The agent writes its reply as a new owner_messages row with actor_kind = 'concierge_agent'.
  void triggerOwnerConcierge({
    organizationId: ctx.organizationId,
    threadId: input.threadId,
    triggerMessageId: insertedRow.id,
  }).catch((err) => {
    // Log but don't throw — message send already succeeded.
    console.error("[owner-concierge] trigger failed", err);
  });
}

return { messageId: insertedRow.id };
```

The `triggerOwnerConcierge` function lives in `src/features/ai-agents/concierge/` — verify exact path; the audit lists `concierge` as a domain folder. If the agent invocation helper is named differently (`runOwnerConciergeAgent`, `invokeAgent('owner-concierge', …)`, etc.), follow the existing convention.

## Validation

```
pnpm typecheck && pnpm lint
pnpm test -- statement-preparer    # if a test exists
pnpm smoke:routes
```

Manual:
- Trigger the cron locally: `pnpm tsx scripts/run-job.ts statement-preparer` (or whatever the existing job-runner script is)
- Verify it walks owners and either creates statement rows or skips with reason
- Insert an `owner_messages` row with `actor_kind = 'owner'` via the Owner Portal Inbox composer
- Verify a follow-up row appears within ~10s with `actor_kind = 'concierge_agent'`

## Honest gap

The agent bodies themselves are stubs from Phase 2.4 (`runStatementPreparerAgent`, `triggerOwnerConcierge`) — they return shaped placeholder data. This PR plumbs the cron + trigger so when the agent bodies graduate from stubs, they fire automatically. **No agent prompts / Claude SDK integration in this PR** — that's a separate Phase 2.5+ AI batch.

## Commit message

```
feat(phase-2-data-l2/cron): wire statement-preparer cron + owner-concierge trigger

statement-preparer: new job-runner file + cron entry (1st of month 06:00 UTC) +
dedupeKey. Walks active owners, fires the agent for missing-statement (ownerId,
period) pairs.

owner-concierge: post-insert hook on owner_messages where actor_kind='owner'.
Fire-and-forget; agent writes back as a new message row.

Agent bodies remain Phase 2.4 stubs — this PR plumbs the wiring so they fire
automatically when real implementations land.

Refs: phase-2-data-wiring, packet-c
```
