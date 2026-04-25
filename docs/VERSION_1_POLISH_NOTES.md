# Version 1 Polish — Notes

**Status:** Applied
**Date:** 2026-04-25
**Scope:** Frontend-only uplift of Version 1. No backend, no real auth, no real AI, no real integrations.

This document summarises what changed in the polish pass over the existing Version 1 build.

---

## Goals of the pass

Bring `management.arconique.com` to a state strong enough to demo to family offices, villa investors, owners, brokers, and partners. Every surface should feel premium, editorial, and investor-grade — without claiming live integrations or audited results.

---

## What changed

### New shared components

| Component | Path | Purpose |
|---|---|---|
| `ScrollReveal` / `ScrollStagger` / `ScrollStaggerItem` | `src/components/motion/scroll-reveal.tsx` | Tasteful fade-rise reveals with `prefers-reduced-motion` support. Used across marketing pages. |
| `ParallaxLayer` | `src/components/motion/parallax-layer.tsx` | Subtle scroll-bound translate for marketing-only use; respects reduced motion. |
| `TrustStrip` | `src/components/marketing/trust-strip.tsx` | Bordered strip of credibility signals shown directly under the home hero. |
| `PillarGrid` | `src/components/marketing/pillar-grid.tsx` | Six-pillar grid (Investor Reporting, Operations, Guest, Finance, AI, Smart Access). |
| `ManagementModels` | `src/components/marketing/management-models.tsx` | Toggle between Individual / Pooled / Hybrid statement shapes. |
| `Sparkline` | `src/components/ui/sparkline.tsx` | Lightweight inline SVG line-chart primitive. |
| `PermissionBanner` | `src/components/dashboard/permission-banner.tsx` | "AI runs in your auth context" banner for the AI hub. |
| `AIAuditLog` | `src/components/dashboard/ai-audit-log.tsx` | Sample AI audit-log entries (read / suggested / blocked). |
| `DashboardPulse` | `src/components/dashboard/dashboard-pulse.tsx` | Morning-pulse strip + action feed + AI briefing card for the dashboard home. |
| `AIPayoutExplainer` | `src/components/owner/ai-payout-explainer.tsx` | Premium "why did my payout change" demo with prompt chips, citations, and feedback. |
| `AIConciergePreview` | `src/components/guest/ai-concierge-preview.tsx` | Guest concierge chat preview with suggestions and trust footnote. |
| `EmergencyBlock` | `src/components/guest/emergency-block.tsx` | Emergency contact tile (host, WhatsApp, ambulance, police) on the guest stay page. |
| `HouseRules` | `src/components/guest/house-rules.tsx` | Iconographic house-rules block. |
| `ReviewRequest` | `src/components/guest/review-request.tsx` | Post-stay review prompt. |
| `FieldQuickActions` | `src/components/field/field-quick-actions.tsx` | Damage report · inventory · purchase request · lost & found shortcuts on the field home. |

### Updated components

| Component | Change |
|---|---|
| `CaseStudyCard` | Adds optional `thesis`, `model`, `status`, `focus`, `reportingAngle`, `metricLabel`, and a hero gradient block. |
| `AIAssistantGrid` | Each assistant card now lists allowed data, forbidden data, example prompt, escalation rule, surfaces, and phase. |

### Upgraded pages

| Page | Highlights |
|---|---|
| `/` | Rebuilt as a narrative landing: Hero → Trust strip → Problem (six fragmentation cards) → Solution (PillarGrid) → ManagementModels → AI section → Portfolio → Case studies → Final CTA. |
| `/villa-management` | Six-step lifecycle grid, three-model comparison strip, full operating package, narrative CTA. |
| `/owner-portal` | KPI cards in hero, expanded "what's inside" columns, embedded statement preview, trust ladder, owner-demo CTA. |
| `/investor-reporting` | KPI hero, statement anatomy, embedded statement preview, ManagementModels, pooled distribution mini, AIPayoutExplainer, dual CTA. |
| `/guest-experience` | Pre-arrival cards, "no app" callout, concierge demo block, services menu, CTA. |
| `/operations` | Live status board mini, lifecycle reveal, sample turnover walkthrough, smart access disclosure, CTA. |
| `/portfolio` | Hero with badges, three project cards, combined snapshot panel, CTA. |
| `/case-studies` | Premium case cards with thesis / model / status / metric, evidence-language disclaimer, CTA. |
| `/contact` | Two-column layout: form on the left, "what happens next" + direct contact aside on the right. Broker option added. |
| `/dashboard` | Command-center: page header, Pulse strip, action feed, AI briefing card, KPIs, tonight's villa pulse, ops + maintenance side-by-side, payout queue, AI summary card. |
| `/dashboard/finance` | Adds an audit-style monthly close checklist; sample statement now framed as a section. |
| `/dashboard/ai` | PermissionBanner, four architectural principles, enriched AssistantGrid, sample AIAuditLog, preview disclaimer. |
| `/owner/statements` | Sticky "ask about this statement" CTA, full statement preview, AIPayoutExplainer section, archive list. |
| `/stay/demo` | Adds no-app callout, HouseRules, AIConciergePreview, ReviewRequest, EmergencyBlock. Hero responsiveness improved. |
| `/field` | Adds Quick Actions (damage / inventory / PR / lost & found). |

### Demo data changes

| File | Change |
|---|---|
| `src/lib/mock/case-studies.ts` | Now exports the richer `CaseStudyMeta` with thesis, model, status, focus, reporting angle, metric label, and hero gradient. |

No other mock data was changed. All existing villas, statement lines, operations data, and AI assistants from Version 1 are preserved.

---

## Motion & parallax

- All reveals are short fade + 12–14px translate, eased with `[0.22, 1, 0.36, 1]`, capped at ~0.6s.
- Stagger animations use 0.05s gaps between siblings, never on more than ~8 items.
- Reduced motion is honoured: `useReducedMotion()` collapses durations to zero in `ScrollReveal`, `ScrollStagger`, and `ParallaxLayer`.
- Parallax is only available via `<ParallaxLayer>` and is intended for marketing-only use. It is not used inside admin / owner / guest / field surfaces in this pass.
- No spring physics, no number-tickers, no auto-rotating carousels, no AI-sparkle effects.

---

## Copy safety

- Throughout the marketing surface we use phrasing such as "designed for", "built to support", "demo preview", "modelled metric", and "preview only". No claim that AI is live, that integrations are wired, or that performance figures are audited.
- Every preview component (AI explainer, concierge, audit log, statement) includes a footer line stating the wiring is not yet live and pointing to the implementation roadmap.
- Case studies now ship with metric labels like "Year-three target" and "Modelled scenario" instead of stand-alone numbers.

---

## Responsive behaviour

- The dashboard pulse strip collapses 6 → 3 → 2 columns at md / sm.
- The case-study and pillar grids collapse to single column on mobile with consistent border treatment.
- The owner-portal `/owner/statements` archive is a vertical list on mobile.
- The contact form switches from 2 → 1 column at md.
- Guest stay page uses a `max-w-[720px]` container; long copy on small screens reflows into stacked sections.
- All marketing heroes drop to single-column with a maximum 76px display size on mobile and 44–60px depending on `kind`.

---

## Performance notes

- No new heavy dependencies were added. The polish pass relies entirely on the existing stack (Next.js, Framer Motion, Tailwind v4, Radix, Lucide).
- Marketing pages remain server components. Only the small motion wrappers (`ScrollReveal`, `ParallaxLayer`) and the interactive components that need it (`ManagementModels`, `AIPayoutExplainer`, `AIConciergePreview`) are client components.
- Sparkline is a plain SVG primitive, no chart library.
- All hero / project / case-study imagery is rendered via CSS gradients (no large bitmaps shipped in this build).

---

## What is still preview / demo

- All metrics, statements, owner names, payouts, and pool-distribution figures.
- All AI experiences (Investor explainer, Operations briefing, Concierge, Audit log).
- Smart-lock codes, camera streams, integrations, channel manager.
- Authentication: `/login` is visual only; the demo quick-links are unrestricted.

---

## Out of scope (deferred to later versions)

- Real Supabase auth + RLS.
- Real database, finance engine, statement generation pipeline.
- Real AI providers, retrieval, tool execution.
- Real integrations: Hostaway/Airbnb/Booking/Agoda, WhatsApp/Telegram/SMS/Instagram, smart locks, cameras, PriceLabs, Xero, payments.
- Native apps.

These remain tracked in `docs/IMPLEMENTATION_ROADMAP.md`.

---

## Acceptance status

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass; all routes prerender as static
- All implemented routes render
- No broken links in the public navigation
- No lorem ipsum
- Dashboard reads as a real operating-system preview
- Owner reporting demo is materially stronger than Version 1
- AI hub clearly explains permission-aware AI

See `README.md` for run instructions; nothing changed in setup compared to Version 1.
