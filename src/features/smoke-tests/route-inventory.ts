/**
 * Prompt 114 — Route smoke-test inventory.
 *
 * Walks `src/app/**` to enumerate every page and route handler the
 * Next.js App Router would expose.  No live HTTP — this is purely a
 * static scan that yields a typed `RouteEntry[]` describing the
 * audience, gate, expected status (best-effort), and whether the route
 * is parameterised.
 *
 * Used by `scripts/smoke-routes.ts` (CLI report) and by the
 * P114 test suite (regression guard against accidental route deletion
 * or audience misclassification).
 *
 * This module imports nothing from `next/` or the DB so it is safe to
 * call from tests and from CI without a live environment.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type RouteAudience =
  | "public"
  | "auth"
  | "internal"
  | "owner"
  | "guest"
  | "field"
  | "vendor"
  | "development"
  | "api-public"
  | "api-internal"
  | "api-cron"
  | "api-token";

export type RouteKind = "page" | "route";

export interface RouteEntry {
  /** App-router URL path (with `:param` placeholders for dynamic segments). */
  path: string;
  /** Filesystem path relative to `src/app` for cross-referencing. */
  file: string;
  /** Whether the file is a `page.tsx` or `route.ts`. */
  kind: RouteKind;
  /** Coarse audience derived from the route group / segment. */
  audience: RouteAudience;
  /** True if the path contains `[...]` segments. */
  parameterised: boolean;
  /** Expected HTTP status when fetched without a session (best-effort). */
  expectedStatus:
    | "200"
    | "302" // redirect to login
    | "401"
    | "403"
    | "404"
    | "200_or_404"; // depends on whether the param resolves
  /** Short human description. */
  description: string;
}

const ROUTE_GROUP_RE = /\([^)]+\)/g;

function stripRouteGroups(p: string): string {
  return p.replace(ROUTE_GROUP_RE, "").replace(/\/+/g, "/");
}

function normaliseDynamic(segment: string): string {
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    return `*${segment.slice(4, -1)}`;
  }
  if (segment.startsWith("[[...") && segment.endsWith("]]")) {
    return `**${segment.slice(5, -2)}`;
  }
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

function classifyAudience(file: string): RouteAudience {
  const norm = file.replaceAll(sep, "/");
  if (norm.includes("/api/cron/")) return "api-cron";
  if (norm.includes("/api/v1/holds/") || norm.includes("/api/v1/quote"))
    return "api-public";
  if (norm.includes("/(auth)/")) return "auth";
  if (norm.includes("/(public)/")) return "public";
  if (norm.includes("/(owner)/")) return "owner";
  if (norm.includes("/(guest)/")) return "guest";
  if (norm.includes("/(field)/")) return "field";
  if (norm.includes("/(vendor)/")) return "vendor";
  if (norm.includes("/(development-app)/")) return "development";
  if (norm.includes("/(dashboard)/")) return "internal";
  if (norm.includes("/api/")) return "api-internal";
  // Streams that consume tokens (e.g. requests/[code]/stream)
  if (norm.includes("/[token]/") || norm.includes("/[code]/"))
    return "api-token";
  return "internal";
}

function expectedStatusFor(audience: RouteAudience, parameterised: boolean):
  RouteEntry["expectedStatus"] {
  switch (audience) {
    case "public":
      return parameterised ? "200_or_404" : "200";
    case "auth":
      return "200";
    case "internal":
    case "development":
      return "302";
    case "owner":
      return "302";
    case "guest":
      return parameterised ? "200_or_404" : "200";
    case "field":
      return "302";
    case "vendor":
      return "200_or_404";
    case "api-public":
      return "200_or_404";
    case "api-cron":
      return "401";
    case "api-internal":
      return "401";
    case "api-token":
      return "200_or_404";
  }
}

function describeRoute(audience: RouteAudience, urlPath: string): string {
  switch (audience) {
    case "public":
      return `Public marketing or hold-flow page at ${urlPath}`;
    case "auth":
      return `Auth flow at ${urlPath}`;
    case "internal":
      return `Internal admin/operator surface at ${urlPath}`;
    case "owner":
      return `Owner-portal page at ${urlPath}`;
    case "guest":
      return `Guest token-gated page at ${urlPath}`;
    case "field":
      return `Field-staff portal at ${urlPath}`;
    case "vendor":
      return `Vendor token-gated page at ${urlPath}`;
    case "development":
      return `Development OS surface at ${urlPath}`;
    case "api-public":
      return `Public API endpoint at ${urlPath}`;
    case "api-cron":
      return `Cron endpoint (Bearer-secret gated) at ${urlPath}`;
    case "api-internal":
      return `Internal API endpoint at ${urlPath}`;
    case "api-token":
      return `Token-scoped API endpoint at ${urlPath}`;
  }
}

function walk(dir: string, accumulator: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, accumulator);
    } else if (
      s.isFile() &&
      (name === "page.tsx" || name === "route.ts")
    ) {
      accumulator.push(full);
    }
  }
}

/**
 * Walk `appDir` (defaults to `src/app` relative to repo root) and yield
 * a `RouteEntry` for every page / route handler.  Pure: never imports
 * the DB or env.
 */
export function discoverRoutes(appDir: string): RouteEntry[] {
  const files: string[] = [];
  walk(appDir, files);
  files.sort();

  const out: RouteEntry[] = [];

  for (const file of files) {
    const rel = relative(appDir, file).replaceAll(sep, "/");
    const dir = rel.replace(/\/(page\.tsx|route\.ts)$/, "");
    const isPage = rel.endsWith("/page.tsx") || rel === "page.tsx";
    const kind: RouteKind = isPage ? "page" : "route";

    const segments = dir
      .split("/")
      .filter((s) => s.length > 0)
      .map(normaliseDynamic);

    const cleaned = stripRouteGroups("/" + segments.join("/")).replace(
      /\/+$/,
      "",
    );
    const urlPath = cleaned === "" ? "/" : cleaned;
    const parameterised = /[:\\*]/.test(urlPath);
    const audience = classifyAudience("/" + rel);
    const expectedStatus = expectedStatusFor(audience, parameterised);

    out.push({
      path: urlPath,
      file: rel,
      kind,
      audience,
      parameterised,
      expectedStatus,
      description: describeRoute(audience, urlPath),
    });
  }

  return out;
}

export interface AudienceBreakdown {
  audience: RouteAudience;
  count: number;
}

export function summariseByAudience(routes: RouteEntry[]): AudienceBreakdown[] {
  const counts = new Map<RouteAudience, number>();
  for (const r of routes) {
    counts.set(r.audience, (counts.get(r.audience) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([audience, count]) => ({ audience, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Quick predicate: is this route something the smoke runner can `GET`
 * with no session and reasonably expect a 2xx/3xx/401/404 (i.e. not a
 * mutation-only route or a stream)?
 */
export function isFetchable(entry: RouteEntry): boolean {
  if (entry.kind === "page") return true;
  // route.ts handlers — only a subset implement GET.  Keep the heuristic
  // conservative: cron + token-bearer endpoints + holds are fetchable
  // (they will return 401/404 without auth).
  return (
    entry.audience === "api-cron" ||
    entry.audience === "api-public" ||
    entry.audience === "api-token"
  );
}
