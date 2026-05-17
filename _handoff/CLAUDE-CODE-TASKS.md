# Claude Code Tasks — Copy-paste Prompts

If you're using Claude Code in the `management-os` repo, here are ready-to-paste prompts that turn this design package into actual Next.js code. Run them **in order** — each builds on the previous.

---

## Task 1 — Add design tokens + fonts

```
Read the file `_handoff/INTEGRATION.md` Phase 1.

(1) Add Google Font imports for Newsreader, Inter, JetBrains Mono, Space Grotesk, IBM Plex Mono, Fraunces to `src/app/layout.tsx` using `next/font/google` with CSS variables `--font-newsreader`, `--font-inter`, `--font-mono`, `--font-space`, `--font-plex`, `--font-fraunces`.

(2) Open `_handoff/management.html`, `_handoff/development.html`, `_handoff/subscription.html` and copy the `:root { ... }` CSS variable blocks. Merge them into `src/app/globals.css` scoped by `[data-product="management" | "development" | "subscription"]`.

(3) In `src/app/(public)/page.tsx`, read the `x-product` header from `headers()` and set it as `data-product` on the `<html>` element via the root `layout.tsx`.

(4) Add the `.btn`, `.kpi`, `.card`, `.badge`, `.label`, `.display`, `.mono`, `table.data` utility classes from the prototypes into `globals.css`. Keep them product-scoped — the variables resolve correctly per palette.

Verify: `npm run typecheck` passes, `:root[data-product]` cascade is visible in DevTools when toggling the attribute.
```

---

## Task 2 — Port the apex + subscription landings

```
The apex picker `_handoff/index.html` and subscription landing `_handoff/subscription.html` are plain HTML — no React.

(1) Replace `src/app/(public)/page.tsx` for the no-product branch (apex `arconique.com`) with a server component that renders the split-screen picker from `_handoff/index.html`. Keep the existing `headers()` branching logic that redirects platform/management/development.

(2) Add a `subscription` case that renders the full subscription landing. Extract section markup into `_components/subscription/{Hero,Products,WhyBoth,Pricing,Trust,HowItWorks,Faq,Cta,Footer}.tsx`.

(3) Create a small `<RevealOnScroll>` client component (`"use client"`) that IntersectionObserver-watches its children and adds `.in` on enter. This replaces the inline `<script>` in the prototype. Mount in subscription's `layout.tsx`.

(4) Verify all internal links go to real Next.js routes: `/products/management-os`, `/products/development-os`, `/dashboard` (mgmt demo), `/development-os` (dev demo), `/login`, `/signup`, `/pricing`.

Verify: `npm run dev`, visit `localhost:3000` (apex), then add `x-product: subscription` header (via dev proxy or temporarily hardcode) — both should render.
```

---

## Task 3 — Port the Management OS landing

```
Replace `src/app/(public)/products/management-os/page.tsx` with the new design from `_handoff/management.html`.

(1) The HTML file contains 6 `<script type="text/jsx-source">` blocks (shared, landing, auth, frontoffice, owner, app). Extract each into a `.tsx` file under `src/app/(public)/products/management-os/_components/`:
  - `Icons.tsx` (the `I` object — copy verbatim, just JSX components)
  - `MgmtNav.tsx` (sticky top nav with logo + nav links + Sign-in + Start trial)
  - `MgmtFooter.tsx`
  - `Hero.tsx`, `HeroFrame.tsx` (with the floating tiles)
  - `TrustStrip.tsx`
  - `ThreeActs.tsx`
  - `CabinetsSection.tsx` (interactive picker)
  - `AISection.tsx` (dark forest band with 6 agent cards + transcript)
  - `OwnerSection.tsx` (the EV-07 Emma Whitmore March statement mock)
  - `FeatureGrid.tsx`
  - `Testimonial.tsx`
  - `Pricing.tsx` (3 tiers)
  - `CTABand.tsx`

(2) The prototype uses hash-routing (`go("login")` etc) to swap between landing/login/signup/cabinet inside ONE HTML file. In Next.js, these are real routes:
  - `go("landing")` → `<Link href="/products/management-os">`
  - `go("login")` → `<Link href="/login">`
  - `go("signup")` → `<Link href="/signup">`
  - `go("frontoffice")` → `<Link href="/dashboard">`
  - `go("owner")` → `<Link href="/owner">`

Replace all `useState` + `useHashRoute` calls accordingly.

(3) For the auth screens (login/signup in the prototype), replace `src/app/(auth)/login/page.tsx` with the new MgmtLogin design. Do NOT change the actual auth logic — wire the form to your existing `signIn` server action. Same for signup.

(4) Keep all inline styles as-is (they're style props, not CSS-in-JS strings). The compile target is Next.js JSX which accepts `style={{...}}`.

Verify: `npm run dev`, visit `/products/management-os`. Hero loads, scrolling reveals sections (data-reveal still works via Task 5's MotionLayer). Click "Start trial" → goes to `/signup`. Click "Tour live demo" → goes to `/dashboard`.
```

---

## Task 4 — Port the Development OS landing

```
Same as Task 3, but for `_handoff/development.html` → `src/app/(public)/products/development-os/page.tsx`.

Components: Icons, DevNav, DevFooter, Hero, HeroFrame, Marquee, ProjectOverview (with SchematicVilla SVG), CabinetGrid, BOQTeaser, AIAgents, InvestorTeaser, SpecGrid, Pricing, CTABand.

(1) The SchematicVilla component is a pure SVG floorplan — port verbatim into its own file.

(2) Login/signup screens (DevLogin/DevSignup) replace `src/app/(auth)/login/page.tsx` if running under `x-product: development`. You can switch login design dynamically via the same header, or split into separate route groups.

(3) Hash routes map to:
  - `go("boq")` → `<Link href="/development-os/cabinets/qs">`
  - `go("investor")` → `<Link href="/investor-portal/dashboard">`
  - `go("login")` → `<Link href="/login">`

Verify: `/products/development-os` loads. Hero parallax tiles animate on scroll. Click "Open BOQ desk demo" → goes to QS cabinet.
```

---

## Task 5 — Build the dashboard shell

```
Read `_handoff/_shared/mgmt-shell.html` and `_handoff/_shared/dev-shell.html`. They define the shared cabinet shell (sidebar + topbar + page wrapper).

(1) Create `src/components/dashboard/Sidebar.tsx`. It takes `activeKey?: string` and reads the nav tree from `src/config/dashboard-nav.ts`. Port the nav array verbatim from `mgmt-shell.html` (the `MgmtNav` global).

(2) Create `src/components/dashboard/Topbar.tsx` with breadcrumbs, search input, bell badge, user avatar. Wire the current user from your `getCurrentUser()` helper.

(3) Create `src/components/dashboard/Kpi.tsx`, `SectionHeading.tsx`, `Card.tsx`, `Badge.tsx`, `Pulse.tsx` — the small reusable bits.

(4) Update `src/app/(dashboard)/layout.tsx` to render `<Sidebar>` + `<Topbar>` around `{children}`. Each individual page becomes pure body content.

(5) Repeat for `src/components/development/Sidebar.tsx` using `dev-shell.html`'s nav config, and update `src/app/(development-app)/layout.tsx`.

Verify: every `/dashboard/*` and `/development-os/*` route now shows the new sidebar. Pages that haven't been re-skinned yet still work — they're just inside the new chrome.
```

---

## Task 6 — Port the deep Management cabinets

```
Port these 5 cabinets to real Next.js pages, keeping all existing server actions + data queries intact. The prototype HTML in `_handoff/management/*.html` shows the new visual design and data shape.

For each pair (file ↔ route):

(1) `_handoff/management/index.html` → `src/app/(dashboard)/dashboard/page.tsx`
(2) `_handoff/management/bookings.html` → `src/app/(dashboard)/dashboard/bookings/page.tsx`
(3) `_handoff/management/concierge.html` → `src/app/(dashboard)/dashboard/concierge/page.tsx` (create if missing)
(4) `_handoff/management/finance.html` → `src/app/(dashboard)/dashboard/finance/page.tsx`
(5) `_handoff/management/operations.html` → `src/app/(dashboard)/dashboard/operations/page.tsx`
(6) `_handoff/management/ai-hub.html` → `src/app/(dashboard)/dashboard/ai/page.tsx`

For each:
- Open the HTML, find the `<script type="text/jsx-source" data-file="app.js">` block — that's the page body.
- Replace the existing page.tsx return JSX with the prototype's JSX.
- Replace ALL hard-coded demo data (the `STMT_LINES`, `BOOKINGS`, `SESSIONS`, etc. const arrays at the top of each block) with `await` calls to the existing service functions from `src/features/*`.
- For the Concierge transcript: in the prototype it's static data. In production, wire to `src/features/guest-ai/services.getActiveSession()`.
- For the Finance statement: in the prototype it's the Emma Whitmore EV-07 March demo. Replace with the actual statement-detail server query.

Verify: type-check passes, dev server renders each page with live data, sidebar shows the right active state.
```

---

## Task 7 — Port the deep Development cabinets

```
Same as Task 6 for Development OS. Port these 6:

(1) `_handoff/development/index.html` → `src/app/(development-app)/development-os/page.tsx`
(2) `_handoff/development/project-manager.html` → `cabinets/project-manager/page.tsx`
(3) `_handoff/development/cfo.html` → `cabinets/cfo-accountant/page.tsx`
(4) `_handoff/development/qs.html` → `cabinets/qs/page.tsx`
(5) `_handoff/development/procurement.html` → `cabinets/procurement-manager/page.tsx`
(6) `_handoff/development/site-supervisor.html` → `cabinets/site-supervisor/page.tsx`
(7) `_handoff/development/ai-agents.html` → `development-os/ai-agents/page.tsx`

The BOQ table in qs.html uses 142 lines — keep the existing pagination/filter logic from the current page. The prototype shows the top 7 rows for visual richness.
```

---

## Task 8 — Port the remaining cabinets (low priority)

```
The remaining ~30 stub cabinets in `_handoff/management/*.html` and `_handoff/development/*.html` are visual placeholders with KPI strips + sample tables. Port them lazily — the new dashboard shell from Task 5 already wraps every existing page correctly, so even un-ported pages get the new sidebar.

To re-skin a stub: open `_handoff/<product>/<slug>.html`, copy the body JSX, paste into the matching `page.tsx`, replace mock data with live queries.
```

---

## Task 9 — Mobile + motion layer

```
Read `_handoff/_shared/motion-mobile.html`.

(1) Append the entire `<style id="motion-mobile">` block to `src/app/globals.css`. It's mostly `@media (max-width: 900px)` rules using attribute selectors against inline styles. Safe to merge.

(2) Convert the `<script id="motion-mobile-js">` IIFE into a client component `src/components/MotionLayer.tsx` (`"use client"`). It:
  - Auto-tags every `<section>` with `data-reveal`
  - Watches via IntersectionObserver, adds `.in` class
  - Applies parallax to `[data-parallax]` elements
  - Renders a custom cursor (dot + ring) on `(pointer: fine)` devices
  - Adds scroll-progress bar at top
  - Splits `[data-text-reveal]` headlines word-by-word for cascading reveal
  - Wires magnetic hover to `.btn-primary`, `.btn-amber`, `.btn-terra`, `.ra-btn`

(3) Mount once in `src/app/layout.tsx` near the root: `<MotionLayer/>` after `{children}`.

(4) Respect `prefers-reduced-motion: reduce` — already handled in the CSS.

Verify: visit `/products/management-os`, scroll — sections fade in, hero tiles parallax, mouse shows custom cursor. Resize to 390px — cursor disappears, parallax disables, mobile nav opens.
```

---

## Task 10 — Smoke test + Storybook

```
(1) Update `src/lib/route-map.json` (if used) to include the new dashboard routes per `npm run docs:route-map`.

(2) `npm run smoke:routes` — should still pass (≥80 routes).

(3) `npm run preflight:deploy` — full check.

(4) Optional: spin up Storybook stories for `<Sidebar>`, `<Topbar>`, `<Kpi>`, `<Card>`, `<Badge>`. Use the prototype values as default args.

(5) For visual regression, add Playwright tests that screenshot each public landing at 1280/768/390 viewports and compare to baseline images saved in `tests/visual/baselines/`.
```

---

## Tips for Claude Code

- **Always read the relevant `.html` file first** before editing the matching `page.tsx`. The prototype is the source of truth for the visual contract.
- **Don't touch server-side files** in `src/features/*`, `src/lib/db/*`, `drizzle/*` — these stay untouched. You're only swapping presentation.
- **Test responsive on every change**: run `npm run dev`, open Chrome DevTools, toggle device mode (Cmd+Shift+M), check 390/768/1280.
- **When in doubt about a class name** — `kpi`, `card`, `btn-terra`, etc — check `globals.css` or open the prototype's `<style>` block; everything's defined there.
- The HTML prototypes use `data-product` semantics consistently with what `middleware.ts` already does; no new headers needed.
