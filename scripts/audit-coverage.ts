// Stage 6.P3.5 — Coverage audit script.
//
// Walks every page.tsx under both app shells, extracts the route plus
// imports, cross-references with the lib + features tree to detect
// Create/Edit/Delete/Archive capability, cross-references with tests
// to detect coverage, and emits a JSON inventory at
// tmp/coverage-audit.json.
//
// Pure read — no DB, no network. Run with:
//   npx tsx scripts/audit-coverage.ts

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");
const LIB_ROOT = join(ROOT, "src", "lib");
const FEATURES_ROOT = join(ROOT, "src", "features");
const TESTS_ROOT = join(ROOT, "tests");
const OUT_DIR = join(ROOT, "tmp");
const OUT_FILE = join(OUT_DIR, "coverage-audit.json");

// ---------------------------------------------------------------------------
// Walk pages
// ---------------------------------------------------------------------------

interface PageEntry {
  /** route as the user would type it, e.g. /dashboard/villas */
  route: string;
  /** path relative to repo root */
  pageFile: string;
  /** parent app shell — "(dashboard)" or "(development-app)" or other */
  appShell: string;
  /** depth of the route — used to detect index vs detail pages */
  depth: number;
}

function walkDir(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walkDir(full, out);
    } else if (e === "page.tsx" || e === "page.ts") {
      out.push(full);
    }
  }
}

function pageFilesToRoutes(files: string[]): PageEntry[] {
  return files
    .map((f) => {
      const rel = relative(APP_ROOT, f);
      const parts = rel.split(sep);
      // First segment is the app shell e.g. "(dashboard)".
      const appShell = parts[0];
      // Strip the page filename + drop route-group segments (parens).
      const routeParts = parts
        .slice(0, -1)
        .filter((p) => !(p.startsWith("(") && p.endsWith(")")));
      const route = "/" + routeParts.join("/");
      return {
        route,
        pageFile: relative(ROOT, f),
        appShell,
        depth: routeParts.length,
      };
    })
    .filter((p) => p.appShell.startsWith("(") && p.appShell.endsWith(")"));
}

// ---------------------------------------------------------------------------
// Walk action files (server actions + queries)
// ---------------------------------------------------------------------------

interface ActionInventory {
  /** Path relative to repo. */
  file: string;
  /** Does the file open with "use server"? */
  isServerAction: boolean;
  /** Names of exported async functions. */
  exports: string[];
  /** Heuristic flags. */
  hasInsert: boolean;
  hasUpdate: boolean;
  hasDelete: boolean;
}

function listFilesRecursive(dir: string, predicate: (name: string) => boolean): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...listFilesRecursive(full, predicate));
    } else if (predicate(e)) {
      out.push(full);
    }
  }
  return out;
}

function collectActionInventory(): ActionInventory[] {
  const files = [
    ...listFilesRecursive(LIB_ROOT, (n) => n.endsWith(".ts")),
    ...listFilesRecursive(FEATURES_ROOT, (n) => n.endsWith(".ts")),
  ];
  const out: ActionInventory[] = [];
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const isServerAction = /^"use server";/m.test(src);
    const exportMatches =
      [...src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(
        (m) => m[1],
      ) ?? [];
    out.push({
      file: relative(ROOT, f),
      isServerAction,
      exports: exportMatches,
      hasInsert: /db\.insert\(/.test(src),
      hasUpdate: /db\.update\(/.test(src),
      hasDelete: /db\.delete\(/.test(src) || /\.set\(\{[^}]*archived/.test(src),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Walk tests
// ---------------------------------------------------------------------------

interface TestInventory {
  file: string;
  body: string;
}

function collectTestInventory(): TestInventory[] {
  const files = listFilesRecursive(TESTS_ROOT, (n) =>
    n.endsWith(".test.ts"),
  );
  return files.map((f) => ({
    file: relative(ROOT, f),
    body: (() => {
      try {
        return readFileSync(f, "utf8");
      } catch {
        return "";
      }
    })(),
  }));
}

// ---------------------------------------------------------------------------
// Per-page analysis
// ---------------------------------------------------------------------------

interface PageAnalysis {
  route: string;
  pageFile: string;
  appShell: string;
  depth: number;
  /** Page imports (heuristic — first 60 lines). */
  imports: string[];
  /** When the page imports a server-action module, list it. */
  importsActionsFrom: string[];
  /** When the page imports queries (read-only data fetch), list it. */
  importsQueriesFrom: string[];
  /** Has a list-type read (table, listX query, etc.). */
  hasReadShape: boolean;
  /** Has a "Create" / "Add" / "New" button or form action wired in. */
  hasCreateUi: boolean;
  /** Has an "Edit" / "Update" affordance wired in. */
  hasEditUi: boolean;
  /** Has a "Delete" / "Archive" affordance wired in. */
  hasDeleteUi: boolean;
  /** Number of `<form action={` occurrences (Next.js form actions). */
  formActionCount: number;
  /** Imports that look like action functions (heuristic). */
  importedActionNames: string[];
  /** Tests that mention this page file or route. */
  testRefs: string[];
  /** A sibling /new page exists at this route (signals Create flow). */
  hasNewSubRoute: boolean;
  /** A sibling /[id] page exists at this route (signals detail view). */
  hasDetailSubRoute: boolean;
  /** A sibling /[id]/edit page exists at this route (signals Edit flow). */
  hasEditSubRoute: boolean;
  /** Page renders MetricCard / Suspense but no Table / list — almost
   *  certainly a dashboard or metrics hub. Used to relax "read-only"
   *  classification (a dashboard is read-only by design). */
  isDashboardLike: boolean;
}

function analyzePage(
  page: PageEntry,
  actionInventory: ActionInventory[],
  testInventory: TestInventory[],
  pageRouteSet: Set<string>,
): PageAnalysis {
  let src: string;
  try {
    src = readFileSync(join(ROOT, page.pageFile), "utf8");
  } catch {
    src = "";
  }

  const head = src.slice(0, 6000);

  const importMatches = [
    ...head.matchAll(/^import[\s\S]+?from\s+["']([^"']+)["']/gm),
  ];
  const imports = importMatches.map((m) => m[1]);

  const importsActionsFrom = imports.filter(
    (i) => /actions(\.|$)|\/actions$/.test(i) || /server-actions/.test(i),
  );
  const importsQueriesFrom = imports.filter((i) => /queries$/.test(i));

  // Pull symbol-level imports — used to flag "createX" / "updateX" /
  // "archiveX" affordances surfaced from server-action modules.
  const symbolImportMatches = [
    ...head.matchAll(/import\s*\{([^}]+)\}\s*from/g),
  ];
  const importedSymbols = symbolImportMatches.flatMap((m) =>
    m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const importedActionNames = importedSymbols.filter((n) =>
    /^(create|add|update|edit|delete|archive|set|run|sync|toggle|approve|reject|close|reopen|assign|unassign|match|unmatch|ignore|cancel|refund|send|fire|publish|push|import|export|generate|process|recompute|rebuild)/i.test(
      n,
    ),
  );

  const formActionCount = (src.match(/<form\s+action=\{/g) ?? []).length;

  // Routing-derived affordances — Next.js convention pages.
  // - parent has a /new sibling → operator can Create
  // - parent has a /[id] dynamic sibling → operator can drill in
  // - parent has a /[id]/edit dynamic sibling → operator can Edit
  // We only evaluate these for index-style routes (not dynamic segments).
  const hasNewSubRoute = pageRouteSet.has(`${page.route}/new`);
  // For "has detail sub-route", we look for any sibling that begins with
  // page.route + "/[" — i.e. a Next dynamic segment. Since we already
  // strip the segment to its concrete route name during walk, dynamic
  // routes show up as "/foo/[id]" in the route list.
  const detailPattern = new RegExp(
    `^${page.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\[[^/]+\\]$`,
  );
  const editPattern = new RegExp(
    `^${page.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\[[^/]+\\]/edit$`,
  );
  let hasDetailSubRoute = false;
  let hasEditSubRoute = false;
  for (const r of pageRouteSet) {
    if (!hasDetailSubRoute && detailPattern.test(r)) hasDetailSubRoute = true;
    if (!hasEditSubRoute && editPattern.test(r)) hasEditSubRoute = true;
    if (hasDetailSubRoute && hasEditSubRoute) break;
  }

  // Combined affordance detection.
  // Create: imported create-style action OR sibling /new page OR a form
  //   action wired in.
  // Edit: imported update-style action OR sibling /[id]/edit page.
  // Delete: imported delete/archive-style action.
  const hasImportedCreate = importedActionNames.some((n) =>
    /^(create|add)/i.test(n),
  );
  const hasImportedEdit = importedActionNames.some((n) =>
    /^(update|edit|set|toggle|assign|approve|reject|reopen|close|match|unmatch|publish)/i.test(
      n,
    ),
  );
  const hasImportedDelete = importedActionNames.some((n) =>
    /^(archive|delete|remove|ignore|cancel)/i.test(n),
  );

  // Workflow-verb actions (approve/reject/process/match/...) — when
  // present they signal a workflow page where the operator's
  // affordance is a domain-specific verb rather than generic
  // Create/Edit/Delete. We surface this as "edit-style affordance"
  // because reconciliation, hold-approval, etc. all mutate state.
  const hasWorkflowAction = importedActionNames.some((n) =>
    /^(approve|reject|process|run|sync|match|reconcile|publish|push|fire|send|generate|recompute|rebuild|complete|finish|finalize|close|reopen|toggle|assign)/i.test(
      n,
    ),
  );

  // Client-component mount that almost certainly carries affordances.
  // Heuristic: a JSX tag whose name ends with one of these suffixes
  // and the page imports a same-named module from `@/components/...`.
  const componentMountMatches = [
    ...src.matchAll(
      /<(\w*(?:Modal|Form|Editor|Composer|Inbox|Wizard|Manager|Dialog|Picker|Builder|Drawer|Panel|Console|Workspace))\b/g,
    ),
  ];
  const componentMountSuggestsAffordance = componentMountMatches.length > 0;

  const hasCreateUi =
    hasImportedCreate ||
    hasNewSubRoute ||
    (formActionCount > 0 && /create|Add|>New/.test(src));
  const hasEditUi =
    hasImportedEdit ||
    hasEditSubRoute ||
    hasWorkflowAction ||
    componentMountSuggestsAffordance;
  const hasDeleteUi = hasImportedDelete;

  // Dashboard / metrics-hub heuristic: MetricCard rendered AND no
  // Table / DataTable rendered. These pages are read-only by
  // design — the operator goes to a sub-route to mutate.
  const rendersMetric = /<MetricCard\b/.test(src);
  const rendersTable = /<Table\b|<DataTable\b/.test(src);
  const isDashboardLike = rendersMetric && !rendersTable;

  // Read-shape: any of these signal the page actually fetches data.
  //  - direct DB call (getDb/requireDb/.from/.select)
  //  - imports from a queries.ts / services.ts / queries-* module
  //  - renders a Table/DataTable/EmptyState
  //  - awaits any function call inside the component body (top-level await
  //    is the Next.js Server Component data-fetch idiom)
  //  - Suspense fallback (signals async data fetch)
  const importsServiceLayer = imports.some((i) =>
    /\/(services|queries|data)$|\/(services|queries|data)\b/.test(i),
  );
  const hasReadShape =
    /\bgetDb\(\)|requireDb\(\)|\.from\(|\.select\(/.test(src) ||
    importsQueriesFrom.length > 0 ||
    importsServiceLayer ||
    /<Table\b|<DataTable\b|<EmptyState\b|<Section\b|<Suspense\b|<MetricCard\b/.test(
      src,
    ) ||
    /\bawait\s+\w+\(/.test(src);

  // Tests touching this page — by route OR by pagefile path.
  const routeNeedle = page.route.split("/").filter(Boolean).join("/");
  const testRefs = testInventory
    .filter(
      (t) =>
        (routeNeedle && t.body.includes(routeNeedle)) ||
        t.body.includes(page.pageFile),
    )
    .map((t) => t.file);

  return {
    hasNewSubRoute,
    hasDetailSubRoute,
    hasEditSubRoute,
    isDashboardLike,
    route: page.route,
    pageFile: page.pageFile,
    appShell: page.appShell,
    depth: page.depth,
    imports,
    importsActionsFrom,
    importsQueriesFrom,
    hasReadShape,
    hasCreateUi,
    hasEditUi,
    hasDeleteUi,
    formActionCount,
    importedActionNames,
    testRefs,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const pageFiles: string[] = [];
  walkDir(APP_ROOT, pageFiles);
  const pages = pageFilesToRoutes(pageFiles);
  pages.sort((a, b) => a.route.localeCompare(b.route));

  const actionInventory = collectActionInventory();
  const testInventory = collectTestInventory();

  const pageRouteSet = new Set<string>(pages.map((p) => p.route));
  const pageAnalyses = pages.map((p) =>
    analyzePage(p, actionInventory, testInventory, pageRouteSet),
  );

  // Aggregate per app-shell summary.
  const byShell = new Map<string, number>();
  for (const p of pages) {
    byShell.set(p.appShell, (byShell.get(p.appShell) ?? 0) + 1);
  }

  // Action-action stats.
  const totalActions = actionInventory.reduce(
    (acc, a) => acc + a.exports.length,
    0,
  );
  const writeActions = actionInventory.filter(
    (a) => a.hasInsert || a.hasUpdate,
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      pages: pages.length,
      perAppShell: Array.from(byShell.entries()),
      actionFiles: actionInventory.length,
      totalActionExports: totalActions,
      filesWithWriteOps: writeActions,
      testFiles: testInventory.length,
    },
    pages: pageAnalyses,
    actionFiles: actionInventory,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  console.log(
    `audit: wrote ${pages.length} page analyses + ${actionInventory.length} action files + ${testInventory.length} test files → ${relative(ROOT, OUT_FILE)}`,
  );
  console.log(`pages by app shell:`);
  for (const [shell, n] of byShell) {
    console.log(`  ${shell}: ${n}`);
  }
}

main();
