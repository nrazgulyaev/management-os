# Arconique OS — Design Handoff Package

This archive contains the complete redesigned UI for **three public surfaces** of arconique.com plus **41 cabinet demos** for the two products. Everything in this folder is plain HTML + inline React/JSX compiled at runtime via Babel — no build step required.

## What's in the box

```
.
├── index.html                    ← Split-screen picker (apex arconique.com)
├── subscription.html             ← subscription.arconique.com landing
├── management.html               ← management.arconique.com landing
├── development.html              ← development.arconique.com landing
│
├── management/                   ← 21 Management OS cabinets
│   ├── index.html                ← /dashboard (Overview)
│   ├── bookings.html             ← /dashboard/bookings (deep)
│   ├── concierge.html            ← /dashboard/concierge (deep)
│   ├── finance.html              ← /dashboard/finance (deep)
│   ├── operations.html           ← /dashboard/operations (deep)
│   ├── ai-hub.html               ← /dashboard/ai (deep)
│   └── …16 more cabinet pages
│
├── development/                  ← 20 Development OS cabinets
│   ├── index.html                ← /development-os (Command center)
│   ├── project-manager.html      ← /development-os/cabinets/project-manager (deep)
│   ├── cfo.html                  ← /development-os/cabinets/cfo (deep)
│   ├── qs.html                   ← /development-os/cabinets/qs (deep)
│   ├── procurement.html          ← /development-os/cabinets/procurement (deep)
│   ├── site-supervisor.html      ← /development-os/cabinets/site (deep)
│   ├── ai-agents.html            ← /development-os/ai-agents (deep)
│   └── …14 more cabinet pages
│
├── _shared/
│   ├── mgmt-shell.html           ← Template for new Mgmt cabinets
│   ├── dev-shell.html            ← Template for new Dev cabinets
│   └── motion-mobile.html        ← Reveal + cursor + mobile responsive layer
│
├── INTEGRATION.md                ← Step-by-step Next.js integration guide
├── CLAUDE-CODE-TASKS.md          ← Copy-paste prompts for Claude Code
└── README.md                     ← This file
```

## How each domain maps

| File | Production URL | Repo route |
|---|---|---|
| `index.html` | `arconique.com/` | `src/app/(public)/page.tsx` — apex picker |
| `subscription.html` | `subscription.arconique.com/` | `src/app/(public)/page.tsx` — branch via `x-product: subscription` header |
| `management.html` | `management.arconique.com/` | `src/app/(public)/page.tsx` — branch via `x-product: management` |
| `development.html` | `development.arconique.com/` | `src/app/(public)/page.tsx` — branch via `x-product: development` |
| `management/*.html` | `management.arconique.com/dashboard/*` | `src/app/(dashboard)/dashboard/*/page.tsx` |
| `development/*.html` | `development.arconique.com/development-os/*` | `src/app/(development-app)/development-os/*/page.tsx` |

Your existing `middleware.ts` already stamps the `x-product` header. The umbrella `(public)/page.tsx` already branches on it.

## Design tokens

### Management OS palette (warm hospitality)
```
--cream:        #F4EFE6
--paper:        #FFFCF7
--ink:          #14201C
--forest:       #1F3A33
--terra:        #C4583C   ← primary accent
--gold:         #BC9A5C
--sage:         #88A89A
--line:         #DAD2C0
```
Fonts: **Newsreader** (serif display) + Inter (body) + JetBrains Mono (numbers).

### Development OS palette (engineering grade · light canvas)
```
--bg:          #F1ECE0     ← warm cream base
--panel:       #FFFFFF
--ink:         #14130E
--amber:       #FF6B35     ← primary accent
--steel:       #3D5A7A
--line:        #E5DECC
```
Fonts: **Space Grotesk** (display, weight 500) + Inter (body) + IBM Plex Mono (data/numbers).

### Subscription palette (boutique editorial)
```
--paper:       #F5F0E2     ← bone paper
--ink:         #0F1A1F     ← deep teal-black
--gold:        #C9A961
--terra:       #C4583C     ← unified with Mgmt
--amber:       #FF6B35     ← unified with Dev
```
Fonts: **Fraunces** (variable serif, opsz+ital) + Inter + JetBrains Mono.

## What's already wired

- Landing CTAs → cabinet demos (clicking "Start trial" on `management.html` jumps to `management/index.html`).
- Sidebar nav across all 41 cabinets — full route tree from the existing admin sidebar.
- Real demo data from the repo's `src/lib/mock/*` files: Eternal Estates, Enso Villas, Ahau Gardens, owners Emma Whitmore / Takeda Family Office / Larsen Holdings, staff names, IDR cost basis.
- Mobile responsive (390px / 768px / 1024px verified clean).
- Reveal-on-scroll, parallax, magnetic CTA hover, custom cursor (desktop only).

## Run locally without integration

Just open `index.html` in any modern browser. No build step. Every page is self-contained.

For the dev preview pane, the project also includes a `mobile-qa.html` harness that loads every route in iPhone/iPad iframes for QA.

## Next step

Open **`INTEGRATION.md`** for the porting plan, or **`CLAUDE-CODE-TASKS.md`** for copy-paste prompts you can give Claude Code in the actual repo.
