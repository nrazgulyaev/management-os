"use client";

/**
 * Phase 2.1 PR 2 — FilterBar (template 04).
 *
 * Search input + active-filter chips + "+ Filter" trigger + view
 * selector. Renders as a single horizontal band beneath the page
 * header. Click an active chip to edit; click ✕ to remove. Click
 * "+ Filter" → open a popover listing available facets to add;
 * selecting a facet promotes it into a chip with empty values.
 *
 * URL sync — when `urlSync` is true (default), every state change
 * writes `serializeFilters(active)` to the URL via
 * `router.replace(pathname?query, { scroll: false })`. Server pages
 * read `searchParams` for SSR; the bar hydrates idempotently.
 *
 * The chip popover for editing values is intentionally minimal — a
 * stacked checkbox list. Per-cabinet customization (date pickers,
 * range sliders) ships in 2.2 if needed.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ActiveFilter, serializeFilters } from "@/lib/url-state";

export interface FilterDef {
  /** URL/state key. */
  key: string;
  /** Uppercase mono label inside the chip ("STATUS", "CHANNEL"). */
  label: string;
  /** Allowed values. Pass `undefined` for free-form text filters. */
  options?: { value: string; label: string }[];
  /** Allow multiple selections? Default true for option-based, false
   *  otherwise. */
  multi?: boolean;
}

export interface SavedView {
  id: string;
  label: string;
  /** Snapshot to apply when picked. */
  filters: ActiveFilter[];
}

export interface FilterBarProps {
  /** Facets the user can add. */
  filters: FilterDef[];
  /** Currently active chips. */
  active: ActiveFilter[];
  /** Optional saved views (right-aligned dropdown). */
  views?: SavedView[];
  activeViewId?: string;
  onChange: (active: ActiveFilter[]) => void;
  onViewChange?: (id: string) => void;
  /** Search box placeholder. Pass empty string to hide the box. */
  searchPlaceholder?: string;
  onSearchChange?: (q: string) => void;
  /** Default true. Set false to opt out of URL sync (e.g. controlled
   *  by the parent for non-URL state). */
  urlSync?: boolean;
}

export function FilterBar({
  filters,
  active,
  views,
  activeViewId,
  onChange,
  onViewChange,
  searchPlaceholder = "Search…",
  onSearchChange,
  urlSync = true,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commit(next: ActiveFilter[]) {
    onChange(next);
    if (urlSync && pathname) {
      const params = serializeFilters(next, new URLSearchParams(searchParams?.toString() ?? ""));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  function removeChip(key: string) {
    commit(active.filter((f) => f.key !== key));
  }

  function updateChip(key: string, values: string[]) {
    const others = active.filter((f) => f.key !== key);
    if (values.length === 0) {
      commit(others);
      return;
    }
    commit([...others, { key, values }]);
  }

  function addChip(key: string) {
    if (active.some((f) => f.key === key)) return;
    commit([...active, { key, values: [] }]);
  }

  const availableToAdd = filters.filter((f) => !active.some((a) => a.key === f.key));

  return (
    <div className="filter-bar">
      {searchPlaceholder !== "" && (
        <FilterSearch placeholder={searchPlaceholder} onChange={onSearchChange} />
      )}
      {active.map((chip) => {
        const def = filters.find((f) => f.key === chip.key);
        if (!def) return null;
        return (
          <FilterChip
            key={chip.key}
            def={def}
            values={chip.values}
            onChange={(values) => updateChip(chip.key, values)}
            onRemove={() => removeChip(chip.key)}
          />
        );
      })}
      {availableToAdd.length > 0 && <FilterAdd options={availableToAdd} onPick={addChip} />}
      <div className="filter-spacer" />
      {views && views.length > 0 && (
        <FilterView views={views} activeId={activeViewId} onChange={onViewChange} />
      )}
    </div>
  );
}

// ---------- FilterSearch ----------

function FilterSearch({
  placeholder,
  onChange,
}: {
  placeholder: string;
  onChange?: (q: string) => void;
}) {
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => onChange?.(value), 300);
    return () => clearTimeout(t);
  }, [value, onChange]);
  return (
    <div className="filter-search">
      <span className="sx" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
    </div>
  );
}

// ---------- FilterChip ----------

function FilterChip({
  def,
  values,
  onChange,
  onRemove,
}: {
  def: FilterDef;
  values: string[];
  onChange: (values: string[]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(values.length === 0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const multi = def.multi !== false && !!def.options;

  function toggle(v: string) {
    if (multi) {
      const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
      onChange(next);
    } else {
      onChange([v]);
      setOpen(false);
    }
  }

  const summary = (() => {
    if (values.length === 0) return "Pick…";
    if (!def.options) return values.join(", ");
    const labels = values
      .map((v) => def.options!.find((o) => o.value === v)?.label ?? v)
      .filter(Boolean);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels[0]} +${labels.length - 1}`;
  })();

  return (
    <div ref={ref} className={`filter-chip${values.length > 0 ? " on" : ""}`} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="label">{def.label}</span>
        <span>{summary}</span>
      </button>
      {values.length > 0 && (
        <button
          type="button"
          className="close"
          onClick={onRemove}
          aria-label={`Remove ${def.label} filter`}
        >
          ×
        </button>
      )}
      {open && def.options && (
        <div className="filter-chip-pop" role="listbox">
          {def.options.map((opt) => (
            <label key={opt.value} className="filter-chip-opt">
              <input
                type={multi ? "checkbox" : "radio"}
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FilterAdd ----------

function FilterAdd({
  options,
  onPick,
}: {
  options: FilterDef[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="filter-add"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        + Filter
      </button>
      {open && (
        <div className="filter-chip-pop" role="menu">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="filter-chip-opt"
              onClick={() => {
                onPick(opt.key);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FilterView ----------

function FilterView({
  views,
  activeId,
  onChange,
}: {
  views: SavedView[];
  activeId?: string;
  onChange?: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = views.find((v) => v.id === activeId) ?? views[0];

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="filter-view"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <b>{active?.label ?? "View"}</b> <span className="caret">⌄</span>
      </button>
      {open && (
        <div className="filter-chip-pop" role="menu">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className="filter-chip-opt"
              onClick={() => {
                onChange?.(v.id);
                setOpen(false);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
