# PR 2 · Page templates

# Task — Phase 2.1 PR 2 — List + filter shell, Detail-page bricks

Implement the page-shape templates. Two big-ish primitives + several sub-components. References:
- _handoff/templates/list-filter.html
- _handoff/templates/detail-page.html

This is the largest PR of Phase 2.1. If it feels too big once you start, split it into:
- PR 2a: List + filter
- PR 2b: Detail-page bricks

## A — List + filter

### Files
- `src/components/dashboard/list-page.tsx` (server) — page shell with header + filter bar + table + pagination slots.
- `src/components/dashboard/filter-bar.tsx` (client) — manages chip state + URL sync.
  - Sub: `FilterChip`, `FilterAdd`, `FilterSearch`, `FilterView`
- `src/components/dashboard/facet-panel.tsx` (client) — collapsible 240px side panel.
- `src/components/dashboard/bulk-bar.tsx` (client) — replaces filter bar when selection non-empty.
- `src/components/ui/sortable-header.tsx` — `<th>` wrapper that emits sort events.

### Props (key ones)

```typescript
// FilterBar
type FilterBarProps = {
  filters: FilterDef[];      // available facets to add
  active: ActiveFilter[];    // currently set
  views?: SavedView[];       // default view + presets
  onChange(filters: ActiveFilter[]): void;
};

// FacetPanel
type FacetPanelProps = {
  facets: Facet[];           // { key, label, options: {value, label, count}[] }
  selected: Record<string, string[]>;
  onChange(selected: Record<string, string[]>): void;
};

// BulkBar
type BulkBarProps = {
  selectedCount: number;
  actions: { id: string; label: string; icon?: ReactNode; danger?: boolean; onRun(): void }[];
  onClear(): void;
};
```

### CSS
New section in `src/styles/components.css` — `.filter-bar`, `.filter-chip`, `.filter-add`, `.filter-view`, `.facets`, `.facet-opt`, `.bulk-bar`. All scoped `[data-product]`.

### URL helper
New `src/lib/url-state.ts` — `serializeFilters(filters): URLSearchParams` + `parseFilters(params): ActiveFilter[]`. Use shallow routing.

### Apply (proof-of-life)
Refactor `src/app/(dashboard)/dashboard/bookings/page.tsx` to use this shell. Wire 3 filter chips (status, channel, date), one sortable column (Code), bulk actions (Move to project, Bulk edit, Export, Cancel — last is danger).

## B — Detail-page bricks

### Directory
`src/components/dashboard/detail/` — holds 8 brick components + shell.

### Files
- `detail-page.tsx` — shell (handles layout: main + optional side, sticky action bar slot).
- `detail-header.tsx` — breadcrumb + h1 + meta line + actions.
- `detail-tabs.tsx` — in-page tab strip with count badges.
- `detail-side.tsx` — 300px right rail; accepts `cards: SideCard[]`.
- `detail-related.tsx` — bottom-of-page strip; accepts `items: RelatedItem[]`.
- `detail-activity.tsx` — timeline; accepts `entries: ActivityEntry[]`.
- `detail-actionbar.tsx` — sticky bottom bar; conditional render on `dirty || requiresApproval`.
- `inline-edit.tsx` (separate, in `src/components/ui/`) — polymorphic edit-in-place field.

### Composition
Each detail page in 2.2 composes:

```tsx
<DetailPage>
  <DetailHeader breadcrumb={…} title={…} meta={…} actions={…} />
  <DetailTabs tabs={tabs} active={active} onChange={…} />
  <div className="main-and-side">
    <main>{tabContent}</main>
    <DetailSide cards={sideCards} />        {/* optional */}
  </div>
  <DetailRelated items={related} />          {/* optional */}
  <DetailActionBar
    dirty={isDirty}
    onSave={save}
    onDiscard={discard}
    requiresApproval={…}                     {/* optional */}
  />
</DetailPage>
```

### Hook
New `src/components/ui/use-detail-form.ts` — `useDetailForm<T>(initial: T)` returns `{ values, dirtyFields, isDirty, setField, save, discard }`. Inline-edit primitives wire to this.

### CSS
New section in `src/styles/components.css` — all 8 brick classes scoped `[data-product]`. Names match the templates: `.dp-tabs`, `.dp-tab`, `.dp-side`, `.dp-actionbar`, `.inline-edit`, `.activity`, `.activity-item`, `.related`.

### Apply (proof-of-life — one assembly per type)

Refactor THREE existing routes to use the bricks (this is the test that the API is right):

1. **Statement detail** (`src/app/(dashboard)/dashboard/finance/statements/[id]/page.tsx` — if exists; otherwise create stub) — use bricks B1 + B3 + B8 ONLY. No tabs, no side.
2. **Booking detail** (`src/app/(dashboard)/dashboard/bookings/[id]/page.tsx`) — use B1 + B2 + B3 + B4 + B5 + B8. The kitchen sink.
3. **Owner detail** (`src/app/(dashboard)/dashboard/owners/[id]/page.tsx`) — use B1 + B2 + B3 + B5 + B6 (activity-as-main).

## Validation

- `npm run typecheck` clean
- `npm run lint` clean
- `npm run smoke:routes` clean
- Visual: open all 3 refactored routes at 1280px and 390px. Compare against `_handoff/templates/detail-page.html` assembly examples.
- DevTools sanity: confirm classnames + structure match template

## Commit

PR title: `phase-2.1(page-templates): list+filter shell + detail-page modular bricks (8)`

Optional split: if mid-implementation feels too big, commit list+filter as separate PR first, then detail-page.

---
