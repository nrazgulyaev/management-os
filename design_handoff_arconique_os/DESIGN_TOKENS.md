# Design tokens — Arconique OS

Drop this into `src/app/globals.css` inside the `@theme` block. The repo already uses Tailwind v4, so the `@theme { --color-X: …; }` syntax is the right place — Tailwind generates `bg-terra`, `text-terra`, `border-terra`, etc. automatically.

---

## `@theme` block (copy-paste)

```css
@import "tailwindcss";

@theme {
  /* === Surfaces & ink (warm off-white system) === */
  --color-bg:              oklch(0.962 0.014 80);
  --color-bg-elevated:     oklch(0.985 0.008 82);
  --color-surface:         oklch(1 0 0);
  --color-surface-warm:    oklch(0.985 0.013 78);
  --color-surface-sunken:  oklch(0.945 0.014 78);

  --color-ink:             oklch(0.190 0.018 70);  /* primary text */
  --color-ink-2:           oklch(0.420 0.015 72);  /* secondary text */
  --color-ink-3:           oklch(0.620 0.013 75);  /* tertiary text */
  --color-ink-4:           oklch(0.780 0.010 78);  /* disabled / dim */
  --color-ink-deep:        oklch(0.180 0.012 65);  /* feature/dark card bg */
  --color-ink-warm:        oklch(0.260 0.018 65);

  --color-line:            oklch(0.905 0.010 78);  /* card borders */
  --color-line-2:          oklch(0.945 0.008 78);  /* divider lines */
  --color-line-strong:     oklch(0.820 0.012 78);

  /* === Brand accents — natural palette === */
  /* Coral — primary action / accent */
  --color-terra:           oklch(0.690 0.155 38);
  --color-terra-deep:      oklch(0.560 0.155 36);
  --color-terra-soft:      oklch(0.935 0.050 50);
  --color-terra-tint:      oklch(0.970 0.022 50);

  /* Olive — secondary (success-leaning) */
  --color-olive:           oklch(0.580 0.075 120);
  --color-olive-deep:      oklch(0.450 0.075 120);
  --color-olive-soft:      oklch(0.930 0.038 120);
  --color-olive-tint:      oklch(0.970 0.018 120);

  /* Sea — tertiary (info-leaning) */
  --color-sea:             oklch(0.580 0.065 215);
  --color-sea-deep:        oklch(0.420 0.065 215);
  --color-sea-soft:        oklch(0.930 0.030 215);
  --color-sea-tint:        oklch(0.965 0.015 215);

  /* Sand — neutral warm accent */
  --color-sand:            oklch(0.860 0.045 80);
  --color-sand-soft:       oklch(0.940 0.030 80);

  /* === Semantic === */
  --color-success:         oklch(0.620 0.10 150);
  --color-success-soft:    oklch(0.930 0.040 150);
  --color-warning:         oklch(0.720 0.13 80);
  --color-warning-soft:    oklch(0.940 0.060 80);
  --color-danger:          oklch(0.600 0.18 28);
  --color-danger-soft:     oklch(0.940 0.050 30);

  /* === Radii === */
  --radius-xs: 10px;
  --radius-sm: 14px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 32px;     /* default for cards */
  --radius-2xl: 40px;    /* hero / wide feature cards */
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm:   0 1px 2px rgba(60,50,35,0.04),  0 0 0 1px rgba(60,50,35,0.03);
  --shadow-card: 0 1px 3px rgba(60,50,35,0.05),  0 4px 14px rgba(60,50,35,0.05),
                 0 0 0 1px rgba(60,50,35,0.025);
  --shadow-soft: 0 2px 8px rgba(60,50,35,0.045), 0 16px 38px rgba(60,50,35,0.045);
  --shadow-pop:  0 12px 36px rgba(60,50,35,0.12), 0 2px 6px rgba(60,50,35,0.06);

  /* === Typography === */
  --font-display: "Instrument Serif", "Times New Roman", serif;
  --font-sans:    "Geist", "Helvetica Neue", Helvetica, ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Geist Mono", "JetBrains Mono", ui-monospace, monospace;

  --text-xs:   11px;
  --text-sm:   12.5px;
  --text-base: 14px;
  --text-md:   15px;
  --text-lg:   17px;
  --text-xl:   20px;
  --text-2xl:  26px;
  --text-3xl:  34px;
  --text-4xl:  48px;
  --text-5xl:  68px;
}

/* Load Google fonts in your root layout — add a <link> tag with:
   family=Instrument+Serif:ital@0;1
         &family=Geist:wght@300;400;500;600
         &family=Geist+Mono:wght@400;500
*/

body {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-ink);
  font-feature-settings: "cv11", "ss01", "ss03";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.serif { font-family: var(--font-display); letter-spacing: -0.01em; }
.mono  { font-family: var(--font-mono); font-feature-settings: "tnum", "zero"; letter-spacing: -0.01em; }
.tnum  { font-variant-numeric: tabular-nums; }
```

---

## Color usage cheat sheet

| Token | When to use |
|-------|-------------|
| `bg`, `surface-warm`, `surface-sunken` | Page background, hover states, muted areas |
| `surface` | Default card background (most cards) |
| `ink`, `ink-2`, `ink-3` | Primary / secondary / tertiary text — pick by hierarchy |
| `ink-deep` | Dark feature card (always pairs with white text) |
| `terra` | Primary action only — CTA pill, primary chart line, "accent" word in headings |
| `terra-soft`, `terra-tint` | Tonal cards |
| `olive` | Success, on-time, secondary chart series |
| `sea` | Info, in-progress states |
| `sand` | Neutral warm chip / soft card |
| `success`/`warning`/`danger` | Status pills, KPI badges |

**Rule of thumb**: one tonal card per row max for KPI strips. Default card is `surface`. Use `tone-ink-warm` (dark) for the ONE hero KPI per page.

---

## Spacing scale

Use Tailwind's defaults (`gap-1` = 4px, `gap-2` = 8px, etc.). Standard grid gap: `gap-4` (16px) for KPI cards, `gap-5` (20px) for content rows, `gap-6` (24px) for major sections.

Card padding: `p-5` (20px) default, `p-6` (24px) for larger cards, `p-7` (28px) for the hero greet block.

---

## Typography scale (display)

| Use | Element | Size | Font |
|-----|---------|------|------|
| Page title | `<h1>` | `clamp(34px, 4.6vw, 56px)` | Display, weight 400, letter-spacing -0.018em |
| Accent word in title | `<span class="accent">` | inherit | Display italic, color terra |
| Section title (eyebrow group) | `<h2>` | 26px | Display |
| Hero KPI value | `<div>` | `clamp(44px, 5vw, 76px)` | Display, weight 400 |
| Compact KPI | `<div>` | `clamp(32px, 3.4vw, 44px)` | Display, weight 400 |
| Big stat with $ | `.big-stat` | `clamp(28px, 3.2vw, 44px)` | Display, `$` in terra, unit in ink-3 |
| Card title | `.card-title` | 13.5px | Sans 500 |
| Eyebrow | `.eyebrow` | 11.5px | Sans, uppercase, 0.10em tracking, ink-3 |
| Body | `<p>` | 14px / 1.55 | Sans, ink |
| Caption | `.muted` | 11.5px | Sans, ink-3 |
| Table value | `td.mono.tnum` | 13px | Mono, tabular |

---

## Numbers — always mono

Wrap every number that would change in the wild in `<span class="mono tnum">` so columns stay aligned.

```tsx
<span className="mono tnum">Rp 8.42B</span>
<span className="mono tnum">↑ 12.6%</span>
```
