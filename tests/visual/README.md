# Visual regression — public landings + cabinets

Screenshot diffing for two surfaces:

| Suite | Spec | Projects (viewport) | Auth |
| --- | --- | --- | --- |
| Public landings (Task 10) | `public-landings.spec.ts` | `desktop` (1280) / `tablet` (768) / `mobile` (390) | none |
| Cabinets (redesigned app screens) | `cabinets.spec.ts` | `cabinet-desktop` (1366) / `cabinet-mobile` (390) | real sessions via `cabinets.setup.ts` |

- Config: `../../playwright.visual.config.ts`
- Baselines: `<spec>.spec.ts-snapshots/<name>-<project>-<platform>.png` (committed once generated)
- CI: `.github/workflows/visual-regression.yml` runs `npm run test:visual` on PRs.
- Storage states: `tests/visual/.auth/*.json` — **gitignored** (live session
  cookies; see `tests/visual/.gitignore`). Regenerated on every run by the
  `cabinet-auth` setup project.

## Current baseline status (2026-06-10)

**36 landing baselines are committed** in
`public-landings.spec.ts-snapshots/` — 12 pages x 3 viewports, all with the
**`-darwin.png`** suffix (generated on the founder's macOS machine, Playwright
1.60 / bundled Chromium). Each PNG was eyeballed after generation: full-page
renders of the real design-system pages, no error overlays, no blanks.
Stability was proven with two consecutive non-update diff runs (36/36 green
each) plus a full `npm run test:visual` run (36 passed, 33 cabinet skips).

Exact commands used (no DB configured — `.env.local` has only Vercel CLI
vars; the landings are public and need none):

```bash
npx playwright install chromium
NEXT_PUBLIC_ENABLE_DEMO_MODE=true npm run build
PORT=3101 NEXT_PUBLIC_ENABLE_DEMO_MODE=true npm run start &
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:landings:update
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:landings   # diff: 36 passed
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual            # 36 passed, 33 skipped
```

Known capture quirks (real page behavior, baselined as-is):

- `products-management-os` mobile (408px wide) and `products-development-os`
  mobile/tablet (401/891px wide) capture **wider than their viewports** —
  those pages have horizontal overflow at small widths. If that overflow is
  ever fixed, the baselines will (correctly) diff; regenerate them.
- `portfolio` renders gradient placeholder images for the villa cards — that
  is the current live state, not a broken capture.

> **CI platform mismatch (unresolved).** The workflow
> (`.github/workflows/visual-regression.yml`) runs on `ubuntu-latest`, so
> Playwright there looks for **`-linux.png`** baselines — the committed
> `-darwin.png` set is invisible to it. Worse, the workflow's "no baselines
> yet" guard only checks that *some* `*-snapshots/*.png` exist, so once the
> darwin set is committed CI will run the diff and **fail all 36 landings
> with "snapshot doesn't exist"** (in CI Playwright does not write missing
> snapshots). Fix options: (a) generate a linux set via the workflow's
> `update=true` dispatch input and commit that artifact alongside the darwin
> set — each OS then compares against its own suffix; or (b) switch the
> workflow to a `macos-*` runner so it shares the darwin baselines. Until
> one of those lands, expect the CI visual job to be red on landing-path PRs.

**No cabinet baselines are committed.** Without `PLAYWRIGHT_VISUAL_*`
credentials and a seeded DB the `cabinet-auth` setup and all cabinet screens
skip (verified: `npm run test:visual:cabinets` exits 0 with 33 skips — that
is the honest current state, no faked sessions). To generate them the founder
must export, on a machine with the seeded database reachable
(`DATABASE_URL` + Supabase vars in `.env.local`):

- `PLAYWRIGHT_VISUAL_ADMIN_EMAIL` / `PLAYWRIGHT_VISUAL_ADMIN_PASSWORD` — a
  `super_admin` test account
- `PLAYWRIGHT_VISUAL_OWNER_EMAIL` / `PLAYWRIGHT_VISUAL_OWNER_PASSWORD` — an
  app user with an owner-portal grant (`npm run seed:auth-owner-grants`)
- `PLAYWRIGHT_VISUAL_INVESTOR_EMAIL` / `PLAYWRIGHT_VISUAL_INVESTOR_PASSWORD`
  — `investor_viewer` role + non-null `investor_id`
  (`npm run seed:auth-investor-grants`)

plus the per-screen seeds in the table below, then run
`npm run test:visual:cabinets:update` (full recipe in
"Generate / refresh baselines").

> Screenshots are rendering-environment specific (fonts via `next/font` need
> network at build time, antialiasing differs per OS) and the cabinet screens
> additionally depend on seeded data. Always generate and diff on the same
> OS against the same DB snapshot.

## Scripts

```bash
npm run test:visual                   # everything (cabinets skip if creds absent)
npm run test:visual:update            # regenerate ALL baselines
npm run test:visual:landings          # landings only (no auth needed)
npm run test:visual:landings:update
npm run test:visual:cabinets          # cabinets only (runs cabinet-auth first)
npm run test:visual:cabinets:update
```

All accept `PLAYWRIGHT_BASE_URL` (default `http://localhost:3101`).

## Cabinet suite — how auth works

`cabinets.setup.ts` (project `cabinet-auth`, a dependency of both cabinet
projects) signs three personas in through the real `/login` form and saves
each session as a Playwright storage state. **No session is ever faked** — a
persona without credentials skips its screens with an explanatory message,
and every test asserts it actually landed on the target path (the layouts
redirect under-privileged sessions, e.g. `/owner` → `/dashboard`), so a
mis-provisioned account fails loudly instead of baselining the wrong screen.

| Persona | Env vars | Account requirements | Screens |
| --- | --- | --- | --- |
| `admin` | `PLAYWRIGHT_VISUAL_ADMIN_EMAIL` / `_PASSWORD` | `super_admin` role (bypasses per-product access; passes the `/platform` gate) | all Mgmt OS, Dev OS, Platform OS screens |
| `owner` | `PLAYWRIGHT_VISUAL_OWNER_EMAIL` / `_PASSWORD` | active app user with an owner-portal grant (`npm run seed:auth-owner-grants`) | `/owner` |
| `investor` | `PLAYWRIGHT_VISUAL_INVESTOR_EMAIL` / `_PASSWORD` | active app user with `investor_viewer` role + non-null `investor_id` (`npm run seed:auth-investor-grants`) | `/investor-portal/dashboard` |

Use dedicated test accounts (e.g. from `npm run seed:test-team-accounts`),
never real customer logins.

## Cabinet suite — screens, seeds, masking

Cabinet screenshots are only comparable against **the same seeded dataset**.
Generate baselines and run diffs against the same DB snapshot (the demo org
seeds below); a different dataset is a guaranteed diff, not a regression.

| Screen | Path | Data it renders / relevant seeds |
| --- | --- | --- |
| `mgmt-dashboard` | `/dashboard` | demo org KPIs — `npm run db:seed` + `npm run seed:arconique-demo` |
| `mgmt-owners` | `/dashboard/owners` | owners list — `seed:arconique-demo` |
| `mgmt-owner-intelligence` | `/dashboard/owner-intelligence` | owner analytics — `seed:arconique-demo` (+ `seed:statements` for payout figures) |
| `mgmt-bookings-calendar` | `/dashboard/bookings/calendar?range=month&start=2026-06-01` | bookings in the **pinned** June-2026 window — `seed:arconique-demo` / `seed:booking-detail-demo`. The pinned `start=` keeps the grid deterministic; if your seed's bookings live in another month, change the anchor in `cabinets.spec.ts` and regenerate. |
| `mgmt-finance-statements` | `/dashboard/finance/statements` | owner statements — `npm run seed:statements` |
| `mgmt-operations` | `/dashboard/operations` | ops board — `seed:arconique-demo` |
| `dev-home` | `/development-os` | Dev OS overview — `npm run db:seed:dev-os` |
| `dev-executive` | `/development-os/executive` | exec KPIs — `db:seed:dev-os` |
| `dev-general-ledger` | `/development-os/finance/general-ledger` | GL accounts — `npm run seed:gl-coa` + `db:seed:dev-os` |
| `dev-coordination` | `/development-os/coordination` | coordination board — `db:seed:dev-os` |
| `dev-projects` | `/development-os/projects` | projects list — `db:seed:dev-os` |
| `owner-home` | `/owner` | the owner persona's villas/statements — `seed:auth-owner-grants` (+ mgmt seeds above) |
| `investor-dashboard` | `/investor-portal/dashboard` | the investor persona's capital ledger — `seed:auth-investor-grants` + `seed:demo-3-investor` / `seed:investor-2-ledger` |
| `platform-home` | `/platform` | platform overview (super_admin) |
| `platform-agents` | `/platform/agents` | agent registry — `npm run seed:ai-agent-config` |

**Masked on every screen** (purple boxes in baselines): `<time>` elements
(relative "2 min ago" stamps) and anything tagged `data-visual-volatile` —
that attribute is the opt-in hatch for components that render run-dependent
content (live clocks, "last synced" chips). If a screen diffs only on a
volatile region, tag the component rather than loosening the tolerance.

**Full-page vs viewport**: screens are captured full-page except
`mgmt-bookings-calendar` (viewport-clipped — grid height varies with booking
volume). If a list screen's row count is unstable in your dataset, flip its
`fullPage: false` in `cabinets.spec.ts` rather than re-seeding around it.

## Generate / refresh baselines (founder, local)

```bash
# 1. Seed the DB (once per snapshot) — see the table above for what each
#    screen needs. Then build + start prod mode (fonts fetched at build):
npm run build
PORT=3101 npm start &

# 2. Landings (no auth):
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:landings:update

# 3. Cabinets (per-persona creds):
PLAYWRIGHT_VISUAL_ADMIN_EMAIL=... PLAYWRIGHT_VISUAL_ADMIN_PASSWORD=... \
PLAYWRIGHT_VISUAL_OWNER_EMAIL=... PLAYWRIGHT_VISUAL_OWNER_PASSWORD=... \
PLAYWRIGHT_VISUAL_INVESTOR_EMAIL=... PLAYWRIGHT_VISUAL_INVESTOR_PASSWORD=... \
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual:cabinets:update

# 4. Review the PNGs in tests/visual/*-snapshots/ (eyeball every one — an
#    update run happily baselines a broken screen), then commit them.
#    Do NOT commit tests/visual/.auth/ (gitignored).
```

Missing a persona's creds? Its screens skip — you can generate the admin
screens now and add owner/investor baselines later; the diff run only
compares baselines that exist.

## Run the comparison (CI / local)

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3101 npm run test:visual
```

In CI (`.github/workflows/visual-regression.yml`): the landings run as
before. For cabinets, the workflow needs (a) a seeded Postgres matching the
baseline snapshot and (b) the three `PLAYWRIGHT_VISUAL_*` secret pairs
exported into the job env — until those are wired, cabinet tests skip and CI
stays green. The diff run must use the same OS/browser as baseline
generation (or keep generating via the workflow's `update=true` artifact
path) — cross-OS font rendering will false-positive.

Tolerance: `maxDiffPixelRatio: 0.02` (set once in the config for both
suites) — small antialiasing noise passes; real layout drift fails. Tighten
once baselines are stable.

## Add a screen

- Landing: append `{ name, path }` to `LANDINGS` in
  `public-landings.spec.ts`.
- Cabinet: append `{ name, path }` to the right persona's suite in
  `cabinets.spec.ts` (new persona → add it to `cabinet-personas.ts` +
  `cabinets.setup.ts` picks it up automatically). Then run the matching
  `:update` script and commit the new baselines.
