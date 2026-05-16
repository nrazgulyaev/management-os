# Handoff: Arconique OS Redesign

A new visual system for **Arconique Management OS** and **Development OS** — the two operator-facing products in the `nrazgulyaev/management-os` monorepo.

---

## ⚠️ About the files in this bundle

The files under `source/` are **design references built as a standalone HTML prototype** (React + Babel + custom CSS, no build step). They are **not** production code — do not copy them into the app verbatim.

The job is to **recreate this design inside the existing codebase**:

- **Framework**: Next.js 15 App Router (already in place)
- **Styling**: Tailwind CSS v4 (already in place — use the `@theme` block in `src/app/globals.css`)
- **Component library**: Radix UI primitives + the local `@/components/ui/*` system
- **Icons**: `lucide-react` (replace my inline SVG icons one-for-one)
- **Charts**: `recharts` (replace my hand-rolled SVG components)
- **Tables / forms / dialogs**: existing patterns under `src/components/*`

If a primitive doesn't exist, add it to `src/components/ui/` following the existing file conventions in the repo.

---

## Fidelity

**High-fidelity.** All colors, typography, spacing, radii, shadows, and copy are final. The mocks should be matched closely. The data shown is illustrative — wire the real `getLiveDashboardCounts()` / `getDevelopmentProjects()` / etc. queries already present in the repo.

---

## Scope

Two products, each with ~11 screens.

### Management OS (`src/app/(dashboard)/dashboard/*`)
| # | Screen | Maps to current route |
|---|--------|------------------------|
| 1 | Portfolio overview (hero) | `dashboard/page.tsx` |
| 2 | Bookings | `dashboard/bookings/page.tsx` |
| 3 | Finance | `dashboard/finance/page.tsx` |
| 4 | Operations (kanban) | `dashboard/operations/page.tsx` |
| 5 | Front office (arrivals/departures + checklist) | `dashboard/front-office/*` |
| 6 | Guests (CRM table) | `dashboard/guests/page.tsx` |
| 7 | Concierge (split inbox + chat) | `dashboard/concierge/page.tsx` |
| 8 | Operations Copilot | `dashboard/ai/page.tsx` |
| 9 | Villas (card gallery) | `dashboard/villas/page.tsx` (rename of current) |
| 10 | Inventory (par-levels) | `dashboard/inventory/page.tsx` |
| 11 | Channels (OTA status) | `dashboard/channels/page.tsx` |

### Development OS (`src/app/(development-app)/development-os/*`)
| # | Screen | Maps to current route |
|---|--------|------------------------|
| 1 | Command center | `development-os/page.tsx` |
| 2 | Projects (with Gantt) | `development-os/projects/page.tsx` |
| 3 | Cashflow forecast | `development-os/cashflow-forecast/page.tsx` |
| 4 | Investors (cap table) | `development-os/investors/page.tsx` |
| 5 | BoQ (line items + variance) | `development-os/boq/page.tsx` |
| 6 | Procurement (POs) | `development-os/procurement/page.tsx` |
| 7 | QA / QC (inspection register) | `development-os/qa-qc/page.tsx` |
| 8 | Drawings (register) | `development-os/drawings/page.tsx` |
| 9 | Sales & buyers | `development-os/buyers/page.tsx` |
| 10 | Banking | `development-os/banking/page.tsx` |
| 11 | AI Agents | `development-os/ai-agents/page.tsx` |

---

## Implementation order (recommended for Claude Code)

Work **bottom-up by layer**, not page-by-page — most of the visual lift lives in the tokens + primitives.

### Step 1 — Tokens (`src/app/globals.css`)
Open `DESIGN_TOKENS.md` and replace the `@theme` block. Single small commit, verify nothing crashes.

### Step 2 — Primitives (`src/components/ui/primitives/*`)
Rebuild these to the new spec — most of the app inherits from them:

- `dashboard-kpi.tsx` → new tones (`ink-warm`, `terra`, `olive`, `sea`, `sand`), bigger radius (32px), bigger numeric typography
- `area-chart-card.tsx` → new gradient stops, new tooltip pill
- `donut-ratio-card.tsx` → new color tokens
- `cabinet-greeting-block.tsx` → match the new **hero-greet** pattern (date badge + CTA pill + serif greeting + mic button)
- New: `cta-pill.tsx` — primary call-to-action, see `COMPONENTS.md`
- New: `score-chip.tsx` — small delta pill (`▲ +9.3%`)
- New: `big-stat.tsx` — large display number with colored `$` and grey unit
- New: `dome-donut.tsx` — dark circular surface with an arc (reference card style)
- New: `concentric-bubbles.tsx` — nested-circles chart (Annual profit card)

### Step 3 — Shell (`src/components/layout/dashboard-shell.tsx`, `development-shell.tsx`)
Reskin sidebar, topbar, app switcher. Mobile tabbar is new.

### Step 4 — Pages
Reskin each page individually. Use the matching screenshot from `screenshots/` as the reference.

### Step 5 — Charts
Replace hand-rolled SVG with `recharts` equivalents. Pin tooltip styling against the screenshots.

---

## Companion docs

- **`DESIGN_TOKENS.md`** — every color, radius, shadow, font, spacing value with the production Tailwind v4 syntax.
- **`COMPONENTS.md`** — anatomy of every new/changed component with HTML structure, classes, and example usage.
- **`PROMPT_FOR_CLAUDE_CODE.md`** — a copy-pasteable opening prompt for Claude Code that orients it on this work.
- **`source/`** — the HTML prototype itself. Open `index.html` in a browser (any local web server) to interact with the design.
- **`screenshots/`** — PNG captures of every screen, both products.

---

## Aesthetic anchors (the "do not lose this" list)

1. **Warm off-white** background, not cold grey. `oklch(0.962 0.014 80)`.
2. **Coral primary**, not red. Brighter than terracotta but warm — `oklch(0.69 0.155 38)`.
3. **Serif display font** for greetings, KPI values, page titles. `Instrument Serif`. Italic terra accent for one word per heading ("calendar.", "cashflow.", "command center.").
4. **CTA pill with arrow-in-circle** — used everywhere. Replaces the boring `<Button>` for primary actions.
5. **Big rounded cards** (24–40px radius). Mix of tonal soft cards (terra-soft, olive-soft, sea-soft, sand-soft) and one dark hero card per row.
6. **Subtle pills, not heavy badges**. `score-chip` style. Status colour, no border.
7. **Numbers are bigger than you think**. Display values use serif at 30–60px.
8. **Numeric typography is mono**. Use Geist Mono with tabular-nums for all numbers in tables.
9. **No emoji**. The reference shows emoji; we replaced them with mic / arrow icons.
10. **No outlines on focused inputs** unless tabbed via keyboard.

---

## Brand assets

There is no final logo yet — the prototype uses a serif "A" mark on a dark warm circle. When the real logo arrives, replace the `.brand-mark` element only; everything else is bound to design tokens.

---

## How to run the prototype locally

The prototype is a single HTML file with sibling JSX files loaded by an inline bootstrap script that fetches + Babel-transforms them. Any static server works:

```bash
cd source/
python3 -m http.server 8000
# then open http://localhost:8000/
```

That's it — no `npm install`, no build.
