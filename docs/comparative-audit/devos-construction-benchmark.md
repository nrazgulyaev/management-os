# Development-OS — Construction Field Ops / Supervisors: Competitive Benchmark

**Date:** 2026-07-02
**Cluster:** Dev-OS construction field operations (supervisors / site teams)
**Benchmarked against:** Procore, Fieldwire (by Hilti), Autodesk Construction Cloud (ACC / Autodesk Build + BIM Collaborate + BuildingConnected), PlanGrid (now in maintenance mode, folded into Autodesk Build).
**Scope note:** The *functional* audit of our cluster is already complete — every area below WORKS in-app. This document is a market-feature benchmark, with a light code cross-check to confirm which features exist vs. stub.

---

## 0. What we confirmed in code (cross-check)

| Area | Status in our codebase | Evidence |
|---|---|---|
| Site reports (daily logs) | Real | `src/lib/development/server/site-reports/`, `src/features/site-reports/` |
| Safety / incidents | Real | `src/app/api/development/safety/`, `dev-os-safety-escalation` cron |
| QA/QC (issues + inspections + photos) | Real | `qa-qc-queries.ts` (`qaQcInspections`), `qa-qc-photo-upload-actions.ts` |
| Method statements | Real | `src/lib/development/server/method-statements/` |
| Specifications | Real | `src/lib/development/server/specifications/` |
| Drawings (revisions + distribution log) | Real | `drawing-queries.ts` (`drawingRevisions`, `drawingDistributionLog`) |
| Coordination (RFI + submittal register) | Real | `coordination-queries.ts` (`submittals` schema), `rfis/` |
| Schedule (baseline, critical path, resource leveling, Gantt) | Real | `schedule/baseline-*`, `critical-path-helpers.ts`, `resource-leveling-helpers.ts`, `components/development/schedule/gantt-chart.tsx` |
| Quality standards / productivity / risk-radar | Real | `quality-standards/`, `productivity/`, `risk-radar/` incl. `risk-radar-ai-agent.ts` |
| WhatsApp-driven site capture | Real | `src/lib/development/server/whatsapp-actions.ts` + AI agents |
| AI site agents | Real | `features/ai-agents/site-reports/` (incident-classifier, weekly-composer, photo-organiser, caption-cleaner), `risk-radar-ai-agent.ts` |
| Offline sync / queue | Real | `src/lib/development/server/offline-sync/sync-actions.ts`, `client/offline-queue.ts`, `offline-queue-stats-job` cron |
| **Punch list / snag** | **STUB** (nav + mock only) | only in `navigation.ts`, `mock-data.ts`, `coordination-board.tsx` — no schema, no server module |
| **Drawing markup / annotation / pin-to-sheet / overlay** | **MISSING** | no markup/annotate/pin/overlay code in `drawings/` |
| **BIM / model coordination / clash detection** | **MISSING** | no bim/model/ifc schema or module |
| **Meetings / minutes** | **MISSING** | no meeting/minutes schema |
| **Lookahead / short-interval planning** | **MISSING** | Gantt exists, no lookahead view |

---

## 1. Feature-by-feature: GAP / PARITY / DIFFERENTIATION

| Feature | Procore | Fieldwire | Autodesk (ACC/Build) | PlanGrid | **Us** | Verdict |
|---|---|---|---|---|---|---|
| Daily logs / site diary | Yes (AI Daily Log Agent) | Yes (reports) | Yes (daily reports) | Basic | **Yes + WhatsApp + AI composer** | **DIFFERENTIATION** |
| RFIs | Yes (full workflow) | Yes (draft→approval) | Yes (configurable) | via Build | **Yes (board)** | PARITY |
| Submittals + submittal register | Yes (Submittal Builder scans spec book) | No formal module | Yes | via Build | **Yes (register, spec-linked)** | PARITY (see P1 gap) |
| **Punch list / snag** | Yes | Yes (flagship, blueprint-pinned) | Yes (Issues) | Yes | **STUB** | **GAP P0** |
| Drawings — version control / auto-hyperlink | Yes | Yes | Yes | Yes (origin) | **Revisions + distribution log** | PARITY (basics) |
| **Drawing markup / annotation / pin-to-sheet** | Yes | Yes (HD viewer, offline markup) | Yes | Yes | **MISSING** | **GAP P0** |
| Photo docs (geo/time-stamped) | Yes (Photo AI) | Yes | Yes | Yes | **Yes + AI caption/organise** | PARITY+ |
| Inspections / checklists | Yes | Yes (task checklists) | Yes (Forms + conditional logic) | Forms | **Yes (QA/QC inspections)** | PARITY |
| Safety / observations | Yes | Yes | Yes (Construction IQ risk) | — | **Yes + escalation cron** | PARITY |
| Schedule — Gantt / critical path | Yes | Lookahead basics | Yes | — | **Yes (baseline+CP+resource-leveling+Gantt)** | PARITY+ |
| **Lookahead / short-interval planning view** | Yes | Yes | Yes | — | **MISSING** | **GAP P1** |
| **BIM / model coordination / clash** | Via integrations | No | **Yes (BIM Collaborate Pro, batch issues)** | No | **MISSING** | **GAP P2** (niche for our owner-scale) |
| **Meetings / minutes** | Yes | No | Yes | No | **MISSING** | **GAP P2** |
| Field mobile app (native) | Yes | Yes (mobile-first) | Yes | Yes | **Web + WhatsApp (no native app)** | **GAP P1** |
| Offline mode | Yes | Yes (flagship) | Yes | Yes | **Yes (sync queue)** | PARITY |
| Preconstruction / bid management | Partial | No | **Yes (BuildingConnected, bid leveling, recommendation engine)** | No | **MISSING** | out-of-scope for this cluster |
| AI assistant / agents | **Yes (Helix / Assist / Agent Builder — RFI + Daily Log agents, Photo AI)** | Limited | **Yes (Construction IQ, Autodesk Assistant, OCR title-block extraction)** | No | **Yes (site agents + risk-radar AI)** | PARITY (was a differentiator, now contested) |
| **WhatsApp-native field capture** | No (voice/email/photo, not WhatsApp) | No | No | No | **Yes** | **DIFFERENTIATION (unique among incumbents)** |

---

## 2. Key market shifts to note (2025-26)

- **AI is no longer our moat — it's now table-stakes at the top end.** Procore shipped **Helix** with **Assist** (conversational Q&A over specs/RFIs/submittals) and an **Agent Builder** with pre-built **RFI Creation** and **Daily Log** agents (the Daily Log Agent drafts logs from photos, emails and voice notes). Autodesk has **Construction IQ** (risk scoring, quality flags) and **Autodesk Assistant** (spec extraction, OCR title-block reads). Our AI site agents + risk-radar are still valuable but are now **parity, not leadership**, vs. Procore/Autodesk.
- **The one thing incumbents do NOT have is WhatsApp-native capture.** Procore's Daily Log Agent explicitly uses "photos, emails and voice notes" — no WhatsApp. WhatsApp-native daily logs exist only in *point tools* (SendStatus, Nora by ResQ), never inside an integrated Dev-OS. This is our clearest, most defensible differentiator, especially for Indonesia / emerging-market field crews where WhatsApp is the default channel.
- **PlanGrid is dead as a roadmap** (maintenance mode, folded into Autodesk Build) — do not benchmark forward against it; benchmark against Autodesk Build.
- **Fieldwire's flagship is punch list + blueprint markup** — precisely our two P0 gaps. This is the field-supervisor bread-and-butter and its absence is the most visible "this isn't a real field tool" signal.

---

## 3. Prioritized recommendations

### P0 — table-stakes we lack or only stub (close before positioning against field tools)
1. **Punch list / snag module.** Currently nav + mock only. Every one of the four competitors ships this; Fieldwire's whole product is built around it. Needs: schema, server module, list + status workflow, photo attach, assignee + due date, ideally pin-to-drawing. Biggest credibility gap.
2. **Drawing markup / annotation / pin-to-sheet.** We have revisions + a distribution log but no viewer markup (clouds, text, arrows, progress photos, RFI/issue hyperlinking). This is the single most-used field interaction in Fieldwire/PlanGrid/Build. Pin punch-list + QA/QC + RFI items to a drawing coordinate.

### P1 — competitive-parity gaps
3. **Lookahead / short-interval planning view.** We have Gantt + critical path but no 1–6 week lookahead / SIP view — the format supervisors actually run weekly. Derive from existing schedule data.
4. **Submittal register depth vs. Procore Submittal Builder.** We have a spec-linked register; Procore auto-generates the log by scanning the spec book. Add spec-book → submittal auto-population to reach true parity.
5. **Native mobile / PWA field app.** We have web + WhatsApp + an offline queue, but no installable native/PWA experience. Field-first competitors are mobile-native. A PWA wrapper over the offline queue closes most of this cheaply.

### P2 — differentiators / defer
6. **BIM / model coordination / clash detection.** Autodesk-only strength; heavy lift, niche for owner/mid-scale developer projects. Defer unless a target client demands it.
7. **Meetings / minutes module.** Present in Procore/Autodesk, absent in Fieldwire. Low urgency for supervisor cluster.
8. **Double down on WhatsApp-native + AI capture as the wedge.** Since AI has become table-stakes, lead marketing with the *channel* differentiator (WhatsApp-in-Dev-OS) rather than "we have AI." Extend agents to auto-draft RFIs and punch items from WhatsApp threads (matching Procore's Agent Builder outputs but on the channel crews already use).

---

## 4. Differentiation summary (what we should lead with)

1. **WhatsApp-native field capture inside an integrated Dev-OS** — unique vs. all four incumbents; only point tools do this, and none tie it to RFIs/QA/QC/schedule/risk.
2. **AI site agents + AI risk-radar** — incident classification, weekly composer, photo organiser/caption, and predictive risk elevation. Now parity with Procore Helix / Autodesk Construction IQ, but bundled at a far lower tier for owner/developer-scale.
3. **Owner/developer-scale integration** — field ops sit inside the same tenant as sales, money, statements and owner reporting; the incumbents are GC-centric point-of-view tools that stop at project handover. Our field data flows straight into owner economics.

---

## Sources
- [Procore — Project Management](https://www.procore.com/project-management), [RFIs](https://www.procore.com/project-management/rfis), [Submittals](https://www.procore.com/project-management/submittals), [Submittal Builder](https://support.procore.com/products/online/user-guide/project-level/specifications/tutorials/generate-submittal-log)
- [Procore AI / Helix](https://www.procore.com/ai), [Groundbreak 2025 AI announcement](https://www.procore.com/press/procore-advances-the-future-of-construction-with-new-ai-innovations)
- [Fieldwire punch list app](https://www.fieldwire.com/punch-list-app/), [Fieldwire vs Procore](https://www.fieldwire.com/au/blog/fieldwire-vs-procore-comparison/)
- [Autodesk Construction Cloud roadmap](https://www.autodesk.com/customer-value/aec/acc), [July 2025 product release](https://www.autodesk.com/blogs/construction/july-2025-construction-product-release/), [BuildingConnected](https://construction.autodesk.com/products/buildingconnected/)
- [Moving from PlanGrid to Autodesk Build](https://resources.imaginit.com/building-solutions-blog/moving-from-plangrid-to-autodesk-build-what-to-expect)
- [SendStatus — AI WhatsApp daily logs](https://sendstatus.co/contractors-remodelers-update-report-software), [Nora by ResQ WhatsApp daily log](https://www.getresq.com/nora/nora-blog/construction-daily-log-app)
