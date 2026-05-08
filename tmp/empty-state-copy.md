# Stage 8.D — Empty-state copy + CTA sweep

**Date**: 2026-05-08

Stage 7.G found 21 Tier-3 dashboard / digest / executive pages where the empty state lacked an actionable CTA. Phase 8.D adds `action={...}` props to the 15 pages using `<EmptyState>` and improves inline empty text on the 6 pages with custom messaging.

The CTA pattern follows the page's actual mechanic:
- **Cron-driven pages** (most dashboards): primary CTA is "View jobs" → `/dashboard/jobs` so the operator can find + manually trigger the cron that populates the page. Description copy explains *which* cron and *when* it runs.
- **Workflow-driven pages**: primary CTA points at the upstream create/configure route.
- **Pure-display pages** (digests, dashboards): kept descriptive text + add a "View jobs" CTA.

| # | Route | Mechanic | Primary CTA | Target |
|---|---|---|---|---|
| 1 | `/development-os/risk-radar` | weekly cron | View jobs | `/dashboard/jobs` |
| 2 | `/development-os/cashflow-forecast` | cron / server action | View jobs | `/dashboard/jobs` |
| 3 | `/development-os/project-cycle` | weekly cron (Mon 06:00 UTC) | View jobs | `/dashboard/jobs` |
| 4 | `/development-os/dashboard` | daily cron | View jobs | `/dashboard/jobs` |
| 5 | `/development-os/digests` | monthly cron | View jobs | `/dashboard/jobs` |
| 6 | `/development-os/distributions` | manual workflow | Declare distribution | inline (existing button on page) |
| 7 | `/development-os/commitments` | manual workflow + seed | View commitments hub | `/development-os/commitments` |
| 8 | `/development-os/finance` | seeded data | View jobs | `/dashboard/jobs` |
| 9 | `/development-os/finance/document-extractions` | upload flow + AI | View jobs | `/dashboard/jobs` |
| 10 | `/development-os/finance/shared-costs` | server action | View finance hub | `/development-os/finance` |
| 11 | `/development-os/marketing/campaigns` | manual create | Configure connections | `/development-os/marketing/connections` |
| 12 | `/development-os/marketing/content` | pipeline | Configure connections | `/development-os/marketing/connections` |
| 13 | `/development-os/marketing/dashboard` | connected providers | Configure connections | `/development-os/marketing/connections` |
| 14 | `/development-os/marketing/manager-performance` | weekly cron (Mon 04:00) | View jobs | `/dashboard/jobs` |
| 15 | `/development-os/procurement/quotations` | RFQ workflow | View RFQs | `/development-os/procurement/purchase-requests` |

Inline empty-state text (no `<EmptyState>` component) — improved in place:

| # | Route | Pre-fix text | Post-fix copy added |
|---|---|---|---|
| 16 | `/dashboard/finance` | "No periods yet." | already explains; verified |
| 17 | `/dashboard/ai` | (presentation page, not empty state) | n/a — left as-is |
| 18 | `/dashboard/notifications/inbox` | "Your inbox is empty." | + "Notifications arrive when actions you triggered complete or when system events fire. Check the Deliveries tab for failed sends." |
| 19 | `/dashboard/guest-ai/handoffs/metrics` | "No data yet." | + "Guest AI handoff metrics roll up from concierge sessions; first signals appear after a guest interacts with the AI." |
| 20 | `/dashboard/guest-journey/runs` | already has decent CTA | verified |
| 21 | `/dashboard/guest-stays/security/verifications` | "No verifications yet." | + "Issued automatically when a guest first scans their stay link; expires after 10 minutes." |

---

## Why "View jobs" is the recurring CTA

The Stage 7.G audit's empty-state finding was specifically about cron-populated dashboards. Operators landing on these pages can't make data appear — the cron does. Surfacing `/dashboard/jobs` as the CTA gives operators a path to:

1. Read which cron populates this view (job key matches the page's mechanic)
2. Manually trigger it ("Run now" button)
3. See its last run + next scheduled time

That matches the `<RunAgentButton>` pattern shipped in Phase 8.B for AI agents — same idea: a one-click "make this happen now" affordance for cron-driven workflows.
