# 01 — Mgmt OS / Concierge AI

**Section verdict**: pages USABLE in production, but the AI itself is
not connected per operator. This is a P0 customer-promise issue.

---

## `/dashboard/concierge-ai`

**Status**: 🟡 Half-built (page renders; AI agent not wired end-to-end)
**Severity**: P0 — Concierge AI is a marketing-page promise; if it's
not connected, the customer-facing claim is false.
**Source**: `src/app/(dashboard)/dashboard/concierge-ai/page.tsx`
(or wherever the route lives)

- Production: `200` USABLE (page loads)
- AI invocation: per operator "Concierge AI не подключен" — the
  guest-facing chat doesn't actually invoke the AI agent

### Operator-flagged behaviors
> "Concierge AI не подключен"

### 3 root-cause hypotheses
1. **Agent enabled but no provider key** — Stage 10.5.B added
   per-org provider/key UI; if no key configured for the
   `concierge-ai` agent, the agent runner returns "no provider"
   silently.
2. **Frontend not wired to backend** — guest-side
   `/stay/[token]/concierge` UI may render a chat shell but never
   POST to the AI agent endpoint.
3. **Handoff not configured** — agent answers but escalation to
   `/dashboard/ai-handoffs` doesn't trigger when AI confidence is
   low; appears "broken" because no escalation path closes the loop.

### Recommended action
- **Priority**: P0 (customer promise)
- **Sub-phase**: 10.6.B critical fix + 10.6.D (per-agent provider
  config wired through to runtime — see Stage 10.5.B carry-over note
  about agent-runner integration deferred)
- **Effort**: ~6-12h (depends on which hypothesis)
- **Dependencies**: Stage 10.5.B agent-runner integration carry-over
  must ship FIRST so the per-org concierge-ai agent config (provider
  + key + model) is honored at invocation time.

### Related operator question (Q7 in business-logic-questions)
> "Concierge AI — how connected, why sessions tracked"
The audit's Q7 stub captures the broader integration question.
This page is the user-facing manifestation.
