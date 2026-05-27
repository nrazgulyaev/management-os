/**
 * Phase 2.1 PR 2 — URL state helpers for list pages.
 *
 * Filters serialize as `?key=v1,v2` (multi-select via comma). Sort
 * uses `?sort=col:dir,col2:dir2`. Page + per-page use `?page=` and
 * `?per=`. Single source of truth so list pages can produce stable
 * deep-links and back/forward navigation just works.
 *
 * Server pages call `parseFilters(searchParams)` for SSR; client
 * `FilterBar` rewrites via `useRouter().replace(..., { scroll: false })`
 * with `serializeFilters(active)`.
 */

export interface ActiveFilter {
  /** Key matches a `FilterDef.key`. */
  key: string;
  /** Selected values. Single value → `[value]`; multi-select keeps
   *  all in one chip. Empty → filter inactive. */
  values: string[];
}

export interface SortSpec {
  column: string;
  direction: "asc" | "desc";
}

const RESERVED = new Set(["page", "per", "sort", "view", "q"]);

/** Build a clean URLSearchParams from active filters. Existing
 *  `URLSearchParams` is mutated only via the returned value. */
export function serializeFilters(
  active: ActiveFilter[],
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? "");
  // Remove all filter keys (preserve reserved page/per/sort/etc).
  for (const key of Array.from(params.keys())) {
    if (RESERVED.has(key)) continue;
    params.delete(key);
  }
  for (const filter of active) {
    if (filter.values.length === 0) continue;
    params.set(filter.key, filter.values.join(","));
  }
  return params;
}

/** Reverse of `serializeFilters`. Caller supplies the known filter
 *  keys; unknown keys are ignored to keep deep-link surface small. */
export function parseFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  knownKeys: readonly string[],
): ActiveFilter[] {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    if (Array.isArray(v)) return v.join(",");
    return v;
  };
  const out: ActiveFilter[] = [];
  for (const key of knownKeys) {
    const raw = get(key);
    if (!raw) continue;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) continue;
    out.push({ key, values });
  }
  return out;
}

export function serializeSort(sort: SortSpec[]): string {
  return sort.map((s) => `${s.column}:${s.direction}`).join(",");
}

export function parseSort(raw: string | null | undefined): SortSpec[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tok) => tok.trim())
    .filter(Boolean)
    .map((tok) => {
      const [column, dir] = tok.split(":");
      const direction = dir === "asc" || dir === "desc" ? dir : "asc";
      return { column, direction } satisfies SortSpec;
    });
}

export function parseSearch(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): string {
  if (params instanceof URLSearchParams) return params.get("q") ?? "";
  const v = params.q;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}
