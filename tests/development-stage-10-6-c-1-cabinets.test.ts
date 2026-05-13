/**
 * Stage 10.6 / Phase 10.6.C.1.2-.5 — Cabinet polish acceptance.
 *
 * 9 cabinet pages (1 Mgmt OS + 8 Dev OS) must each:
 *   - import CabinetGreetingBlock from the primitives barrel
 *   - render <CabinetGreetingBlock> with `firstName` (resolved from
 *     getCurrentAppUser server-side) and an `eyebrow`
 *   - render <PageHeaderHero> below the greeting (existing primitive
 *     stays — eyebrow drops the role label since the greeting block
 *     covers it)
 *   - render at least ONE <DashboardKpi variant="hero" tone="..."> as
 *     the primary KPI (gradient background, 56-64pt value)
 *
 * The `tone` choice is per-cabinet (emerald / gold / coral / ink-deep)
 * to match the role's primary metric semantics.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

interface CabinetSpec {
  name: string;
  path: string;
  expectedTone: "emerald-soft" | "gold-soft" | "coral-soft" | "ink-deep";
}

const CABINETS: CabinetSpec[] = [
  {
    name: "Owner",
    path: "src/app/(dashboard)/dashboard/owner/page.tsx",
    expectedTone: "emerald-soft",
  },
  {
    name: "Front Office",
    path: "src/app/(dashboard)/dashboard/front-office/page.tsx",
    expectedTone: "coral-soft",
  },
  {
    name: "CFO / Accountant",
    path: "src/app/(development-app)/development-os/cabinets/cfo-accountant/page.tsx",
    expectedTone: "ink-deep",
  },
  {
    name: "Project Manager",
    path: "src/app/(development-app)/development-os/cabinets/project-manager/page.tsx",
    expectedTone: "emerald-soft",
  },
  {
    name: "Site Supervisor",
    path: "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx",
    expectedTone: "gold-soft",
  },
  {
    name: "QS",
    path: "src/app/(development-app)/development-os/cabinets/qs/page.tsx",
    expectedTone: "emerald-soft",
  },
  {
    name: "Procurement Manager",
    path: "src/app/(development-app)/development-os/cabinets/procurement-manager/page.tsx",
    expectedTone: "coral-soft",
  },
  {
    name: "Marketing Staff",
    path: "src/app/(development-app)/development-os/cabinets/marketing-staff/page.tsx",
    expectedTone: "gold-soft",
  },
  {
    name: "Sales Manager",
    path: "src/app/(development-app)/development-os/cabinets/sales-manager/page.tsx",
    expectedTone: "emerald-soft",
  },
  {
    name: "Warehouse Manager",
    path: "src/app/(development-app)/development-os/cabinets/warehouse-manager/page.tsx",
    expectedTone: "ink-deep",
  },
];

for (const cab of CABINETS) {
  test(`10.6.C.1 — ${cab.name} imports CabinetGreetingBlock`, () => {
    const src = read(cab.path);
    assert.match(src, /CabinetGreetingBlock/);
  });

  test(`10.6.C.1 — ${cab.name} renders <CabinetGreetingBlock firstName={...}>`, () => {
    const src = read(cab.path);
    // Must render the greeting with the resolved firstName binding
    assert.match(
      src,
      /<CabinetGreetingBlock[\s\S]{0,400}firstName=\{firstName\}/,
    );
    // And include an eyebrow (cabinet identity)
    assert.match(
      src,
      /<CabinetGreetingBlock[\s\S]{0,500}eyebrow=/,
    );
  });

  test(`10.6.C.1 — ${cab.name} renders one hero KPI with tone="${cab.expectedTone}"`, () => {
    const src = read(cab.path);
    assert.match(src, /variant="hero"/);
    assert.match(src, new RegExp(`tone="${cab.expectedTone}"`));
  });

  test(`10.6.C.1 — ${cab.name} keeps PageHeaderHero (greeting block layered above)`, () => {
    const src = read(cab.path);
    // Both primitives present — greeting + hero header
    assert.match(src, /<PageHeaderHero/);
  });
}
