/**
 * Workspace separation regression — Stage 2.1.
 *
 * The Development OS and Management OS must remain structurally independent:
 * neither workspace's nav config may leak entries into the other, and the
 * route groups must continue to live in different App Router groups.
 *
 * Pure data + filesystem checks; no Next.js runtime needed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

test("dashboardNav contains zero /development-os/ routes", async () => {
  const { dashboardNav } = await import("../src/config/navigation");
  for (const group of dashboardNav) {
    for (const item of group.items) {
      assert.ok(
        !item.href.startsWith("/development-os"),
        `Management OS sidebar leaked Development OS route: ${item.href}`,
      );
    }
  }
});

test("dashboardNav contains zero /development entries except where intended", async () => {
  // Management OS sidebar must not link into the public /development page or
  // the /development-os workspace.
  const { dashboardNav } = await import("../src/config/navigation");
  for (const group of dashboardNav) {
    for (const item of group.items) {
      assert.ok(
        item.href !== "/development",
        `Management OS sidebar must not link to public /development page directly: ${item.href}`,
      );
    }
  }
});

test("developmentAppNav contains all Stage 2.1 routes", async () => {
  const { developmentAppNav } = await import(
    "../src/lib/development/navigation"
  );
  const flat = developmentAppNav.flatMap((g) => g.items.map((i) => i.href));
  const required = [
    "/development-os",
    "/development-os/projects",
    "/development-os/site-reports",
    "/development-os/sales",
    "/development-os/finance",
    "/development-os/investors",
  ];
  for (const r of required) {
    assert.ok(
      flat.includes(r),
      `Development OS sidebar missing required route: ${r}`,
    );
  }
});

test("developmentAppNav routes all start with /development-os", async () => {
  const { developmentAppNav } = await import(
    "../src/lib/development/navigation"
  );
  for (const group of developmentAppNav) {
    for (const item of group.items) {
      assert.ok(
        item.href.startsWith("/development-os"),
        `Development OS sidebar contains non-workspace route: ${item.href}`,
      );
    }
  }
});

test("marketingNav links to public /products/development-os page (Stage 10.I.3 reshape)", async () => {
  const { marketingNav } = await import("../src/config/navigation");
  const labels = marketingNav.map((i) => i.href);
  assert.ok(
    labels.includes("/products/development-os"),
    "Marketing nav must link to the public /products/development-os page",
  );
  assert.ok(
    !labels.includes("/development-os"),
    "Marketing nav must NOT expose the internal /development-os workspace",
  );
});

test("App Router route groups exist for both workspaces", () => {
  const root = resolve(process.cwd(), "src/app");
  assert.ok(
    existsSync(resolve(root, "(dashboard)/layout.tsx")),
    "Management OS dashboard route group must exist",
  );
  assert.ok(
    existsSync(resolve(root, "(development-app)/layout.tsx")),
    "Development OS workspace route group must exist",
  );
  assert.ok(
    existsSync(resolve(root, "(public)/products/development-os/page.tsx")),
    "Public Development OS marketing page must exist (Stage 10.I.3 — moved from /development to /products/development-os)",
  );
});

test("Stage 2.1 schema file exports all five entities", async () => {
  const schema = await import("../src/lib/db/schema/development");
  for (const key of [
    "developmentProjectMeta",
    "projectPhases",
    "landPlots",
    "unitTypes",
    "unitDevelopmentMeta",
  ]) {
    assert.ok(
      key in schema,
      `Stage 2.1 schema must export ${key}`,
    );
  }
});

test("Stage 2.1 migration file exists with the five table creates", async () => {
  const path = resolve(
    process.cwd(),
    "drizzle/0034_development_os_stage_2_1.sql",
  );
  assert.ok(existsSync(path), "Migration 0034 must exist");
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(path, "utf8");
  for (const tbl of [
    "development_project_meta",
    "project_phases",
    "land_plots",
    "unit_types",
    "unit_development_meta",
  ]) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS "${tbl}"`),
      `Migration must create ${tbl}`,
    );
  }
});

test("WorkspaceSwitcher knows about both workspaces", async () => {
  // Static-source check: the WorkspaceSwitcher source file must enumerate
  // both /dashboard and /development-os.
  const path = resolve(
    process.cwd(),
    "src/components/shared/workspace-switcher.tsx",
  );
  assert.ok(existsSync(path), "WorkspaceSwitcher source file must exist");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path, "utf8");
  assert.ok(
    src.includes('href: "/dashboard"'),
    "WorkspaceSwitcher must list the Management OS workspace",
  );
  assert.ok(
    src.includes('href: "/development-os"'),
    "WorkspaceSwitcher must list the Development OS workspace",
  );
});

test("DashboardTopbar mounts the WorkspaceSwitcher", async () => {
  const path = resolve(
    process.cwd(),
    "src/components/layout/dashboard-topbar.tsx",
  );
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path, "utf8");
  assert.ok(
    src.includes("<WorkspaceSwitcher"),
    "Management OS topbar must mount <WorkspaceSwitcher /> so users can switch workspaces from inside the dashboard",
  );
});

test("DevelopmentAppTopbar mounts the WorkspaceSwitcher", async () => {
  const path = resolve(
    process.cwd(),
    "src/components/development/development-app-topbar.tsx",
  );
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path, "utf8");
  assert.ok(
    src.includes("<WorkspaceSwitcher"),
    "Development OS topbar must mount <WorkspaceSwitcher /> so users can switch workspaces from inside the workspace",
  );
});
