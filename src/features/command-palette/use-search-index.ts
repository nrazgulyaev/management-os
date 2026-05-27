"use client";

/**
 * Phase 2.1 PR 3 — FlexSearch-backed record index for the ⌘K palette.
 *
 * Loads on first open of the palette (lazy, no upfront cost), hits
 * `/api/command-palette/index` once per session, and indexes the
 * returned record set on the client. Returns a `search(query)`
 * function that resolves in ≤30ms for ≤10k records.
 *
 * Cap is enforced on the server (`route.ts`); the client trusts the
 * payload and just indexes what arrives.
 */

import * as React from "react";
import { Index } from "flexsearch";
import type { CommandRecord } from "./types";

interface UseSearchIndexResult {
  ready: boolean;
  error: string | null;
  /** Returns up to `limit` records matching the query. */
  search: (query: string, limit?: number) => CommandRecord[];
  /** Total indexed record count. */
  size: number;
}

export function useSearchIndex(enabled: boolean): UseSearchIndexResult {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const indexRef = React.useRef<Index | null>(null);
  const byIdRef = React.useRef<Map<string, CommandRecord>>(new Map());

  React.useEffect(() => {
    if (!enabled || ready || error || indexRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/command-palette/index", {
          // The index isn't sensitive but we don't want to fight
          // any aggressive route-handler caching either.
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { records: CommandRecord[] };
        if (cancelled) return;

        const index = new Index({
          tokenize: "forward",
          cache: 100,
        });
        const map = new Map<string, CommandRecord>();
        for (const r of payload.records) {
          map.set(r.id, r);
          index.add(r.id, r.haystack);
        }
        indexRef.current = index;
        byIdRef.current = map;
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, ready, error]);

  const search = React.useCallback((query: string, limit = 25): CommandRecord[] => {
    const index = indexRef.current;
    const map = byIdRef.current;
    if (!index || !query.trim()) return [];
    const ids = index.search(query, limit);
    const out: CommandRecord[] = [];
    for (const id of ids) {
      const rec = map.get(String(id));
      if (rec) out.push(rec);
    }
    return out;
  }, []);

  return {
    ready,
    error,
    search,
    size: byIdRef.current.size,
  };
}
