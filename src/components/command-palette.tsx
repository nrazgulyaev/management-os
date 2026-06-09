"use client";

/**
 * Phase 2.1 PR 3 — ⌘K command palette (template 08).
 *
 * Keyboard-driven jump + run + record search. Mounted once globally
 * via `<CommandPaletteProvider>`. The palette itself is a Radix
 * Dialog so focus-trap + escape-to-close behave correctly without a
 * bespoke handler.
 *
 * Sources:
 *   - Actions      → from `getCommandSources` (per-route dynamic import).
 *   - Recents      → `localStorage["arconique.recents.{userId}"]`.
 *   - Records      → `useSearchIndex` (FlexSearch) once user starts typing.
 *   - Navigation   → static nav tree (Mgmt or Dev based on `[data-product]`).
 *
 * Filter prefixes (typed at start of query): `>` actions only,
 * `@` records only, `/` navigation only.
 *
 * Telemetry: opens and chooses are emitted via `src/lib/telemetry.ts`.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { getCommandSources } from "@/features/command-palette/sources";
import type {
  CommandAction,
  CommandNavigation,
  CommandRecord,
  CommandSources,
} from "@/features/command-palette/types";
import { useCabinetAccess } from "@/features/keystone/use-cabinet-access";
import { useSearchIndex } from "@/features/command-palette/use-search-index";
import { emit } from "@/lib/telemetry";

const PRODUCT_PRIMARY = ["management", "development", "owner"] as const;
type Product = (typeof PRODUCT_PRIMARY)[number];

function readProduct(): Product | null {
  if (typeof document === "undefined") return null;
  const el = document.documentElement;
  const v = el.getAttribute("data-product");
  if (PRODUCT_PRIMARY.includes(v as Product)) return v as Product;
  return null;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Group = {
  kind: "actions" | "records" | "recents" | "navigation";
  title: string;
  items: ListItem[];
};

type ListItem =
  | { kind: "action"; action: CommandAction }
  | { kind: "record"; record: CommandRecord }
  | { kind: "nav"; nav: CommandNavigation };

const PREFIX_LOOKUP: Record<string, "actions" | "records" | "nav"> = {
  ">": "actions",
  "@": "records",
  "/": "nav",
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [sources, setSources] = React.useState<CommandSources | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const product = React.useMemo(readProduct, [open]);

  // Keystone gating — the same cabinet-access snapshot the sidebar + mobile
  // tabbar use, so "Jump to cabinet" hides cabinets a role was un-ticked for.
  const access = useCabinetAccess();

  // Resolve per-route sources (actions + navigation) on open.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getCommandSources({ pathname, product, access }).then((next) => {
      if (!cancelled) setSources(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, pathname, product, access]);

  // Telemetry — open event.
  React.useEffect(() => {
    if (!open) return;
    emit("command_palette_opened", { pathname });
  }, [open, pathname]);

  // FlexSearch index — only loaded once the palette opens at least once.
  const index = useSearchIndex(open);

  // Group the visible items based on query + prefix.
  const groups = React.useMemo<Group[]>(() => {
    if (!sources) return [];
    const trimmed = query.trim();
    const prefix = trimmed.length > 0 ? PREFIX_LOOKUP[trimmed[0]] : undefined;
    const haystack = prefix ? trimmed.slice(1).trim() : trimmed;

    const out: Group[] = [];

    // Idle (no query) — show "in this view" actions + recents + nav.
    if (!haystack) {
      if (!prefix || prefix === "actions") {
        if (sources.actions.length) {
          out.push({
            kind: "actions",
            title: "In this view",
            items: sources.actions.map((a) => ({ kind: "action", action: a })),
          });
        }
      }
      const recents = readRecents();
      if (recents.length && (!prefix || prefix === "records")) {
        out.push({
          kind: "recents",
          title: "Recents",
          items: recents.slice(0, 5).map((r) => ({ kind: "record", record: r })),
        });
      }
      if (!prefix || prefix === "nav") {
        out.push({
          kind: "navigation",
          title: "Jump to cabinet",
          items: sources.navigation.slice(0, 8).map((n) => ({ kind: "nav", nav: n })),
        });
      }
      return out;
    }

    // Active query — search records + filter actions/nav.
    if (!prefix || prefix === "records") {
      const records = index.search(haystack, 12);
      if (records.length) {
        out.push({
          kind: "records",
          title: `Records · ${records.length}`,
          items: records.map((r) => ({ kind: "record", record: r })),
        });
      }
    }
    if (!prefix || prefix === "actions") {
      const matches = sources.actions.filter((a) =>
        a.label.toLowerCase().includes(haystack.toLowerCase()),
      );
      if (matches.length) {
        out.push({
          kind: "actions",
          title: `Actions · ${matches.length}`,
          items: matches.map((a) => ({ kind: "action", action: a })),
        });
      }
    }
    if (!prefix || prefix === "nav") {
      const matches = sources.navigation.filter((n) =>
        n.label.toLowerCase().includes(haystack.toLowerCase()),
      );
      if (matches.length) {
        out.push({
          kind: "navigation",
          title: `Jump · ${matches.length}`,
          items: matches.slice(0, 8).map((n) => ({ kind: "nav", nav: n })),
        });
      }
    }
    return out;
  }, [sources, query, index]);

  // Flatten for keyboard nav.
  const flat = React.useMemo<ListItem[]>(() => groups.flatMap((g) => g.items), [groups]);

  // Reset active index whenever the query / sources change.
  React.useEffect(() => {
    setActive(0);
  }, [query, sources]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
    if (!open) setQuery("");
  }, [open]);

  function runItem(item: ListItem, openInNewTab = false) {
    if (item.kind === "action") {
      emit("command_palette_action_chosen", { id: item.action.id, kind: "action" });
      item.action.run({
        router,
        pathname,
        close: () => onOpenChange(false),
      });
      onOpenChange(false);
      return;
    }
    const href = item.kind === "record" ? item.record.href : item.nav.href;
    const id = item.kind === "record" ? item.record.id : item.nav.id;
    emit("command_palette_action_chosen", {
      id,
      kind: item.kind === "record" ? "record" : "nav",
    });
    if (openInNewTab && typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const item = flat[active];
      if (!item) return;
      e.preventDefault();
      runItem(item, e.metaKey || e.ctrlKey);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="ck" aria-label="Command palette">
          <div className="ck-input">
            <span className="sx" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search villas, bookings, owners… or type > for actions"
              aria-label="Search command palette"
            />
            <span className="esc" aria-hidden>ESC</span>
          </div>
          <div className="ck-body">
            {groups.length === 0 ? (
              <div className="ck-empty">
                No matches. Try removing characters, or use{" "}
                <span className="kbd">&gt;</span> for actions.
              </div>
            ) : (
              groups.map((g, gi) => {
                let offset = 0;
                for (let i = 0; i < gi; i++) offset += groups[i].items.length;
                return (
                  <div className="ck-group" key={g.title}>
                    <div className="ck-gt">{g.title}</div>
                    {g.items.map((item, idx) => {
                      const flatIdx = offset + idx;
                      const isOn = flatIdx === active;
                      return (
                        <Row
                          key={rowKey(item, flatIdx)}
                          item={item}
                          on={isOn}
                          query={query}
                          onMouseEnter={() => setActive(flatIdx)}
                          onActivate={(newTab) => runItem(item, newTab)}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
          <div className="ck-foot" role="presentation">
            <span><span className="key">↑↓</span> navigate</span>
            <span><span className="key">↵</span> open</span>
            <span><span className="key">⌘↵</span> new tab</span>
            <span className="grow" />
            <span>
              <span className="key">&gt;</span> actions ·{" "}
              <span className="key">@</span> records ·{" "}
              <span className="key">/</span> nav
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function rowKey(item: ListItem, flatIdx: number): string {
  if (item.kind === "action") return `action-${item.action.id}`;
  if (item.kind === "record") return `record-${item.record.id}`;
  if (item.kind === "nav") return `nav-${item.nav.id}`;
  return `idx-${flatIdx}`;
}

function Row({
  item,
  on,
  query,
  onMouseEnter,
  onActivate,
}: {
  item: ListItem;
  on: boolean;
  query: string;
  onMouseEnter: () => void;
  onActivate: (newTab: boolean) => void;
}) {
  const haystack = query.replace(/^[>@/]\s*/, "");
  if (item.kind === "action") {
    const a = item.action;
    return (
      <button
        type="button"
        className={`ck-item${on ? " on" : ""}`}
        onMouseEnter={onMouseEnter}
        onClick={() => onActivate(false)}
      >
        <span className="ic" aria-hidden>{a.icon ?? "⌃"}</span>
        <div className="ck-body-text">
          <div className="what">{highlight(a.label, haystack)}</div>
          {a.meta && <div className="meta">{a.meta}</div>}
        </div>
        {a.kbd && <span className="kbd">{a.kbd}</span>}
        <span className="arrow" aria-hidden>↵</span>
      </button>
    );
  }
  if (item.kind === "record") {
    const r = item.record;
    return (
      <Link
        className={`ck-item${on ? " on" : ""}`}
        href={r.href}
        onMouseEnter={onMouseEnter}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return; // browser handles new-tab
          e.preventDefault();
          onActivate(false);
        }}
      >
        <span className="ic" aria-hidden>{r.icon ?? "▢"}</span>
        <div className="ck-body-text">
          <div className="what">{highlight(r.label, haystack)}</div>
          {r.meta && <div className="meta">{r.meta}</div>}
        </div>
        <span className="arrow" aria-hidden>↵</span>
      </Link>
    );
  }
  const n = item.nav;
  return (
    <Link
      className={`ck-item${on ? " on" : ""}`}
      href={n.href}
      onMouseEnter={onMouseEnter}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onActivate(false);
      }}
    >
      <span className="ic" aria-hidden>{n.icon ?? "↗"}</span>
      <div className="ck-body-text">
        <div className="what">{highlight(n.label, haystack)}</div>
        {n.meta && <div className="meta">{n.meta}</div>}
      </div>
      {n.kbd && <span className="kbd">{n.kbd}</span>}
      <span className="arrow" aria-hidden>↵</span>
    </Link>
  );
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ---------- Recents (localStorage) ----------

const RECENTS_KEY_BASE = "arconique.recents";

function readRecents(): CommandRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const userId = window.localStorage.getItem(`${RECENTS_KEY_BASE}.userId`) ?? "anon";
    const raw = window.localStorage.getItem(`${RECENTS_KEY_BASE}.${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as CommandRecord[];
  } catch {
    return [];
  }
}

/** Push a record to the user's recents stack. Cap 20. */
export function pushRecent(record: CommandRecord) {
  if (typeof window === "undefined") return;
  try {
    const userId = window.localStorage.getItem(`${RECENTS_KEY_BASE}.userId`) ?? "anon";
    const key = `${RECENTS_KEY_BASE}.${userId}`;
    const raw = window.localStorage.getItem(key);
    const list: CommandRecord[] = raw ? JSON.parse(raw) : [];
    const dedup = [record, ...list.filter((r) => r.id !== record.id)].slice(0, 20);
    window.localStorage.setItem(key, JSON.stringify(dedup));
  } catch {
    // ignore quota / privacy errors
  }
}
