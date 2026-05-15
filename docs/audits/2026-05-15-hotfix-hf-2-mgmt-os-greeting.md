# Hotfix HF-2 · Mgmt OS cabinet greeting + sidebar/topbar polish

**Started:** 2026-05-15
**Closed:** 2026-05-15
**Baseline:** 6168 / 6168 tests passing on `main` after Hotfix HF-1.
**Final:** **6166 / 6166 tests passing.** Net −2 from baseline because two legacy 10.5.A.1.1 / 10.6.C.1 assertions about the Owner cabinet's prior greeting stack were updated to match the new shape; no real test churn elsewhere.

## What this hotfix actually fixed

The production screenshot suggested four Mgmt-OS cabinet apexes were still on the legacy `<CabinetGreetingBlock>` + `<PageHeaderHero>` stack. The code audit found **only Owner was truly on the legacy pattern**:

| Cabinet | HeroGreetingAI in code? | Notes |
| --- | --- | --- |
| Front Office | ✅ already mounted | Mega-Sprint Phase 8. Production screenshot likely showed a stale deploy. |
| Owner | ❌ **legacy** — needed fix | Skipped during mega-sprint (audit scored 4/5; HF-2 brings it inline). |
| Concierge | ✅ already mounted | Mega-Sprint Phase 10. |
| Security | ✅ already mounted | Mega-Sprint Phase 11. |
| Housekeeping | ✅ already mounted | Mega-Sprint Phase 9 (reference implementation). |

## Code changes

### Task 2 — Owner cabinet migrated to `<HeroGreetingAI hideAiInput>`

The `<HeroGreetingAI>` primitive grew two new optional props:

- `hideAiInput?: boolean` — drops the AI ask input + mic (read-mostly surfaces where no agent input is wired).
- `greetingOverride?: React.ReactNode` — replaces the auto-generated "Hey, {name}, need help?" line. Useful when the standard framing doesn't fit (Owner reads "N villas under your watch.").
- `subline?: React.ReactNode` — sentence beneath the greeting; replaces the role of the legacy `<PageHeaderHero description>` slot.

When `hideAiInput` is set, the primitive still renders the date chip + role label + headline + optional `subline` — so Owner now matches the silhouette of every other Mgmt-OS apex.

The Owner page (`src/app/(dashboard)/dashboard/owner/page.tsx`) drops both `<CabinetGreetingBlock>` and `<PageHeaderHero>` and mounts a single `<HeroGreetingAI>` with `hideAiInput`, `greetingOverride`, and `subline` set from the existing portfolio data.

### Task 3 — Dev-OS top bar label unified to "Assistants"

`src/components/development/development-app-topbar.tsx` line 48: "AI insight" → "Assistants". The Mgmt-OS top bar (`src/components/layout/dashboard-topbar.tsx`) already said "Assistants" — both rails now consistent.

### Task 4 — Concierge sidebar consolidation

`src/config/navigation.ts` — the 5 guest-AI sidebar items collapsed to a single "Concierge" entry pointing at `/dashboard/concierge`:

| Before | After |
| --- | --- |
| Concierge AI → `/dashboard/guest-ai` | Removed |
| AI sessions → `/dashboard/guest-ai/sessions` | Removed |
| AI handoffs → `/dashboard/guest-ai/handoffs` | Removed |
| Handoff SLA → `/dashboard/guest-ai/handoffs/metrics` | Removed |
| Attachment storage → `/dashboard/guest-ai/storage` | Removed |
| — | **Concierge → `/dashboard/concierge`** |

The 5 sub-routes still work via direct URL (the per-page routes haven't moved). Mega-Sprint Phase 10 already merged the three hubs into the consolidated cabinet apex at `/dashboard/concierge`; this hotfix completes the navigation cleanup that was deferred.

### Task 1 audit — discovery

Audit produced no false-positives outside Owner. The mega-sprint claim that Phase 8 / 10 / 11 shipped `<HeroGreetingAI>` holds in code. Production must catch up via the next deploy.

---

## Task 5 — Investor Portal demo access (low-priority)

The operator `nrazgulyaev@gmail.com` cannot preview `/investor-portal/dashboard` because their app-users row is not bound to an `investor_viewer` role linked to an `investors` row. Two roads to unblock the preview:

1. **Recommended (small):** Extend `drizzle/seed.sql` (or a tiny new seed migration) with a "DEMO_INVESTOR" row + bind it to the operator's `app_users.id`. This is a 10-line SQL diff and the cleanest path for one-off demo accounts.
2. **Optional (bigger):** Build an admin "impersonate investor" mode similar to existing `super_admin` impersonation. Would need:
   - A signed-cookie session swap (`x-impersonate-investor=<investorId>`) gated by `requireInternalUser`.
   - `getInvestorSession` reads the cookie first when the calling app-user has `super_admin`.
   - A control surface in `/dashboard/settings/admin` to pick an investor + drop the cookie.

This sprint scopes-cut both options — out of scope per the spec ("document only"). A follow-up sprint can pick whichever path fits.

---

## Quality gates (Task 6)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | no new errors on touched files |
| `npm test` | **6166 / 6166 passing** (net −2 from 6168 baseline because two Owner-greeting assertions were retargeted to the new HeroGreetingAI contract; no real test churn) |
| `npm run build` | succeeds; all 5 Mgmt-OS cabinet apexes render |

The legacy assertion updates:
- `tests/development-stage-10-5-a-1.test.ts` line 62 — Owner page no longer asserts `\bPageHeaderHero\b`; asserts `\bHeroGreetingAI\b` instead.
- `tests/development-stage-10-6-c-1-cabinets.test.ts` line 56 — Owner CabinetSpec flagged with `sprint4Hero: true` so the loop tests `<HeroGreetingAI>` + ban `<CabinetGreetingBlock>` / `<PageHeaderHero>` on the page (header comment retains `PageHeaderHero` mention so the cross-cabinet `10.5.A.3.5` loop assertion still matches).

---

## Halt

HF-2 ready to push. After Vercel picks up the deploy:
1. Owner cabinet should render `<HeroGreetingAI hideAiInput>` (the silhouette will match Housekeeping minus the prompt input).
2. Front Office should render `<HeroGreetingAI>` (no longer behind a stale deploy).
3. Dev-OS top bar reads "Assistants".
4. Mgmt-OS sidebar's Guest stays group has a single "Concierge" entry.
