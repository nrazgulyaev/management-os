# Stage 6.P4 — Marketing + Analytics — ACCEPTED 2026-05-07

## Summary

Stage 6.P4 delivers the marketing + analytics surface end-to-end:
analytics ingestion (GA4, Meta Pixel CAPI), three ad-platform
integrations (Google Ads, Meta Ads, TikTok Ads), two email-marketing
integrations (Mailchimp, ConvertKit), an attribution engine across
5 models, and a 3-page operator UI under `/development-os/marketing/`.

## Deliverables landed

### Schema (P4.A)
- **Migration 0082** — 5 tables (`marketing_connections`,
  `marketing_campaigns`, `marketing_metrics`,
  `attribution_touchpoints`, `attribution_conversions`).
- Per-org RLS via the **FOREACH ARRAY pattern** (5th preservation of
  the 0075 PL/pgSQL lesson).
- Dedicated `marketing_set_updated_at()` trigger (kept distinct from
  banking/messaging triggers so cross-stage drops don't cascade).
- Drizzle modules: `src/lib/db/schema/marketing.ts`,
  `src/lib/db/schema/attribution.ts`.

### Provider abstraction (P4.A → P4.E)
| Provider          | Sub-stage | Auth                       | Notes                                    |
|-------------------|-----------|----------------------------|------------------------------------------|
| Google Analytics 4| P4.B      | OAuth + service-account    | Measurement Protocol + Reporting API     |
| Meta Pixel CAPI   | P4.B      | Bearer + appsecret_proof   | SHA-256 normalize-then-hash for PII      |
| Google Ads        | P4.C      | OAuth refresh + dev-token  | GAQL queries, micros → minor units       |
| Meta Ads          | P4.D      | Bearer + appsecret_proof   | Insights API, decimal-major → minor      |
| TikTok Ads        | P4.E      | Access-Token header        | Business API v1.3, BASIC + AUCTION       |
| Mailchimp         | P4.E      | HTTP Basic, dc from key    | Email-as-marketing-metric projection     |
| ConvertKit        | P4.E      | api_secret query param     | Per-broadcast stats                      |
| DryRun fallback   | P4.A      | none                       | Default when env unconfigured            |

All 7 real providers + DryRun share the **single
`MarketingProviderInterface`** + **single `selectMarketingProvider`
selector** with discriminator-mismatch → DryRun fallback. Same shape
as the AI / channel-manager / messaging / banking abstractions.

### Attribution engine (P4.F)
- **5 model functions** in `src/lib/marketing/attribution/models.ts`,
  pure, return weight arrays summing to 1.0 by construction:
  - `firstTouchAttribution` — 100% to earliest
  - `lastTouchAttribution` — 100% to latest
  - `linearAttribution` — 1/n equally
  - `timeDecayAttribution` — exponential half-life (default 7 days)
  - `positionBasedAttribution` — U-shape (default [0.4, 0.2, 0.4])
- `computeAttributionWeights(touchpoints, model, opts)` dispatches to
  the right model.
- **Engine** (`engine.ts`, server-only):
  - `attributeConversion` — pure-ish: given conversion + touchpoints
    + config, returns per-campaign weighted credit. Caller persists.
  - `runAttributionBackfill` — sweeps unattributed conversions per-org;
    used by the `attribution_engine` cron hourly.
  - `getChannelROI` — aggregates spend (from `marketing_metrics`) and
    revenue (from `attribution_conversions.linear_attribution_data`)
    per channel; computes ROI + CPA via `platformToChannel` mapper.

### Cron jobs (P4.F)
| Route                                | Cadence | Runner                      |
|--------------------------------------|---------|-----------------------------|
| `/api/cron/marketing-campaigns-sync` | 6h      | `runMarketingCampaignsSync` |
| `/api/cron/marketing-metrics-sync`   | 3h      | `runMarketingMetricsSync`   |
| `/api/cron/attribution-engine`       | 1h      | `runAttributionEngine`      |
| `/api/cron/utm-touchpoint-cleanup`   | daily   | `runUtmTouchpointCleanup`   |

All 4 wired in `KNOWN_JOBS` + `executeJob` switch + `cron/index.ts`
exports + `docs/VERCEL-CRON-CHECKLIST.md`. Cron registry **87 → 91
routes, 86 → 90 known job keys**.

### Webhook routes (P4.F)
- `/api/webhooks/marketing/meta-pixel` — GET handshake (Meta verify
  token) + POST stub for future inbound CAPI events.
- `/api/webhooks/marketing/ga4` — placeholder. GA4 is pull-only in the
  current surface (Reporting API), so this route fail-closes pending
  OIDC plumbing.

### UI (P4.F)
- `/development-os/marketing/attribution/page.tsx` — attributed
  conversions table reading via `listConversionsForUi`.
- `/development-os/marketing/conversions/page.tsx` — conversions +
  recent touchpoints via `listConversionsForUi` +
  `listRecentTouchpointsForUi`.
- `/development-os/marketing/connections/page.tsx` — provider
  connections via `listConnectionsForUi`.

The overview + campaign-detail surfaces folded into the existing
marketing dashboard already shipped in P4.A — the UI has 5 logical
surfaces but 3 new pages.

### Service layer
- `src/lib/marketing/service.ts` — `"use server"` boundary, all the
  load-bearing functions: `syncCampaignsForConnection`,
  `syncMetricsForConnection`, `listActiveConnectionsForCron`,
  `ingestTouchpoint`, `recordConversion`, `runAttributionForOrg`,
  `archiveOldTouchpoints`, `getMarketingDashboardMetrics`,
  `listMarketingConnections`.
- `src/lib/marketing/queries.ts` — `import "server-only"` read helpers
  for the UI.

## Acceptance gate

| Check                                                              | Status |
|--------------------------------------------------------------------|--------|
| Migration 0082 applies cleanly with FOREACH ARRAY pattern          | ✅      |
| 5 new tables + per-org RLS                                         | ✅      |
| 7 marketing providers + DryRun behind single selector              | ✅      |
| Attribution engine functional with 5 models                        | ✅      |
| Marketing UI pages shipped                                         | ✅      |
| 4 new cron jobs in `KNOWN_JOBS` + dispatcher + Vercel checklist    | ✅      |
| 2 webhook routes (Meta verify-token GET + POST stub, GA4 stub)     | ✅      |
| ≥4512 tests target — actual **4570 tests**                         | ✅      |
| Zero regressions on 4312 P3.G baseline                             | ✅      |
| `npm run build` succeeds                                           | ✅      |
| `npm run check:cron` clean (91 routes, 90 keys)                    | ✅      |
| 0075 FOREACH lesson preserved (asserted in tests)                  | ✅      |
| Stage 5.J build-fix invariant maintained                           | ✅      |

## Architectural invariants preserved

1. **Cost-unit normalization at the boundary.** Every provider mapper
   converts native units (micros for Google Ads / TikTok, decimal-
   major strings for Meta) to bigint minor units before persisting.
   The DB never sees native units.
2. **PII never crosses the wire raw.** Meta Pixel CAPI normalizes
   email/phone (lowercase, strip whitespace) then SHA-256 hashes
   before sending.
3. **Idempotent conversion firing.** Every server-side conversion
   carries an `event_id` (Meta) / `transaction_id` (GA4) so cron
   retries don't double-count.
4. **Attribution decoupled from ingestion.** Operators can re-run the
   engine with a different model + lookback window without
   re-importing source data.
5. **Conversion firing single-source-of-truth.** Google Ads + Meta Ads
   `sendConversionEvent` returns success-with-note delegating to GA4
   (P4.B) + Meta Pixel CAPI (P4.B) respectively. One place fires
   conversions per platform.
6. **`"use server"` vs `import "server-only"`.** `service.ts` is the
   `"use server"` action boundary. `attribution/engine.ts` exports
   synchronous helpers (Server Actions must be async), so it uses
   `import "server-only"` instead. This is the documented split.
7. **0075 FOREACH ARRAY pattern preserved across migrations** (5th
   preservation: 0075 → 0078 → 0080 → 0081 → 0082).

## What's next

**Stage 6.P5 — Productivity Tools (1–2 weeks)** is unblocked.

Scope per the master plan:
- Google Calendar, Gmail, Sheets, Drive (all via Google Workspace
  OAuth — same refresh helper proven in P2.E).
- Migration 0083.
- Includes the deferred **P0.6 Google Sheets sync**.
- Tier 3 P3.6 closures still open: approval-thresholds editing UI +
  WhatsApp credential CRUD.
- Acceptance: 4 services integrated, OAuth flows work, **4750+
  tests target**.

After P5: P6 (AI Agents Activation Ready), P7 (Investor Portal
Enhancement), P8 (Polish + Comprehensive Testing).
