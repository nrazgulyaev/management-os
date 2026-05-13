# Sprint 1 — dashboard apex visual capture manifest

**Sprint:** Sprint 1 — chart layer + Mgmt OS `/dashboard` apex rebuild
**Date opened:** 2026-05-13
**Commits in this sprint:**

```
960c967  chore(deps): install recharts for chart primitives
1ec547d  feat(primitives): add recharts-based chart primitives
527eba7  feat(cabinets): wire SparklineChart into CFO cabinet hero KPIs
21061aa  feat(dashboard): rebuild Mgmt OS /dashboard apex on hero tokens + chart primitives
9e98961  fix(primitives): call React.useId before SparklineChart early return
```

## What needs to be captured

Per the Sprint 1 acceptance spec, four `/dashboard` screenshots
covering:

1. `01-desktop-light-auth.png` — light mode, ≥1440px viewport,
   signed-in operator
2. `02-desktop-dark-auth.png` — dark mode (toggle the theme on the
   shell topbar), same viewport, same session
3. `03-mobile-light-auth.png` — light mode, 390×844 viewport, same
   session
4. `04-demo-mode.png` — signed-out (or with
   `NEXT_PUBLIC_ENABLE_DEMO_MODE=1` set in `.env.local`), light mode,
   desktop viewport

## Why the assistant did not auto-capture

The local `.env.local` points at a live Supabase project — capturing
authenticated screenshots requires an interactive sign-in flow that
the agent cannot drive without leaking credentials into a script.
Demo-mode capture also requires either toggling the env flag or
pointing the dev server at an unconfigured DB; doing either via a
spawned subprocess risks polluting the operator's working
environment.

The non-visual acceptance gates ran clean — see "What was verified"
below — and the operator can now capture the four images locally in
~2 minutes.

## How the operator captures them

```bash
# Light + dark + mobile (authenticated)
npm run dev
# → open http://localhost:3000/dashboard in a browser, sign in,
#   capture screenshots at 1440×900 and 390×844 viewports for
#   the three auth shots. Toggle the theme via the dashboard
#   topbar (sun/moon button) for the dark capture.

# Demo mode (no auth)
NEXT_PUBLIC_ENABLE_DEMO_MODE=1 npm run dev
# → open http://localhost:3000/dashboard in a fresh incognito
#   window, capture at 1440×900.
```

Save each into this folder using the filenames above.

## What was verified by the assistant

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` on all new files | ✅ clean (one initial `react-hooks/rules-of-hooks` error in `SparklineChart` fixed in commit `9e98961`) |
| `npm test` | ✅ 5984 / 5984 passing (+20 new Sprint 1 tests over the 5964 baseline) |
| `npm run build` | ✅ build completes, full route table emitted |
| Pre-existing dynamic-server-usage warnings | persist (10.6.B.2-fix `try/catch` resilience path — routes ship as dynamic `ƒ`, expected) |

## What the screenshots should show

### `01-desktop-light-auth.png`

Top → bottom:

1. `CabinetGreetingBlock` — "Good morning/afternoon, {firstName}!"
   with wave emoji + "Portfolio overview" eyebrow + portfolio
   subline + a right-side "All clear" or "SLA attention" badge.
2. **Hero row** — three cards in a 1+2+1 grid:
   - Left: ink-deep hero `DashboardKpi` for "Villas under management"
     with a `SparklineChart` (emerald tone) below the delta.
   - Middle: `AreaChartCard` "Revenue · last 6 months" — emerald
     gradient soft background, smooth area chart, **a black pill
     pinned at the peak month** showing "Rp X.XXB · {month} · peak",
     YoY accessory pill in the header.
   - Right: `ProfileRailCard` with avatar gradient ring + name +
     role + org chip + top-5 occupancy villas as small avatar+label
     rows.
3. **4 tonal mini KPIs** — emerald-soft / gold-soft / surface /
   coral-soft tones across the row (bookings · MTD revenue ·
   check-ins · open tickets).
4. **Schedule + CommsPanel** — 2/3 schedule list (`rounded-3xl` +
   `shadow-soft-card` rows with monospace times) + 1/3 CommsPanel
   notifications panel with circular sender avatars.
5. **Donut row** — gold donut "Occupancy this month" + emerald
   donut "On-time turnover" + Operations Copilot emerald-soft card.
6. Quick-actions strip (4 tiles).
7. "Tonight's villa pulse" — 8 villa cards on `rounded-3xl` +
   `shadow-soft-card`.

### `02-desktop-dark-auth.png`

Same composition, dark canvas (`#0c0e0d`), inverted hero card
contrast, area-chart cursor + tooltip render with the dark-mode
palette.

### `03-mobile-light-auth.png`

Hero row stacks vertically. Schedule + CommsPanel stacks. Donut row
stacks. All cards keep their rounded-3xl + soft-shadow geometry.

### `04-demo-mode.png`

Same composition as `01-`, but the ProfileRailCard reads "Welcome
to Arconique / Demo mode" (no `getCurrentAppUser()` result) and the
greeting falls back to "Good {time-of-day}, there!".

## When the screenshots are added

Update `docs/audits/2026-05-13-copy-a-baseline.md` §4 to flip the
score:

> `/dashboard` apex score vs doctor-dashboard: **2/5 → 4/5**.

The remaining point is reserved for a real embedded chat (the
CommsPanel is currently read-only) and a full multi-week schedule
timeline (today is a flat list).
