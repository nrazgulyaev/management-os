# Opening prompt for Claude Code

Open the `management-os` repo in Claude Code, then paste the following as your first message. Tweak the path to `design_handoff_arconique_os/` if you've moved the folder.

---

```
We're rolling out a new visual system for Arconique Management OS and
Development OS. The full design handoff is in
`./design_handoff_arconique_os/`. Read these in order, then plan:

  1. design_handoff_arconique_os/README.md
  2. design_handoff_arconique_os/DESIGN_TOKENS.md
  3. design_handoff_arconique_os/COMPONENTS.md

Then scan the screenshots under
`design_handoff_arconique_os/screenshots/` and the HTML prototype under
`design_handoff_arconique_os/source/` so you know what we're aiming for.

The HTML files are reference, not production — recreate them inside our
existing stack (Next.js 15 App Router, Tailwind v4, Radix UI, lucide-react,
recharts) using our existing patterns in `src/components/ui/*`.

Work bottom-up by layer, NOT page-by-page:

  Step 1 — TOKENS. Update src/app/globals.css to the new @theme block
           from DESIGN_TOKENS.md. Verify nothing breaks. Commit.

  Step 2 — PRIMITIVES. Rebuild these to the new spec (see COMPONENTS.md):
           - src/components/ui/primitives/dashboard-kpi.tsx
           - src/components/ui/primitives/area-chart-card.tsx
           - src/components/ui/primitives/donut-ratio-card.tsx
           - src/components/ui/primitives/cabinet-greeting-block.tsx
           Also add new files for components that don't yet exist:
           - cta-pill.tsx, score-chip.tsx, big-stat.tsx,
             dome-donut.tsx, concentric-bubbles.tsx, hero-greet.tsx,
             filter-bar.tsx, mobile-tabbar.tsx
           Each as its own file with a focused export.

  Step 3 — SHELL. Reskin
           - src/components/layout/dashboard-shell.tsx
           - src/components/development/development-shell.tsx
           Sidebar gets the new app switcher (Mgmt / Dev) — store
           selection in a cookie or route, not localStorage.

  Step 4 — PAGES. Page by page now, in this order:
           a. src/app/(dashboard)/dashboard/page.tsx          — Mgmt overview
           b. src/app/(development-app)/development-os/page.tsx — Dev command center
           c. Then the rest of the maps in README.md §Scope

Pick up real data from existing server helpers:
  - getLiveDashboardCounts()
  - getCurrentAppUser()
  - getDevelopmentProjects()
  - mockVillas, mockTopMetrics, mockProjectHealth, mockSnapshotPanels, etc.

Replace my hand-rolled SVG charts with recharts equivalents. Match the
stroke colour, fill gradient stops, grid dashes, and tooltip pill style
exactly — see DESIGN_TOKENS.md and COMPONENTS.md for the values.

Constraints:
  - Don't touch business logic in features/* or lib/*.
  - Don't change DB schema or migrations.
  - Don't add new top-level dependencies — we already have everything.
  - Keep accessibility intact: labels on inputs, role/aria on icon buttons,
    focus-visible rings on keyboard focus only.

Before you start each step, write 1–2 sentences telling me what you're
about to do; then execute. After each step, list the files you changed
so I can spot-check before moving on.

First action: read the three Markdown files above and the existing
src/app/globals.css, then post a short plan for Step 1.
```

---

## Tips while working with it

- After Step 1, run `npm run dev` and verify the old pages still render (with new colors). Don't move on until the build is clean.
- After Step 2, run `npm run typecheck` and `npm run lint`. The primitives feed everywhere — fix all errors before pages.
- For charts: pin a `recharts` `<ResponsiveContainer>` around every chart and let it size itself. Don't hardcode width/height inside the components — just give them a wrapping div with explicit height.
- The italic accent word in titles is rendered as `<h1>Reservations & <span className="italic text-terra">calendar</span></h1>`. Don't make this a prop — it's literal markup per page.

## When Claude Code gets stuck

- Show it the screenshot for the page it's struggling with. The visual reference is the source of truth.
- Refer it back to `COMPONENTS.md` — most "how do I style this" answers are there.
- If a `recharts` Tooltip won't match the pinned-pill style, fall back to the hand-rolled SVG in `source/charts.jsx` for that one chart. It's not a sin.
