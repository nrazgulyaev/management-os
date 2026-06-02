# PR 1 · Foundations

# Task — Phase 2.1 PR 1 — Foundations primitives

Implement 3 small independent primitives:
- MobileTabbar — fixes HF-12 (live bug: cabinet routes have no nav at ≤900px)
- EmptyState — 5 variants × tone
- Pager (numbered, loadmore, cursor) — 3 separate primitives

References (read before implementing):
- _handoff/templates/mobile-tabbar.html
- _handoff/templates/empty-state.html
- _handoff/templates/pagination.html

## Files to create

### MobileTabbar
- `src/components/dashboard/mobile-tabbar.tsx` (client, `usePathname`)
- `src/components/development/mobile-tabbar.tsx` (sister with Dev nav)
- `src/components/dashboard/mobile-tabbar-more-sheet.tsx` (Radix Dialog with bottom-sheet positioning)
- Extend `src/config/navigation/management.ts` + `src/config/navigation/development.ts` with new `primaryMobileTabs: string[]` export listing the 5 slot keys.

Mount point: render in `src/app/(dashboard)/layout.tsx` + `src/app/(development-app)/layout.tsx` below `{children}`. CSS controls show/hide via the existing 900px breakpoint.

### EmptyState
- `src/components/ui/empty-state.tsx` (server, accepts custom icon)

Props:
```typescript
type EmptyStateProps = {
  variant: "first-run" | "no-results" | "caught-up" | "restricted" | "error";
  title: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;     // custom override
  inline?: boolean;            // row layout for use inside cards
  narrative?: boolean;         // bigger, calmer (Owner Portal)
  meta?: string;               // error refs / timestamps
};
```

Default icon per variant (from `src/components/dashboard/icons.tsx`): first-run = grid+plus, no-results = magnifier, caught-up = check, restricted = lock, error = alert-triangle.

Variant → glyph tone automatically: first-run → accent, caught-up → ok, restricted/error → warn, no-results → neutral.

### Pager (3 separate primitives, NOT polymorphic)
- `src/components/ui/pager-numbered.tsx`
- `src/components/ui/pager-loadmore.tsx`
- `src/components/ui/pager-cursor.tsx`

Props per template's "For Claude Code" table. URL sync via optional `urlKeyPrefix` prop using `useSearchParams` + `useRouter().replace({}, { scroll: false })`.

localStorage key for per-page persistence: `arconique.pager.perPage.{routeKey}` where routeKey = first 2 path segments. Falls back to global default 20.

## CSS

Add to `src/styles/components.css`:

1. `.mobile-tabbar` + `.mt-item` + `.mt-badge` + `.more-sheet` rules — scoped `[data-product]` for the active accent. Display: none at root; `display: grid` inside `@media (max-width: 900px)`.

2. `.empty` + `.empty.inline` + `.empty.narrative` + `.empty .glyph` (with `.accent`/`.ok`/`.warn` tones) — scoped `[data-product]`.

3. `.pager` + `.pager.loadmore` + `.pager.cursor` + `.pg` (page button) + `.pg.on` + `.pg.gap` — scoped `[data-product]`.

Copy exact pixel values from the template HTML's inline `<style>` blocks. Don't change sizes.

## Add main content padding-bottom

In `src/app/(dashboard)/layout.tsx` + `src/app/(development-app)/layout.tsx`, add `@media (max-width: 900px) { main { padding-bottom: 78px } }` to the layout-local CSS (or extend `src/styles/shell.css` mobile block). Ensures tabbar doesn't cover content.

## Apply (proof-of-life)

Wire ONE callsite per primitive to confirm it works end-to-end. Don't refactor everything — just one:

- **EmptyState**: replace the inline `<p style={{...}}>No bookings yet...</p>` in `src/app/(dashboard)/dashboard/bookings/page.tsx` with `<EmptyState variant="first-run" title="No bookings yet" body="..." actions={<Link href="..." className="btn btn-accent btn-sm">Add a villa</Link>} />`.

- **PagerNumbered**: add to the bottom of `src/app/(dashboard)/dashboard/bookings/page.tsx`. URL syncs to `?page=` + `?per=`.

- **MobileTabbar**: mounted in layouts (above) — auto-visible at ≤900px. Verify by resizing browser.

## Validation

- `npm run typecheck` clean
- `npm run lint` clean
- `npm run smoke:routes` clean
- Open `/dashboard` at 390px viewport → confirm MobileTabbar visible at bottom, sidebar hidden, content padding-bottom 78px.
- Open `/dashboard/bookings` → EmptyState renders (assuming no bookings) OR Pager renders below table (if has bookings).

## Commit

PR title: `phase-2.1(foundations): mobile-tabbar (HF-12 fix) + empty-state + pager primitives`

---
