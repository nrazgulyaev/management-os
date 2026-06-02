# PR 4 · AI agent

# Task — Phase 2.1 PR 4 — AI agent catalog + detail

Refactor existing AI agent routes onto the template. Reference:
- _handoff/templates/ai-agent.html

The catalog list route already exists (`src/app/(dashboard)/dashboard/ai/page.tsx` + sister Dev) — that page becomes the catalog. The detail route is new.

## Files

### Catalog (refactor)
- `src/app/(dashboard)/dashboard/ai/page.tsx` — refactor to use `<AgentCatalog>`
- `src/app/(development-app)/development-os/ai-agents/page.tsx` — sister, same component

### Detail (new)
- `src/app/(dashboard)/dashboard/ai/[agentCode]/page.tsx` — agent detail
- `src/app/(development-app)/development-os/ai-agents/[agentCode]/page.tsx` — sister
- Use `generateStaticParams` from `src/features/ai-agents/registry.ts` (existing — list of agent codes).

### Output sub-route
- `src/app/(dashboard)/dashboard/ai/[agentCode]/outputs/[outputCode]/page.tsx` — direct-link to a run's structured output

### Components
- `src/components/ai-agents/agent-card.tsx`
- `src/components/ai-agents/agent-transcript.tsx`
- `src/components/ai-agents/agent-message.tsx` — polymorphic on `actor: "user" | "agent" | "tool"`
- `src/components/ai-agents/agent-composer.tsx` — testing input at bottom of transcript
- `src/components/ai-agents/agent-output-card.tsx`
- `src/components/ai-agents/agent-runs-list.tsx`
- `src/components/ai-agents/agent-config-card.tsx`

## Props (key)

```typescript
type AgentCardProps = {
  code: string;
  name: string;
  description: string;
  category: "concierge" | "statements" | "operations" | "owner-intel" | …;
  runs24h: number;
  autoResolvedPct?: number;
  isLive: boolean;
  schedule?: string;        // e.g. "Scheduled · 06:00"
  href: string;
};

type AgentMessageProps = {
  actor: "user" | "agent" | "tool";
  actorName?: string;       // for user/agent
  channel?: string;         // for user (Airbnb / WhatsApp)
  toolName?: string;        // for tool
  timestamp: string;        // formatted
  body: ReactNode;          // text or JSX
  confidence?: number;      // for agent (0..100)
  routedReason?: string;    // for agent below threshold
};
```

## CSS

New section in `src/styles/components.css`:
- `.agent-grid`, `.agent-card`
- `.agent-detail` (2-column layout: transcript + right rail)
- `.transcript`, `.msg`, `.msg.user/.agent/.tool`
- `.output`, `.composer`

All scoped `[data-product]`.

## Streaming

Transcript component handles streamed token deltas. Use existing `useAgentStream` hook from `src/features/ai-agents/use-stream.ts` (already in repo per Phase 1 audit; verify it exists, create if not). Show typing indicator (3-dot pulse) on agent message bubble while streaming.

## Routing-to-human flow

When agent confidence below threshold, message includes `routedReason`. UI renders warn-tinted info block with reason + linked operator name. Clicking operator name opens a `<Modal size="md">` (from PR 3) for the route-to-inbox flow.

## Apply (proof-of-life)

- Refactor `src/app/(dashboard)/dashboard/ai/page.tsx` → uses `<AgentCatalog>` with the 14 mgmt agents from `src/features/ai-agents/registry.ts`. Confirm category chips, card grid render.
- Wire `src/app/(dashboard)/dashboard/ai/[agentCode]/page.tsx` for `concierge-auto-reply` only — fetch transcript from existing agent-runs table; mock if not seeded. Confirm transcript + outputs sidebar + composer render.

Don't wire all 14 agents — that's Phase 2.2 work. Verify the skeleton with one agent end-to-end.

## Validation

- `npm run typecheck` clean
- `npm run lint` clean
- `npm run smoke:routes` clean
- Open `/dashboard/ai` → catalog renders with category chips + cards.
- Open `/dashboard/ai/concierge-auto-reply` → detail renders with transcript left + sidebar right + composer at bottom.
- Type a test message in composer + press ⌘+Enter → runs against staging.

## Commit

PR title: `phase-2.1(ai-agent): catalog + detail with transcript/output/runs/composer · refactor existing ai routes onto template`

---
