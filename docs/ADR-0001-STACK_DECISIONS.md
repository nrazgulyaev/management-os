# ADR-0001 — Stack Decisions (Version 1)

**Status:** Accepted
**Date:** 2026-04-24
**Context:** Version 1 of Arconique Management OS — Public Website + App Shell + Design System Foundation.

This ADR records the concrete package and configuration choices made when scaffolding the app, and the small deviations from the broader `TECHNICAL_ARCHITECTURE.md` intent that were necessary at v1 time.

---

## 1. Decisions

| Concern | Decision | Notes |
|---|---|---|
| Framework | **Next.js 15.5.15** (App Router) | Latest 15.x patch that resolves CVE-2025-66478. `outputFileTracingRoot` pinned to this package to avoid detecting parent lockfiles. |
| UI runtime | **React 19.0.0** | Stable. Compatible with Next 15. Used for server components throughout. |
| Language | **TypeScript 5.7** (strict) | `strict: true` with path alias `@/*` → `src/*`. |
| Styling | **Tailwind CSS v4.0** via `@tailwindcss/postcss` | Uses `@theme inline` directive; tokens live in CSS variables. |
| Dark mode | Custom selector via `@custom-variant dark (&:where(.dark, .dark *))` | Tailwind v4 does not ship the `dark:` variant by default; we register it explicitly. |
| Motion | **Framer Motion 11** | Wrapped only inside `components/marketing/` and `components/field/` — not used in server components. |
| Component primitives | **Radix UI** packages (`react-slot`, `dropdown-menu`, `dialog`, `tabs`, `tooltip`, `avatar`, `separator`, `scroll-area`) | Scaffolded shadcn-compatible components under `components/ui/` without running the shadcn CLI — we write bespoke primitives themed to our tokens. |
| Icons | **lucide-react 0.468** | Stroke-width 1.75 for consistency. |
| Utility merges | **clsx** + **tailwind-merge** + **class-variance-authority** | Standard composition pattern for variant components. |
| Fonts | **Fraunces** (display), **Inter** (sans), **JetBrains Mono** (mono) — via `next/font/google` | Free substitutes for GT Super / Söhne / Söhne Mono described in `DESIGN_SYSTEM.md`. Tokens are typeface-agnostic; swapping fonts later is a one-line change. |
| Linting | **ESLint 9** + `eslint-config-next` (core-web-vitals + typescript) | One rule override: unused-vars warn with `^_` escape hatch; disabled `react/no-unescaped-entities` for editorial copy. |
| Package manager | **npm** (10+) | Simpler bootstrap for v1. Can migrate to pnpm workspaces in v10 when native apps arrive. |
| State / data | None yet | No TanStack Query, no Zustand — Server Components + static mock imports. Added when v2 introduces real data. |
| Testing | Not configured in v1 | Vitest / Playwright / pgtap arrive with v2–v3. |

---

## 2. Deviations from the broader architecture doc

`TECHNICAL_ARCHITECTURE.md` scopes a significantly larger stack. The following items are **intentionally not** installed in v1. They remain the target and will be added in their respective roadmap versions.

| Item | Target version | Why deferred |
|---|---|---|
| Supabase (Auth / Postgres / Storage / Realtime) | v2 | v1 is mock-data only; no DB yet. |
| Drizzle ORM + migrations | v2 | Depends on DB decision being locked. |
| pg-boss / Inngest | v3 | No scheduled jobs in v1. |
| React-PDF / Puppeteer worker | v3 | Statement PDF export arrives with finance module. |
| AI providers, pgvector, retrieval layer | v3 | AI is preview-only in v1. |
| Channel / messaging / smart-lock / camera adapters | v8 | No integration writes or reads in v1. |
| Sentry / OpenTelemetry / Axiom | v2 | Observability added when real traffic matters. |
| Feature flags (ConfigCat) | v7 | Toggle mutating AI tools then. |
| TanStack Query | v4+ | Introduced when interactive admin tables land. |
| Playwright / Vitest / pgtap | v2+ | Tests begin with the data model. |

---

## 3. Folder layout

`src/app` uses App Router route groups for each surface:

```
(public)    → marketing site
(auth)      → login + future auth screens
(dashboard) → admin app; nested under /dashboard/*
(owner)     → /owner/*
(guest)     → /stay/[token]
(field)     → /field/*
```

Route groups keep URLs clean while letting each surface own its layout (header, nav, shell) without leaking into other surfaces.

Components are split between:

- `components/ui/` — generic, surface-agnostic primitives.
- `components/layout/` — per-surface shells.
- `components/brand/` — logo mark + wordmark.
- `components/marketing/`, `components/dashboard/`, `components/owner/`, `components/guest/`, `components/field/` — surface-scoped compositions that consume `ui/` primitives and mock data.

This avoids a single flat `components/` bag and keeps feature folders reachable for future services and tests.

---

## 4. Tailwind v4 specifics

Tailwind v4 replaces the JS `tailwind.config.ts` with a CSS-first approach. The choices:

- **Single `@import "tailwindcss"`** in `globals.css`.
- **PostCSS plugin** `@tailwindcss/postcss` — no separate `tailwindcss` CLI.
- **Tokens as CSS vars** (`:root` + `.dark`), mapped to Tailwind utilities via `@theme inline`.
- **Custom `dark` variant** declared with `@custom-variant dark (&:where(.dark, .dark *))` — not registered by default in v4.

Consequence: there is no `tailwind.config.ts`. Any designer can edit `globals.css` to change tokens without touching code. When we add per-component design refinements, prefer Tailwind utilities powered by tokens over bespoke CSS.

---

## 5. Font decision

`DESIGN_SYSTEM.md` preferred GT Super (display) and Söhne (text) — both licensed foundry families. For v1 we ship the open substitutes **Fraunces + Inter + JetBrains Mono**, served via `next/font/google`, which:

1. Get us an editorial serif aesthetic close to GT Super.
2. Keep bundle size zero (font swapping handled by `next/font`).
3. Are typeface-agnostic at the token layer (`--font-display`, `--font-sans`, `--font-mono`).

We will license and swap GT Super + Söhne when brand finalizes font procurement. Expected change surface: a single edit in `src/app/layout.tsx`.

---

## 6. Known issues / to-watch

- **Tailwind v4** is a new major; watch for breaking upgrades within the 4.x line on minor bumps. Pin as `^4.0.0` for now, review monthly.
- **Next 15 + React 19** stable but new; if we see hydration-related regressions with `next/font` + Framer Motion, we may need to migrate specific components to client-only rendering.
- **Framer Motion 11** is fine; upcoming **motion.dev** rename may impact imports — we use `framer-motion` throughout to allow a clean codemod later.
- **ESLint 9 flat config** is available but we use the legacy `.eslintrc.json` format via `eslint-config-next` to minimize v1 surface. Flat config migration is a v2 cleanup item.

---

## 7. Cross-reference

- Broader architecture: [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md)
- Roadmap for deferred items: [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md)
- Design token source of truth: `src/app/globals.css` (compliant with [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md))
