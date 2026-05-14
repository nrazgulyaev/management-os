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
  expectedTone: "emerald-soft" | "gold-soft" | "coral-soft" | "ink-deep" | "none";
  /**
   * Sprint 4 — set true for cabinets that replaced the 10.6.C.1
   * CabinetGreetingBlock + PageHeaderHero stack with
   * <HeroGreetingAI>. Implies the cabinet ships <HeroGreetingAI>;
   * `expectedTone` is still asserted unless it's "none".
   */
  sprint4Hero?: boolean;
  /**
   * Mega-Sprint — set true for cabinets that ALSO replaced their
   * `variant="hero"` DashboardKpi with a <KpiRowMixed> row. Sets
   * `expectedTone="none"` implicitly — the hero-tone check is
   * skipped and a <KpiRowMixed> presence check runs instead.
   */
  kpiRowMixed?: boolean;
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
    // Sprint 4 replaced the CabinetGreetingBlock + PageHeaderHero
    // stack with the new <HeroGreetingAI> primitive. The hero KPI
    // (variant="hero" + tone="ink-deep") is preserved further down
    // the page; the 10.6.C.1 greeting/header assertions don't apply.
    sprint4Hero: true,
  },
  {
    name: "Project Manager",
    path: "src/app/(development-app)/development-os/cabinets/project-manager/page.tsx",
    expectedTone: "emerald-soft",
  },
  {
    name: "Site Supervisor",
    path: "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx",
    // Mega-Sprint Phase 1 replaced the CabinetGreetingBlock +
    // PageHeaderHero stack with <HeroGreetingAI>. Hero KPI tone now
    // lives on KpiRowMixed (default emerald-solid); the cabinet's
    // historical gold-soft hero KPI was retired.
    expectedTone: "none",
    sprint4Hero: true,
    kpiRowMixed: true,
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
    // Mega-Sprint Phase 2 replaced the CabinetGreetingBlock +
    // PageHeaderHero stack with <HeroGreetingAI> and swapped the
    // hero KPI for a <KpiRowMixed>. LeadFunnelChart anchors the
    // pipeline section below the KPIs.
    expectedTone: "none",
    sprint4Hero: true,
    kpiRowMixed: true,
  },
  {
    name: "Warehouse Manager",
    path: "src/app/(development-app)/development-os/cabinets/warehouse-manager/page.tsx",
    expectedTone: "ink-deep",
  },
];

for (const cab of CABINETS) {
  if (cab.sprint4Hero) {
    // Sprint-4 cabinets use HeroGreetingAI in place of the
    // CabinetGreetingBlock + PageHeaderHero stack. The hero-KPI tone
    // check below still applies (those KPIs survive Sprint 4).
    test(`10.6.C.1 — ${cab.name} uses Sprint-4 HeroGreetingAI (replaces greeting + header stack)`, () => {
      const src = read(cab.path);
      assert.match(src, /<HeroGreetingAI/);
      assert.doesNotMatch(src, /<CabinetGreetingBlock/);
      assert.doesNotMatch(src, /<PageHeaderHero/);
    });
  } else {
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

    test(`10.6.C.1 — ${cab.name} keeps PageHeaderHero (greeting block layered above)`, () => {
      const src = read(cab.path);
      // Both primitives present — greeting + hero header
      assert.match(src, /<PageHeaderHero/);
    });
  }

  if (cab.kpiRowMixed) {
    test(`mega-sprint — ${cab.name} renders a <KpiRowMixed> in place of a DashboardKpi hero variant`, () => {
      const src = read(cab.path);
      assert.match(src, /<KpiRowMixed/);
    });
  } else if (cab.expectedTone !== "none") {
    test(`10.6.C.1 — ${cab.name} renders one hero KPI with tone="${cab.expectedTone}"`, () => {
      const src = read(cab.path);
      assert.match(src, /variant="hero"/);
      assert.match(src, new RegExp(`tone="${cab.expectedTone}"`));
    });
  }
}
