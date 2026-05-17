# Integration Guide — Porting to the `management-os` Next.js Repo

This document walks through merging the redesigned HTML/JSX prototypes into the existing `nrazgulyaev/management-os` Next.js 15 App Router project. Estimated effort: **2–3 days for a senior dev**, or **a single Claude Code session** following `CLAUDE-CODE-TASKS.md`.

---

## Phase 0 — Prerequisites

The existing repo already has:
- `middleware.ts` that stamps `x-product` header on subdomain requests
- `src/app/(public)/page.tsx` that branches on that header and renders the right product landing
- `src/app/(public)/products/management-os/page.tsx` — the **old** Mgmt-OS marketing page
- `src/app/(public)/products/development-os/page.tsx` — the **old** Dev-OS marketing page
- `src/app/(dashboard)/dashboard/*` — admin pages for Management OS
- `src/app/(development-app)/development-os/*` — admin pages for Development OS

You will replace the marketing pages and **layer the new cabinet designs over the existing admin routes** without breaking server actions or auth.

---

## Phase 1 — Design tokens (1h)

### 1.1 Add fonts to `app/layout.tsx`

```tsx
import { Newsreader, Inter, JetBrains_Mono, Space_Grotesk, IBM_Plex_Mono, Fraunces } from "next/font/google";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jb = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", style: ["normal","italic"] });

// In <body className={...}>: append all .variable
```

### 1.2 Extend `src/app/globals.css` with the three palettes

Copy the `:root { ... }` blocks from `management.html`, `development.html`, `subscription.html` into `globals.css`, scoped by `data-product` attribute:

```css
:root[data-product="management"] {
  --cream: #F4EFE6;
  --terra: #C4583C;
  /* …full Mgmt palette */
}
:root[data-product="development"] {
  --bg: #F1ECE0;
  --amber: #FF6B35;
  /* …full Dev palette */
}
:root[data-product="subscription"] {
  --paper: #F5F0E2;
  --gold: #C9A961;
  /* …full Subscription palette */
}
```

Then in `app/layout.tsx`, set `<html data-product={product}>` from the header value.

### 1.3 Move shared utility classes

Extract `.btn`, `.btn-primary`, `.btn-terra`, `.kpi`, `.card`, `.badge`, `.label`, `.display`, `.mono` and the table styles from the HTML files into `globals.css`. They are product-scoped via the palette variables, so the same `.btn-terra` works correctly under Mgmt or Subscription.

---

## Phase 2 — Replace the public landings (3h)

### 2.1 Management OS landing

**Target:** `src/app/(public)/products/management-os/page.tsx`

In `management.html`, find the `<script type="text/jsx-source">` blocks named `shared.js`, `landing.js`, `app.js`. Each is a self-contained React component tree. Steps:

1. Create a new directory `src/app/(public)/products/management-os/_components/`
2. For each script block, paste its contents into a `.tsx` file:
   - `shared.tsx` → `Icons.tsx`, `MgmtNav.tsx`, `MgmtFooter.tsx`, hash router
   - `landing.tsx` → `Hero.tsx`, `TrustStrip.tsx`, `ThreeActs.tsx`, `CabinetsSection.tsx`, `AISection.tsx`, `OwnerSection.tsx`, `FeatureGrid.tsx`, `Testimonial.tsx`, `Pricing.tsx`, `CTABand.tsx`
3. Convert inline `style={{...}}` to `className="…"` where the prototype uses repeated patterns (KPI tiles, cards). Atomic Tailwind classes optional but recommended for maintenance.
4. Replace the hash-routing (`go("login")`) with Next.js `<Link href="/login">`.
5. Replace `useState` for nav between `landing/login/signup/frontoffice/owner` with real Next.js routes:
   - `landing` → `/products/management-os/`
   - `login` → `/login`
   - `signup` → `/signup`
   - `frontoffice` → `/dashboard` (your existing admin)
   - `owner` → `/owner`

The new `page.tsx` becomes:

```tsx
export default function ManagementOSLanding() {
  return (
    <main>
      <Hero/>
      <TrustStrip/>
      <ThreeActs/>
      <CabinetsSection/>
      <AISection/>
      <OwnerSection/>
      <FeatureGrid/>
      <Testimonial/>
      <Pricing/>
      <CTABand/>
    </main>
  );
}
```

### 2.2 Development OS landing

**Target:** `src/app/(public)/products/development-os/page.tsx`

Same procedure with `development.html`. Maps to `_components/dev/` directory. The hero's `<HeroFrame>` includes a schematic SVG floorplan — copy as-is.

### 2.3 Subscription landing

**Target:** `src/app/(public)/page.tsx` — the `subscription` branch case.

`subscription.html` is plain HTML (no React), so this is just a markup port. Pull each `<section>` into a server component. Reveal-on-scroll is the only JS — keep it as a `"use client"` hook component `<RevealOnScroll>`.

### 2.4 Apex picker

**Target:** `src/app/(public)/page.tsx` — the no-product branch (fallback).

`index.html` is plain HTML, no React. Port directly.

---

## Phase 3 — Cabinets (Management OS, 6h)

The 21 Management cabinets live at:
- `management/index.html` ↔ `src/app/(dashboard)/dashboard/page.tsx` (Overview)
- `management/bookings.html` ↔ `src/app/(dashboard)/dashboard/bookings/page.tsx`
- `management/finance.html` ↔ `src/app/(dashboard)/dashboard/finance/page.tsx`
- …etc.

**Strategy:** the new design is the layout shell + visual language; **server actions, data fetching, and forms in the existing pages stay unchanged.** You're swapping the JSX, not the logic.

### 3.1 Extract shared shell

From `_shared/mgmt-shell.html`, create:
- `src/components/dashboard/Sidebar.tsx` — the left rail with grouped nav
- `src/components/dashboard/Topbar.tsx` — breadcrumb + search + bell + user
- `src/components/dashboard/CabinetPage.tsx` — composes Sidebar + Topbar around `{children}`
- `src/components/dashboard/Kpi.tsx`, `SectionHeading.tsx`

The current `src/app/(dashboard)/layout.tsx` should render the Sidebar + Topbar; each `page.tsx` renders only its content.

### 3.2 Nav config

In `mgmt-shell.html`, the nav tree is `window.MgmtNav`. Port to `src/config/dashboard-nav.ts` as a typed array — this is your single source of truth for the sidebar.

### 3.3 Cabinet bodies

For each file in `management/*.html`:

1. Open the file. Locate the `<script type="text/jsx-source" data-file="app.js">` block — that's the page body.
2. Create or replace the corresponding `src/app/(dashboard)/dashboard/<slug>/page.tsx`.
3. Paste the body, replace `<CabinetPage>` usage (since `layout.tsx` provides Sidebar+Topbar, just return the inner content).
4. Replace hard-coded demo data with the existing server-side queries from `src/features/*`. The mock data in the HTML mirrors `src/lib/mock/*`, so the shape matches.
5. Wire real actions: where the prototype has `<button onClick={()=>…}>`, swap to server-action `<form action={…}>` or `useTransition` + mutate.

Files to port (priority order — already deep in the prototype):
- ✅ index, bookings, concierge, finance, operations, ai-hub (deep designs — port these first)
- Lower priority: projects, villas, owners, shares, guest-stays, villa-guides, guest-services, owner-stays, front-office, availability, maintenance-intelligence, utilities, owner-intelligence, dynamic-pricing, direct-bookings, guest-journey, service-fulfilment, inventory, procurement, integrations, security, system, notifications, audit, settings

---

## Phase 4 — Cabinets (Development OS, 6h)

Identical procedure with `development/*.html` files mapping to `src/app/(development-app)/development-os/*` directory.

Deep designs:
- index (Command center) → `development-os/page.tsx`
- project-manager → `development-os/cabinets/project-manager/page.tsx`
- cfo → `cabinets/cfo-accountant/page.tsx`
- qs → `cabinets/qs/page.tsx`
- procurement → `cabinets/procurement-manager/page.tsx`
- site-supervisor → `cabinets/site-supervisor/page.tsx`
- ai-agents → `development-os/ai-agents/page.tsx`
- investor → `(investor-portal)/dashboard/page.tsx` if separate, or `development-os/investors/page.tsx`

---

## Phase 5 — Motion + responsive (1h)

`_shared/motion-mobile.html` is a single CSS+JS layer. Port:

- The `<style id="motion-mobile">` block → `src/app/globals.css` (mobile media queries already there, just append the reveal/cursor styles)
- The `<script id="motion-mobile-js">` IIFE → `src/components/MotionLayer.tsx` (`"use client"`). Mount in `app/layout.tsx`.

It auto-tags every `<section>` with `data-reveal`. Once mounted, every page gets reveal-on-scroll for free.

---

## Phase 6 — QA (2h)

The existing repo already has Playwright. Add:

1. **Visual diff** between an HTML prototype rendered at `iframe src=".../management/bookings.html"` vs the new `/dashboard/bookings` page. Compare via Percy or `playwright-screenshot-utils`.
2. **Responsive** — verify each route at 390/768/1280 viewports. The `mobile-qa.html` harness in this archive shows all 30 (product × route × viewport) combos; replicate against the live Next.js routes.
3. **Smoke routes** — your existing `npm run smoke:routes` should still pass.

---

## Phase 7 — Deploy

The repo is Vercel-ready per `vercel.json`. Standard `npm run preflight:deploy` should pass. Subdomain routing already works via `middleware.ts`.

Set DNS:
- `arconique.com` → main app (no x-product → apex picker)
- `subscription.arconique.com` → main app (middleware stamps `x-product: subscription`)
- `management.arconique.com` → main app (middleware stamps `x-product: management`)
- `development.arconique.com` → main app (middleware stamps `x-product: development`)

---

## File inventory

| File | Bytes | Purpose |
|---|---|---|
| `index.html` | 7 KB | Apex split-screen picker |
| `subscription.html` | 48 KB | Subscription landing |
| `management.html` | 137 KB | Mgmt OS landing + login/signup |
| `development.html` | 144 KB | Dev OS landing + login/signup |
| `management/*.html` × 21 | ~40–53 KB each | Mgmt cabinet demos |
| `development/*.html` × 20 | ~25–55 KB each | Dev cabinet demos |
| `_shared/mgmt-shell.html` | 37 KB | Template for new Mgmt cabinet |
| `_shared/dev-shell.html` | 25 KB | Template for new Dev cabinet |
| `_shared/motion-mobile.html` | 18 KB | Motion + responsive layer |

Total: ~1.8 MB of source HTML, ~220 distinct screens demonstrated.

---

## Open questions for the dev who picks this up

1. Do you want a **dark mode** variant? The Mgmt palette has a `--forest-deep` already; would need to define an inverse for each token.
2. The cabinets use **fake** real-time data (e.g. "live sessions: 18"). Decide whether to keep mock values or wire to live counters.
3. The Subscription landing uses Fraunces (variable font, ~250KB). If page-weight is a concern, swap to a static-subset import or use a closer system fallback like Georgia + manual italic.
4. The Concierge demo shows a fake AI typing indicator. Wire to your real Concierge AI run-stream or keep as marketing fiction.
