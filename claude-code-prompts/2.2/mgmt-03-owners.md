# Task — Phase 2.2 PR 3 — Mgmt · Owners

**Reference doc:** `_handoff/cabinets/mgmt-p1/owners.html`

## Files

ROUTES:
- `src/app/(dashboard)/dashboard/owners/page.tsx` — new list
- `src/app/(dashboard)/dashboard/owners/[id]/page.tsx` — REFACTOR (exists from 2.1) — replace activity-tab default with Overview default, add insight card

PRIMITIVES:
- `src/components/owners/tier-ring.tsx` — `<TierRing tier="platinum"|"gold"|"silver" />`
- `src/components/owners/risk-pill.tsx` — `<RiskPill level="ok"|"watch"|"flag" reason? />`
- `src/components/owners/portal-dot.tsx` — `<PortalStatusDot owner />`. 3 states (active/invited/not-invited).
- `src/components/owners/insight-card.tsx` — `<InsightCard insight />`. AI-flagged risk panel with Schedule call + Dismiss.
- `src/components/owners/villa-mini.tsx` — used in side panel + cross-cabinet (Statement detail).

FEATURES:
- `src/features/owners/derive-tier.ts` — `deriveTier(owner): "platinum"|"gold"|"silver"` from villa count + projected ARR. Cached daily.
- `src/features/owners/retention-risk.ts` — 5 signals computation (see cabinet doc):
  - payout drift (-10% watch, -20% flag, vs 3-mo rolling avg)
  - occupancy regression (YoY -15% watch, -25% flag, excludes Q1)
  - portal disengagement (>30d watch, >90d+anomaly flag)
  - statement dispute (≥2 revisions in 3mo flag)
  - maintenance escalations (≥3 open >14d watch)

SCHEMA:
- `owner_insights` — new (FK owner_id, kind, level, payload JSON, fired_at, dismissed_at?, dismissed_reason?)
- `onboarding_drafts` — new (FK director_user_id, step 1-3, data JSON, created_at, expires_at = 14d)

MODALS:
- `src/components/owners/onboard-modal.tsx` — form-lg 3 steps (Identity → Commission → Villas+portal). Doc-checker agent validates on step 1. Save-and-finish-later.
- `src/components/owners/edit-commission-modal.tsx` — form-md, Director-only
- `src/components/owners/invite-portal-modal.tsx` — form-sm
- `src/components/owners/dismiss-insight-modal.tsx` — form-sm, reason picker + free text (trains the model)

AGENTS:
- `src/features/ai-agents/owner-intelligence/` — daily 05:00 + on-demand. Writes owner_insights.
- `src/features/ai-agents/onboarding-doc-checker/` — validates ID upload during onboarding step 1.

## Wiring example — detail page with insight card

```tsx
const owner = await getOwner(id);
const insights = await getActiveInsights(id);

return (
  <DetailPage>
    <DetailHeader
      title={owner.name}
      meta={
        <>
          <TierRing tier={owner.tier} />
          {insights[0] && <RiskPill level={insights[0].level} reason={insights[0].kind} />}
          <span className="mono text-ink-3">{owner.villaSummary}</span>
        </>
      }
      actions={…}
    />
    <DetailTabs tabs={["Overview","Villas","Statements","Contacts","Activity"]} active={tab} />
    <main>
      {insights[0] && <InsightCard insight={insights[0]} onSchedule={…} onDismiss={…} />}
      <KpiRow … />
      <ProfileCard … />
      <RecentStatementsTable … />
    </main>
    <DetailSide cards={[<PrimaryGuestCard/>, <ChannelCard/>, <OwnerVillasCard villas={owner.villas} />]} />
  </DetailPage>
);
```

## Validation

- Tier rings render correctly per Mgmt palette (platinum=ink, gold, silver=cream-deep)
- Risk pills with reason text inline
- Insight card surfaces on detail when active insight exists; dismissing via modal records reason + suppresses 30d
- 3-step onboarding modal: step transitions work; "Save & finish later" persists state to onboarding_drafts and shows resume banner on next open
- IBAN field masks by default (`SG••••8842`); Director-only "reveal" button decrypts

## Commit

`phase-2.2(mgmt-owners): list + detail with insight card + tier/risk/portal primitives + 4 modals + 2 agents + retention model`
