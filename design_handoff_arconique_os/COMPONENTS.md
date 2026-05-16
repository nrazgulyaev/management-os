# Component anatomy — Arconique OS

Every new or substantially-changed UI primitive. The HTML/CSS comes from the prototype in `source/styles.css`. For React in the real codebase, render them as `<X tone="…" >` components under `@/components/ui/*`.

---

## 1. `<CtaPill>` — primary call-to-action

The signature button across the entire app. Replaces most `<Button variant="primary">` usages for important actions.

**Anatomy** — a wide pill with the label on the left and a smaller round arrow-button glued to the right side, inside the pill.

```tsx
<button className="cta-pill">
  Show my tasks
  <span className="arrow"><ArrowRight size={14} /></span>
</button>
```

**CSS**

```css
.cta-pill {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 12px 8px 12px 22px;     /* tight right because arrow has its own padding */
  background: var(--color-terra);
  color: white;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.15s ease;
  border: 0;
}
.cta-pill:hover { background: var(--color-terra-deep); }
.cta-pill .arrow {
  width: 34px; height: 34px;
  border-radius: 9999px;
  background: rgba(255,255,255,0.16);
  display: grid; place-items: center;
}
```

**Variants** — pass `variant`:
- `default` — terra background, white text (primary)
- `dark` — `ink-deep` background, white text
- `ghost` — `surface-warm` background, `ink` text; the arrow circle becomes `ink-deep` filled

---

## 2. `<HeroGreet>` — landing block on overview pages

Three-column row at the top of every "main" cabinet page (Mgmt overview, Dev command center). Replaces a normal `<PageHeader>` on those pages.

**Layout**: date-badge | greeting (flex-1, italic accent word) | round mic button.

```tsx
<div className="hero-greet">
  <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
    <div className="date-badge">
      <div className="num serif">16</div>
      <div className="lbl">
        <strong>Thu, May</strong>
        Week 20 · 2026
      </div>
    </div>
    <CtaPill>Show my tasks</CtaPill>
    <IconButton><Calendar /></IconButton>
  </div>
  <div className="hero-ai">
    <div className="greet">Hey, <em>Nikita</em>.</div>
    <div className="prompt">Just ask me anything!</div>
  </div>
  <button className="big-mic"><Mic size={26} /></button>
</div>
```

The "italic accent word" is one of: greeting first name (mgmt overview), the action word (e.g. `cashflow`, `command center.`), the noun in a 2-word title.

---

## 3. `<KpiCard tone>` — tonal stat card

Used in every 4-up KPI strip. Tones (in order of frequency): `ink-warm` (the dark hero), `terra`, `olive`, `sea`, `sand`, `warm` (default surface).

```tsx
<div className="card tone-terra">
  <div className="kpi-label">MTD revenue</div>
  <div className="serif kpi-value compact">Rp 8.42B</div>
  <div className="kpi-meta">
    <span className="score-chip">▲ 12.6% YoY</span>
    <span>vs Rp 7.48B</span>
  </div>
</div>
```

Class rules:
- `.card` adds the border + 32px radius + soft shadow.
- `.tone-X` swaps the background to a soft tonal gradient.
- `.kpi-label` is uppercase, 12px, ink-3.
- `.kpi-value` is the big display number. `.compact` makes it 32–44px instead of 44–76px.
- `.kpi-meta` is the row underneath; usually a `score-chip` + a thin comparison string.

---

## 4. `<ScoreChip>` — tiny delta pill

```tsx
<span className="score-chip">▲ 9.3%</span>
```

```css
.score-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: var(--color-terra-soft);
  color: var(--color-terra-deep);
  font-size: 12.5px;
  font-weight: 500;
}
```

Variants by sentiment: pass `tone="success"`/`warning"`/`danger"` for the green/amber/red variants (each picks soft + deep counterparts).

---

## 5. `<BigStat>` — display number with colored `$` and grey unit

```tsx
<div className="big-stat">
  <span className="currency">Rp</span> 8.42<span className="unit">B</span>
</div>
```

```css
.big-stat {
  font-family: var(--font-display);
  font-size: clamp(28px, 3.2vw, 44px);
  letter-spacing: -0.02em;
  line-height: 1;
}
.big-stat .currency { color: var(--color-terra); }
.big-stat .unit { color: var(--color-ink-3); font-size: 0.55em; margin-left: 6px; }
```

---

## 6. `<DomeDonut>` — dark feature donut

The black-circle-with-coral-arc card on the overview. Use exactly once per page.

```tsx
<div className="dome">
  <svg width={180} height={180}>
    <circle cx={90} cy={90} r={70} fill="none" stroke="#5a4a3e" strokeWidth={12} opacity={0.7} />
    <circle cx={90} cy={90} r={70} fill="none" stroke="var(--color-terra)" strokeWidth={12}
            strokeLinecap="round" strokeDasharray="…" transform="rotate(-90 90 90)" />
  </svg>
  <div style={{ textAlign: "center" }}>
    <div className="serif" style={{ fontSize: 38 }}>36%</div>
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Growth rate</div>
  </div>
</div>
```

```css
.dome {
  width: 180px; height: 180px;
  border-radius: 9999px;
  background: radial-gradient(140% 100% at 30% 20%, oklch(0.32 0.018 65), var(--color-ink-deep) 60%);
  display: grid; place-items: center;
  color: white;
  position: relative;
  box-shadow: 0 22px 38px rgba(40, 30, 20, 0.18);
}
```

---

## 7. `<ConcentricBubbles>` — nested-rings "Annual profit" chart

Four (or 3–5) circles, each sized as a percentage of the largest, stacked at the bottom-center.

Props: `rings: { label: string; value: number }[]` — biggest first.

```tsx
<div className="rings">
  {rings.map((r, i) => {
    const size = (r.value / max) * 100;
    return (
      <div className="ring" style={{
        width: `${size}%`, height: `${size}%`,
        left: `${(100 - size) / 2}%`, bottom: 0,
        background: `color-mix(in oklch, var(--color-terra) ${30 + i * 14}%, white)`,
        color: i === rings.length - 1 ? "white" : "var(--color-terra-deep)",
      }}>
        <span className="lbl"><span className="c">$</span>{r.label}</span>
      </div>
    );
  })}
</div>
```

```css
.rings { position: relative; aspect-ratio: 1; width: 100%; max-width: 360px; margin: 0 auto; }
.rings .ring {
  position: absolute;
  border-radius: 50%;
  display: grid; align-items: flex-start; justify-items: center;
  padding-top: 12px;
  font-family: var(--font-display);
  letter-spacing: -0.01em;
}
.rings .ring .lbl { font-size: clamp(13px, 1.4vw, 18px); }
.rings .ring .lbl .c { color: var(--color-terra); }
```

---

## 8. `<AreaChart>` — recharts replacement guide

The prototype uses a hand-rolled SVG with:
- Soft gradient fill (32% terra at top → 0 at bottom)
- 2px terra stroke
- 4 horizontal dashed gridlines (3 6 dash, line-2 color)
- Pinned tooltip at one data point (dark pill with mono label)

Use `recharts` `AreaChart` + `Area type="monotone"` + a `<linearGradient>` + a `<Tooltip>` styled to match the pill.

Stroke color: `var(--color-terra)`. Grid color: `var(--color-line-2)`. Tooltip bg: `var(--color-ink-deep)`. Font: mono in tooltip.

---

## 9. `<Donut>` — solid ratio donut

Default: terra arc on `surface-sunken` track, rounded line caps, value in serif centered.

`size=140`, `thickness=16` for KPI use; `size=180`, `thickness=14` for hero use.

---

## 10. `<Sidebar>` — left navigation

- 248px wide on desktop; collapses to 72px icons-only at ≤1024px; hides entirely at ≤720px (replaced by `<MobileTabbar>`).
- Brand mark at the top: 34px dark warm circle, serif "A" centered (or your real logo).
- Below brand: **app switcher** — two-button segmented control between Management and Development. State stored in `localStorage("arc.app")` for prototype; real app uses session/route.
- Nav items are 8px-padded 12px-radius rows. Active item: `ink-deep` background, white text. Inactive: 13.5px ink-2 text, icon ink-3.
- Section labels (eyebrows like "Workspace") are 10.5px uppercase, 0.10em tracking, ink-3.
- Item badges (e.g. count `12`) are pill-shaped, terra-soft background, terra-deep text. Hide on active.

---

## 11. `<TopBar>` — sticky top

- Sticky, `rgba(245,241,233,0.78)` background with `backdrop-filter: blur(18px)`.
- Left: rounded-pill search input with placeholder "Search villas, bookings, projects…" and a `⌘K` kbd glyph on the right.
- Right: an app-status pill (e.g. `MOS · Live` in olive-soft), then `+`, bell, avatar+name cluster.

---

## 12. `<MobileTabbar>` — bottom nav on mobile

5–6 icons (Home / Bookings / Ops / Copilot for Mgmt; Command / Projects / Procure / Agents for Dev), fixed to the bottom of the viewport, `rgba(255,255,255,0.92)` with blur. Hide on >720px.

---

## 13. Table styles

```css
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl thead th {
  text-align: left; font-weight: 500;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--color-ink-3);
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface-warm);
}
.tbl tbody td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--color-line-2);
  color: var(--color-ink);
}
.tbl tbody tr:last-child td { border-bottom: none; }
.tbl tbody tr:hover { background: var(--color-surface-warm); }
.tbl td.mono { font-family: var(--font-mono); }
.tbl .right { text-align: right; }
```

Wrap tables in a `<div className="card" style={{ padding: 0, overflow: "hidden" }}>` with a header row inside.

---

## 14. `<Pill>` — generic chip

```css
.pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11px; font-weight: 500;
}
.pill.terra   { background: var(--color-terra-soft);   color: var(--color-terra-deep);   }
.pill.olive   { background: var(--color-olive-soft);   color: var(--color-olive-deep);   }
.pill.sea     { background: var(--color-sea-soft);     color: var(--color-sea-deep);     }
.pill.success { background: var(--color-success-soft); color: var(--color-success);      }
.pill.warning { background: var(--color-warning-soft); color: oklch(0.5 0.13 80);        }
.pill.danger  { background: var(--color-danger-soft);  color: var(--color-danger);       }
.pill.ink     { background: var(--color-ink-deep);     color: white;                     }
.pill.neutral { background: var(--color-surface-sunken); color: var(--color-ink-2); border: 1px solid var(--color-line); }
```

Use a leading `<span class="dot" />` for status pills with a colored dot.

---

## 15. `<FilterBar>` — pill-grouped chips

```html
<div class="filterbar">
  <span class="chip active">All</span>
  <span class="chip">Active</span>
  <span class="chip">Pending</span>
</div>
```

Pills sit inside a rounded `surface-warm` container; active pill gets `surface` background + soft shadow.

---

## 16. Chat bubbles (Concierge page)

Guest messages: surface bg, `18px 18px 18px 4px` radius, left-aligned.
Agent messages: terra bg, white text, `18px 18px 4px 18px` radius, right-aligned.
AI messages: `ink-deep` bg, white text, right-aligned, with a small uppercase pill "AI SUGGESTION" at the top of the bubble.

---

## 17. AI panel (Operations Copilot / Executive Brief)

```html
<div class="ai-panel">
  <div class="meta"><Sparkles size={13} /> AM Briefing · 07:00</div>
  <h3>Three arrivals all on track <em>except EV-07</em>.</h3>
  <p>Reasoning…</p>
  <div class="actions">
    <CtaPill>Open Copilot</CtaPill>
    <button class="btn btn-onink">Clear EV-07 review</button>
  </div>
</div>
```

Background is the ink-deep card with two radial gradients (terra at top-right, sea at bottom-left) layered on top — see prototype CSS.

---

## 18. Gantt rows (Dev Projects)

A 32-tall bar with 4 phase segments coloured `olive / terra / sea / ink-deep` (left → right). A vertical 2px line + 12px dot marker shows current progress; line color matches phase status (amber if at-risk).
