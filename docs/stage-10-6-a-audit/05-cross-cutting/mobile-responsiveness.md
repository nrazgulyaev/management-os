# 05 — Cross-cutting / Mobile responsiveness

**Method**: Playwright headless at viewport 375×667 (iPhone SE). 30
representative pages screenshotted full-page + horizontal-overflow
detection (`document.documentElement.scrollWidth >
document.documentElement.clientWidth`).

**Source data**: `tmp/audit-mobile-overflow.json`,
`docs/stage-10-6-a-audit/screenshots/mobile/*.png`.

---

## Headline numbers

- **Pages tested**: 30
- **Clean (no horizontal overflow)**: 26 (87%)
- **Horizontal overflow detected**: 4 (13%)
- **Render failures**: 0

The 4 overflow violators are P2 polish issues, not P0/P1 — pages are
functional, they just have an element that pushes past the 375px
viewport.

---

## ✅ Mobile-clean pages (26 of 30)

Spot-check confirms responsive layout adapts well on:
- All 5 public surfaces (`/`, `/pricing`, `/products/management-os`, `/products/development-os`)
- All 9 sampled Mgmt OS pages (Owner cabinet visually verified — KPIs stack 1-col, hero stays readable, side panel flows below main)
- 8 of 10 sampled Dev OS pages
- All 5 sampled admin/settings pages

The Stage 10.5.A cabinet pattern (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)
plus `lg:col-span-2 + <aside>` body-split degrades cleanly to single
column on mobile. `<PageHeaderHero>`'s 44pt+ title scales to ~36pt on
mobile via Tailwind `md:text-[56px]` breakpoint.

---

## 🟡 Horizontal overflow (4 pages)

### `/sign-up` — 14px overflow (sw=389, cw=375)
- Likely cause: a fixed-width form field, button group, or honeypot
  hidden input slightly wider than container.
- Severity: P2 (form still usable, but page bleeds slightly off-screen)
- Fix: inspect form components; add `max-w-full` or `overflow-x-hidden`
  on the wrapping container.
- Effort: ~1h

### `/development-os/sales` — 67px overflow (sw=442, cw=375)
- Likely cause: a sales-pipeline table or wide stage-by-stage layout.
- Severity: P2
- Fix: add table horizontal-scroll wrapper OR convert to card list on mobile.
- Effort: ~2h

### `/development-os/ai-agents` — 109px overflow (sw=484, cw=375)
- Largest violator. Likely cause: agent grid using a fixed minimum
  column width that exceeds 375px.
- Severity: P2
- Fix: change `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` OR
  reduce min-content width.
- Effort: ~1h

### `/dashboard/notifications` — 6px overflow (sw=381, cw=375)
- Marginal — likely a tiny element bleed (filter pill, count badge).
- Severity: P3
- Fix: inspect first item that overflows; trim padding.
- Effort: ~30min

**Total mobile-overflow remediation budget**: ~4-5h (can ride the
Phase 10.6.C UI modernization PR or the 10.6.B critical-fix batch).

---

## What CHECKPOINT 4 mobile sweep did NOT cover

- **Touch-target size audit** — no automated check that interactive
  elements meet 44×44px minimum. Stage 10.D primitives (`<MobileTaskCard>`,
  `<RowActionsMenu>`) explicitly target this; non-cabinet legacy
  surfaces likely have inline-button rows under 44px.
- **Form keyboard friendliness** — no automated test for `inputMode`,
  `autoComplete`, autofocus correctness on mobile.
- **Accessibility** (axe-core / VoiceOver) — Stage 10.5.C scope per
  master plan; not duplicated here.
- **iOS Safari specifics** (rubber-banding, viewport-fit, safe-area)
  — Chromium emulation only; real-device test needed before launch.

These are operator-side sample tasks for Phase 10.6.C / 10.5.C.

---

## Recommendations

1. **Phase 10.6.C** absorbs the 4 overflow fixes (~5h total) into the
   visual-modernization PR.
2. **Phase 10.5.C** (or Phase 10.6.C if expanded scope) does a real
   iOS Safari pass on top-20 customer-journey pages with touch-target
   + accessibility audit.
3. **No mobile blockers for Phase 10.6.B** — mobile is acceptable for
   customer launch from the audit perspective.
