# Arconique — Full Design-Layer Build Contract (source of truth)

> The master build prompt for the `cc-functional-handoff/` package (local, gitignored).
> Goal: apply this design system to the live platforms — **especially the functionality**.
> Every function must work. **On functional parity we must not lose to Attio / Salesforce /
> HighLevel / etc.** Deeper/better than the mocks is encouraged where it raises quality.

## 1. Global contract (every screen)

**Stack:** Next 15.5 App Router · React 19 · TS · Tailwind v4 · Drizzle/Supabase · Radix ·
Framer Motion · Recharts · Vercel. Three "systems" = one Next app, middleware-branched by
`x-product` header (set per subdomain).

**Product palette (`[data-product]`):**
| System / route | `data-product` | display font | accent | bg |
|---|---|---|---|---|
| Management OS · `/dashboard/**` | `management` | Newsreader | terra `#C4583C` | cream |
| Development OS · `/development-os/**` | `development` | Space Grotesk | amber `#FF6B35` | sand |
| Owner Portal · `/owner/**` | `owner` (= mgmt tokens) | Newsreader | terra | cream, larger type |
| Platform Admin · `/platform/**` | platform (dark) | Space Grotesk/Inter | cool-blue `#5B9DFF` | carbon |
| Subscription | `subscription` | — | — | landing+pricing only, no inner cabinets |

**CSS layers:** A = legacy `:root`/`@theme inline` (old emerald, ~190 pages). **B = `[data-product]` palette — the target language; everything migrates here.** C = additive OKLCH, collapses into B.

**Non-negotiable rules:**
1. Primitives-first — new pattern → primitive in `src/components/…` → then the page.
2. No `style={{…}}` in prod (mocks use inline for speed — convert to classes).
3. No new palette / 5th font / ad-hoc CSS var. New token → `tokens.css` (Layer B) → alias in `@theme inline`.
4. Single nav source: `src/config/dashboard-nav.ts` (Mgmt) + `src/config/development-nav.ts` (Dev). Legacy `navigation.ts` deprecated.
5. **RBAC + org-scope on every query** (see Keystone). Every read/write scoped by `orgId` (+ `ownerId`/`buyerId`/`role`).
6. Mobile first-class — every screen: ≤900px (sidebar → `<MobileTabbar>`) and ≤600px.
7. Detail / modal / AI-agent / list+filter — via the unified `templates/*`, not ad-hoc.
8. Copy tone: Mgmt = warm hospitality · Dev = engineering · Owner = calm investor · Platform = dry operator.

**Do NOT rewrite:** `Функциональный статус.html` fixes 14 cabinets already functional — pixel-polish + real-data wiring only, not behavior rewrite.

## 2. The 10 functional blocks (P0 domains) — build bottom-up

Anatomy per block: **migration → server fns (queries/actions, pure-fns) → state machines (guarded transitions) → routes+UI (on primitives) → integrations/cron.**

| # | Block | file | § | gist |
|---|---|---|---|---|
| 08 | Keystone | `prompts/08-keystone.md` | foundation | RBAC · zero-state onboarding · shared data core |
| 01 | State-kit + Workbench | `prompts/01-state-kit-workbench.md` | UX | 7 state primitives; no disabled button without a reason |
| 05 | Accounting | `prompts/05-accounting.md` | F.4 | double-entry; `postEntry` rejects imbalance |
| 02 | Buyer Money | `prompts/02-buyer-money.md` | P0 | installments→Xendit/Stripe→receipt→invoice→e-sign; 3×404 |
| 06 | Channel Manager | `prompts/06-channel-manager.md` | F.1 | two-way ARI push + reservation import |
| 04 | Coordination | `prompts/04-coordination.md` | F.2 | RFI/Submittal/Punch + DrawingViewer; submittal-approve gates procurement |
| 09 | Estimator | `prompts/09-estimator.md` | F.2 | takeoff: shoelace×scale×rate→BOQ line |
| 03 | AI Inbox + agents | `prompts/03-ai-inbox-agents.md` | P0 | omnichannel + no-code agent builder; HITL |
| 10 | Integrations Hub | `prompts/10-integrations-hub.md` | G.3 | 3 trust tiers; dry-run no false-green; encrypted creds |
| 07 | System Health | `prompts/07-system-health.md` | tech | logger→Sentry; /api/cron/health 503; "success on DB-down" |

**Build order (by deps):** `08 → 01 → (05 → 02) → 06 → (04 → 09) → 03 → 10 → 07.`
Pixel-redesign of the ~70 other screens runs in parallel/after, one screen = one PR, screenshot-diff vs the mock, Layer B tokens, **preserve data-wiring, don't break behavior**.

## 3. Definition of done (every PR)

**Pixel screen:** visually matches mock at 1366px + 390px · Layer-B tokens only, zero `style={{}}` · data-wiring preserved · primitives from `templates/`/design-system · mobile ≤900 + ≤600.

**Functional block (on top of pixel):** migration applied, FK order correct · every mock action = real server effect (no stub/alert/false-green) · status transitions guarded · every query org/role-scoped · empty/loading/error/forbidden present (block 01) · integrations/cron wired · typecheck+lint+smoke clean.

**Cross-cutting:** `error.tsx` ×5 zones (once) · `<Forbidden>` ← RBAC gate (08) · WhatsApp per-org creds (03+10) · `DrawingViewer` mount (04+09) · payment (02) → GL (05) → investor distribution.

## 4. Three sources of truth (in the gitignored package)
- `feature-gaps/_ground-truth-2026-05-29.md` — real routes/tables/agents in main (don't invent).
- `Функциональный статус.html` — 14 cabinets already functional (don't rewrite behavior).
- `Карта покрытия функций.html` — 134 backend actions w/o UI = wire-up work (find the caller), not greenfield.

> Every mock LIES on data (localStorage/fake seed) but is TRUE on behavior. A mock button =
> a contract for a real server effect, not decoration. The `.spec-note` chip in functional
> prototypes gives the exact table/route binding.

---

_Full per-cabinet detail (Management/Development/Owner/Platform §2.1–2.6) lives in the
`cc-functional-handoff/` package (gitignored locally). This doc is the durable contract +
competitor-parity mandate referenced by all design+functional PRs._
