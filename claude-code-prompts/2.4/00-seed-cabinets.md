# Task — Phase 2.4 PR 0 — Seed cabinets + 5 new primitives

This PR seeds the documentation + ships the 5 new design primitives that all 7 Phase-2.4 cabinet PRs compose. **No cabinet logic in this PR — primitives only.**

## Files

### Copy 8 HTML spec docs into `_handoff/cabinets/`

From this project, copy these into the repo at `_handoff/cabinets/`:

```
_handoff/cabinets/_chrome.css                    (already in repo from 2.2 — verify)
_handoff/cabinets/_2.4-primitives.css            (NEW — the CSS for the 5 primitives)
_handoff/cabinets/mgmt-p2/channels.html          (NEW)
_handoff/cabinets/mgmt-p2/dynamic-pricing.html   (NEW)
_handoff/cabinets/mgmt-p2/front-office.html      (NEW)
_handoff/cabinets/mgmt-p2/concierge.html         (NEW)
_handoff/cabinets/dev-p2/site-supervisor.html    (NEW)
_handoff/cabinets/dev-p2/sales.html              (NEW)
_handoff/cabinets/dev-p2/investors.html          (NEW)
_handoff/ds-2.4-primitives.html                  (NEW — the primitive spec doc)
```

> **Note on filenames.** In the design project the shared CSS files are named `chrome.css` and `p24-primitives.css` (the preview server hides files whose names start with `_`). When copying into the repo, rename them back to `_chrome.css` / `_2.4-primitives.css` to match the existing 2.2 convention, and find-replace the corresponding `<link href>` paths inside the cabinet HTMLs (`../chrome.css` → `../_chrome.css`, `../p24-primitives.css` → `../_2.4-primitives.css`).

Cabinet HTML files reference `../_chrome.css` and `../_2.4-primitives.css` — keep that path relative.

### Ship primitives in code

#### A. `src/styles/components-2.4.css` — NEW

Copy the entire content of `_handoff/cabinets/_2.4-primitives.css` here. Then add the import to `src/app/globals.css` (or `src/styles/_index.css` if that's how 2.0.5 wired it):

```css
@import "./styles/components-2.4.css";
```

The file scopes everything under `[data-product]`, so it inherits the per-product palette automatically.

#### B. `src/components/channels/channel-grid.tsx` — NEW

Controlled component. Props:

```ts
type ChannelGridProps = {
  villas: { id: string; name: string }[];
  channels: { id: string; name: string; color: string; type: 'direct' | 'ota'; feePct?: number }[];
  dates: Date[];                        // typically 14 days
  cells: Record<string, RateCell>;      // key = `${villaId}:${channelId}:${dateISO}`
  stays: Stay[];                        // multi-day span overlays
  onCellEdit: (key: string, amount: number) => void;
  onRangeSelect?: (keys: string[]) => void;
  selectedKeys?: string[];
  mobileMode?: 'auto' | 'single-villa';
};
```

CSS classes drive everything — component just emits the markup. See `_handoff/cabinets/_2.4-primitives.css` for `.channel-grid` and `.cg-*` classes.

Inline edit: clicking a cell turns it into `.cg-cell.editing` with an `<input>` autofocus inside `.cg-edit-pop`. Enter saves, Esc cancels, Tab advances right.

Multi-day stays: render an absolutely-positioned `.cg-stay` overlay starting at the first cell of the stay, with `left: 6px; right: -{n*colWidth - 12}px` to span n cells.

#### C. `src/components/pricing/pricing-curve.tsx` — NEW

Wraps Recharts `LineChart`. Props:

```ts
type PricingCurveProps = {
  series: {
    algo: { date: Date; value: number }[];
    active: { date: Date; value: number }[];
    lastYear?: { date: Date; value: number }[];
    compMedian?: { date: Date; value: number }[];
  };
  events?: { date: Date; label: string; severity?: 'normal' | 'high' }[];
  overrides: { date: Date; value: number; pinned: boolean }[];
  onOverrideDrag?: (date: Date, newValue: number) => void;
  period: '30d' | '90d' | '365d';
};
```

Use `<ReferenceLine>` for events + today marker. Use a custom `<Dot>` component for handles (`.pc-handle`) that becomes draggable via mouse events. The tooltip is a separate React node positioned absolutely (`.pc-tooltip`).

#### D. `src/components/site-reports/storyboard-log.tsx` — NEW

Pure presentational. Props:

```ts
type StoryboardDay = {
  date: Date;
  weather: { temp: string; condition: string; stopHours?: number };
  author: { id: string; name: string; role: string; avatar?: string };
  frames: StoryboardFrame[];
};

type StoryboardFrame = {
  id: string;
  photoUrl: string;
  aspect: '16:9' | '4:5' | '21:9';
  pill: { text: string; kind: 'neutral' | 'alert' | 'flag' };
  stamp: string;
  caption: string;
  narration: string;
  side: { key: string; value: string; severity?: 'p1' | 'warn' }[];
};
```

Renders `.sb-day` band with sticky meta column. Photo clicks open a lightbox (Headless UI `Dialog` + `react-zoom-pan-pinch` for zoom).

#### E. `src/components/sales/pipeline-board.tsx` — NEW

Uses `@dnd-kit/sortable` (already in deps from 2.2). Props:

```ts
type PipelineBoardProps = {
  lanes: PipelineLane[];                          // [Lead, Qualified, Tour, Contract, Closed]
  cards: PipelineCard[];                          // each has laneId
  onMove: (cardId: string, fromLane: string, toLane: string, position: number) => void;
  onCardClick: (cardId: string) => void;
  mobileMode?: 'auto' | 'single-lane';            // collapses to swipe-able lane carousel
};
```

Stage transitions on drop emit `stage_changed` events (caller writes to DB).

#### F. `src/components/investors/waterfall-chart.tsx` — NEW

Pure CSS grid implementation — no Recharts. Props:

```ts
type WaterfallChartProps = {
  bars: WaterfallBar[];
  // each bar: { kind: 'start'|'add'|'sub'|'neutral'|'total', label, sublabel?, value, cumulative }
  unit: string;                       // 'IDR billions' etc
  height?: number;                    // default 280
  onBarClick?: (idx: number) => void;
};
```

Component computes cumulative heights as percentages of max, sets `--bars` CSS var equal to `bars.length`. Renders `.wf-bar` elements with computed `height` and `margin-bottom` inline.

## Schema migrations — NONE in this PR

Cabinet PRs each include their own schema. PR 0 is pure presentation.

## Validation

```bash
pnpm typecheck          # all 5 components type-clean
pnpm lint               # no new warnings
pnpm dev                # /design-system still loads · /design-system-2.4 (new index) loads the new primitives
```

Visual: open the dev server and verify the 5 primitives render at:
- `/dev/primitives/channel-grid` — sample with 2 villas × 4 channels × 7 days
- `/dev/primitives/pricing-curve` — 30-day mock data + 1 override
- `/dev/primitives/storyboard-log` — 2 days, 3 frames each
- `/dev/primitives/pipeline-board` — 5 lanes, 12 mock cards
- `/dev/primitives/waterfall-chart` — 7 bars from the cabinet doc

(These can be small ad-hoc dev routes under `src/app/dev/primitives/*` — gated by `process.env.NODE_ENV === 'development'`.)

## Commit message

```
feat(ds): phase 2.4 primitives — ChannelGrid, PricingCurve, StoryboardLog, PipelineBoard, WaterfallChart

Adds 5 new design system primitives under [data-product] scope for the
Phase 2.4 cabinets (Mgmt P2 + Dev P2). CSS in src/styles/components-2.4.css,
React components under src/components/{channels,pricing,site-reports,sales,investors}/.

Spec docs land in _handoff/ds-2.4-primitives.html + _handoff/cabinets/{mgmt-p2,dev-p2}/.

No cabinet logic, no schema. Cabinets follow in PRs 1-7.
```

---

After this merges, Mgmt-P2 (PRs 1-4) and Dev-P2 (PRs 5-7) can ship in parallel — different file trees.
