#!/usr/bin/env tsx
/**
 * DEMO-2 — Arconique demo seed, part 2.
 *
 * NEVER FOR PRODUCTION USE.
 *
 * Builds on DEMO-1 (projects · vendors · bank accounts · cost
 * categories · transactions · 5 AI agent configs). Adds the entity
 * types needed to bring all 12 cabinets alive with realistic data:
 *
 *   - villas (12)                via projects.ts
 *   - owners + ownership_shares  via ownership.ts
 *   - booking_channels + bookings (~50) via bookings.ts
 *   - investors (8)              via investor-capital.ts
 *   - dev_os_purchase_requests + procurement_quotations + material_purchase_orders + dev_invoices
 *   - site_reports               via site-operations.ts
 *   - dev_os_inventory_items     via dev-os-inventory.ts
 *   - maintenance_templates + maintenance_tickets
 *   - leads                      via marketing.ts
 *   - work_packages + project_tasks via work-packages.ts
 *   - project_risks              via project-memory.ts
 *
 * Skipped (schema-missing or out-of-scope for this sprint):
 *   - site_report_photos         requires `documents` rows (placeholder
 *                                image pipeline not in scope)
 *   - site_report_voice_notes    no dedicated schema (voice transcripts
 *                                live on whatsapp_messages today)
 *   - investor_capital_ledger    requires the wallet/commitment/drawdown/
 *                                distribution cluster — defer to DEMO-3
 *
 *     npm run seed:arconique-demo-2               # insert demo rows
 *     npm run seed:arconique-demo-2 -- --wipe      # remove all DEMO2- rows
 *     npm run seed:arconique-demo-2 -- --org=<id>  # target a specific org
 *
 * Idempotent: re-runs skip rows whose unique code/slug already exists,
 * and wipe deletes only DEMO2- prefixed rows (preserves DEMO-1 data).
 */

import { eq, sql, inArray } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";
import { organizations } from "../src/lib/db/schema/saas";
import { projects, villas } from "../src/lib/db/schema/projects";
import { owners, ownershipShares } from "../src/lib/db/schema/ownership";
import { assetTypes } from "../src/lib/db/schema/asset-types";
import { bookingChannels, bookings } from "../src/lib/db/schema/bookings";
import {
  vendors,
  siteReports,
  materialPurchaseOrders,
} from "../src/lib/db/schema/site-operations";
import { investors } from "../src/lib/db/schema/investor-capital";
import {
  devOsPurchaseRequests,
  procurementQuotations,
} from "../src/lib/db/schema/procurement";
import { devInvoices } from "../src/lib/db/schema/invoices";
import { devOsInventoryItems } from "../src/lib/db/schema/dev-os-inventory";
import { maintenanceTickets } from "../src/lib/db/schema/operations";
import { maintenanceTemplates } from "../src/lib/db/schema/maintenance-intelligence";
import { leads } from "../src/lib/db/schema/marketing";
import { workPackages, projectTasks } from "../src/lib/db/schema/work-packages";
import { projectRisks } from "../src/lib/db/schema/project-memory";
import { appUsers } from "../src/lib/db/schema/identity";

const DEMO_PREFIX = "DEMO2-";

interface SeedOptions {
  wipe: boolean;
  organizationId: string | null;
}

function parseArgs(argv: string[]): SeedOptions {
  const args = argv.slice(2);
  const orgArg = args.find((a) => a.startsWith("--org="));
  return {
    wipe: args.includes("--wipe"),
    organizationId: orgArg ? orgArg.split("=", 2)[1] : null,
  };
}

async function resolveOrgId(
  db: ReturnType<typeof getDb>,
  explicit: string | null,
): Promise<string> {
  if (explicit) return explicit;
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.organizationCode, "ARCONIQUE_DEFAULT"))
    .limit(1);
  if (!row) {
    throw new Error(
      "No ARCONIQUE_DEFAULT organization found. Pass --org=<id> or apply migration 0071.",
    );
  }
  return row.id;
}

function pickDeterministic<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// --- VILLA SPEC ------------------------------------------------------------
// Maps to the 4 villa-style DEMO-1 projects (mexico-villas, japanese-villas,
// views-villas, prime-park-villas). DEMO-1 created projects with slug
// `demo-<key>`.
const VILLA_SPEC: Array<{
  projectSlug: string;
  villas: Array<{ slug: string; name: string; bedrooms: number; rate: number }>;
}> = [
  {
    projectSlug: "demo-mexico-villas",
    villas: [
      { slug: "mexico-1", name: "Mexico Villa 1", bedrooms: 3, rate: 380 },
      { slug: "mexico-2", name: "Mexico Villa 2", bedrooms: 3, rate: 380 },
      { slug: "mexico-3", name: "Mexico Villa 3", bedrooms: 4, rate: 460 },
    ],
  },
  {
    projectSlug: "demo-japanese-villas",
    villas: [
      { slug: "japanese-1", name: "Japanese Villa 1", bedrooms: 2, rate: 320 },
      { slug: "japanese-2", name: "Japanese Villa 2", bedrooms: 2, rate: 320 },
    ],
  },
  {
    projectSlug: "demo-views-villas",
    villas: [
      { slug: "views-1", name: "Views Villa Ocean", bedrooms: 4, rate: 520 },
      { slug: "views-2", name: "Views Villa Sunset", bedrooms: 3, rate: 440 },
      { slug: "views-3", name: "Views Villa Cliff", bedrooms: 4, rate: 560 },
    ],
  },
  {
    projectSlug: "demo-prime-park-villas",
    villas: [
      { slug: "prime-1", name: "Prime Park Villa A", bedrooms: 3, rate: 410 },
      { slug: "prime-2", name: "Prime Park Villa B", bedrooms: 3, rate: 410 },
      { slug: "prime-3", name: "Prime Park Villa C", bedrooms: 4, rate: 490 },
      { slug: "prime-4", name: "Prime Park Villa D", bedrooms: 5, rate: 620 },
    ],
  },
];

const OWNER_SPEC = [
  { name: "Pak Rachmat", legal: "Rachmat Hidayat", nationality: "ID", email: "rachmat@example.com" },
  { name: "Alyaa", legal: "Alyaa Putri", nationality: "ID", email: "alyaa@example.com" },
  { name: "KLNR Holdings", legal: "KLNR Holdings Pte Ltd", nationality: "SG", email: "ops@klnr.example", type: "company" },
  { name: "Made Wirawan", legal: "I Made Wirawan", nationality: "ID", email: "made.w@example.com" },
  { name: "Elena Petrov", legal: "Elena Petrov", nationality: "RU", email: "elena.p@example.com" },
  { name: "Hiroshi Tanaka", legal: "Hiroshi Tanaka", nationality: "JP", email: "hiroshi@example.com" },
  { name: "Wahyu Family Trust", legal: "Wahyu Family Trust", nationality: "ID", email: "trust@wahyu.example", type: "family_office" },
  { name: "Sarah Chen", legal: "Sarah Chen", nationality: "SG", email: "sarah.chen@example.com" },
];

const CHANNEL_SPEC = [
  { key: "airbnb", name: "Airbnb", type: "ota", commission: "15.000" },
  { key: "booking_com", name: "Booking.com", type: "ota", commission: "18.000" },
  { key: "direct", name: "Direct", type: "direct", commission: "0.000" },
  { key: "agoda", name: "Agoda", type: "ota", commission: "16.000" },
  { key: "agent", name: "Travel agent", type: "agent", commission: "12.000" },
];

const CHANNEL_WEIGHTS = [
  { key: "airbnb", weight: 38 },
  { key: "booking_com", weight: 26 },
  { key: "direct", weight: 20 },
  { key: "agoda", weight: 9 },
  { key: "agent", weight: 7 },
];

const GUEST_NAMES = [
  "Liam O'Connor", "Aiko Nakamura", "Mateo Rossi", "Emma Lindqvist",
  "Daniel Cohen", "Mia Volkov", "Lucas Pereira", "Sofia García",
  "Noah Kim", "Yuki Sato", "Hannah Müller", "Ravi Sharma",
  "Olivia Anderson", "Felix Brandt", "Camille Laurent", "Tomás Silva",
  "Ksenia Ivanova", "Diego Hernández", "Chloe Wright", "Aarav Patel",
  "Léa Dubois", "Marcus Webb", "Isabella Costa", "Hannes Olsson",
];

const INVESTOR_SPEC = [
  { code: "INV-GP-ARCONIQUE", name: "Arconique Capital GP", type: "gp", legalType: "llc", currency: "USD", residency: "ID" },
  { code: "INV-RUSSO-FAMILY", name: "Russo Family Office", type: "lp_private", legalType: "trust", currency: "USD", residency: "IT" },
  { code: "INV-ASIAN-BRIDGE", name: "Asian Bridge Capital", type: "lp_institutional", legalType: "pt_pma", currency: "USD", residency: "SG" },
  { code: "INV-PETROV-HOLD", name: "Petrov Holdings", type: "lp_private", legalType: "offshore", currency: "USD", residency: "AE" },
  { code: "INV-SAKURA-LP", name: "Sakura Real Estate LP", type: "lp_institutional", legalType: "llc", currency: "USD", residency: "JP" },
  { code: "INV-LANDOWNER-PURI", name: "Puri Landowner JV", type: "landowner_jv", legalType: "individual", currency: "IDR", residency: "ID" },
  { code: "INV-MERIDIAN", name: "Meridian Wealth Partners", type: "lp_private", legalType: "llc", currency: "USD", residency: "US" },
  { code: "INV-OCEAN-CAP", name: "Ocean Capital Pte", type: "lp_institutional", legalType: "pt_pma", currency: "USD", residency: "SG" },
];

// category enum: ac|pool|pest_control|garden|pump|water_system|electrical|
// smart_lock|wifi|roof|drainage|fire_safety|general
const MAINT_TEMPLATES = [
  { key: "pool-weekly", name: "Pool maintenance · weekly", category: "pool", freq: "weekly", days: 7, mins: 60 },
  { key: "ac-quarterly", name: "AC service · quarterly", category: "ac", freq: "quarterly", days: 90, mins: 90 },
  { key: "generator-monthly", name: "Generator check · monthly", category: "electrical", freq: "monthly", days: 30, mins: 45 },
  { key: "garden-weekly", name: "Garden trim · weekly", category: "garden", freq: "weekly", days: 7, mins: 120 },
  { key: "termite-yearly", name: "Termite inspection · yearly", category: "pest_control", freq: "yearly", days: 365, mins: 60 },
  { key: "roof-yearly", name: "Roof inspection · yearly", category: "roof", freq: "yearly", days: 365, mins: 90 },
  { key: "septic-quarterly", name: "Septic tank check · quarterly", category: "drainage", freq: "quarterly", days: 90, mins: 60 },
  { key: "deepclean-monthly", name: "Deep clean · monthly", category: "general", freq: "monthly", days: 30, mins: 180 },
];

const MATERIAL_CATEGORIES = ["cement", "rebar", "tile", "paint", "timber", "fixtures", "electrical", "plumbing"];
const MATERIAL_NAMES = [
  ["Portland cement 50kg", "cement", "bag"],
  ["Premix concrete C25/30 m³", "cement", "m3"],
  ["Mortar mix 40kg", "cement", "bag"],
  ["Rebar 10mm 12m", "rebar", "pc"],
  ["Rebar 12mm 12m", "rebar", "pc"],
  ["Rebar 16mm 12m", "rebar", "pc"],
  ["Tie wire 1.6mm coil", "rebar", "kg"],
  ["Wire mesh 6mm 2x6m", "rebar", "sheet"],
  ["Ceramic tile 30x30 floor", "tile", "m2"],
  ["Porcelain tile 60x60", "tile", "m2"],
  ["Marble Hindari 30x60", "tile", "m2"],
  ["Granite slab 3cm", "tile", "m2"],
  ["Adhesive grout 25kg", "tile", "bag"],
  ["Interior paint white 20L", "paint", "drum"],
  ["Exterior paint terracotta 20L", "paint", "drum"],
  ["Wood stain dark 5L", "paint", "can"],
  ["Primer sealant 20L", "paint", "drum"],
  ["Bengkirai decking 2.5m", "timber", "pc"],
  ["Ulin post 15x15 4m", "timber", "pc"],
  ["Plywood marine 18mm 4x8", "timber", "sheet"],
  ["MDF board 12mm 4x8", "timber", "sheet"],
  ["LED downlight 9W", "electrical", "pc"],
  ["Switch panel 2-gang", "electrical", "pc"],
  ["Cable NYM 3x2.5mm 100m", "electrical", "roll"],
  ["MCB 16A single pole", "electrical", "pc"],
  ["Distribution board 12-way", "electrical", "pc"],
  ["PVC pipe 4\" 6m", "plumbing", "pc"],
  ["PVC pipe 1\" 6m", "plumbing", "pc"],
  ["Ball valve 1/2\"", "plumbing", "pc"],
  ["Toilet suite single flush", "fixtures", "set"],
  ["Basin mixer chrome", "fixtures", "pc"],
  ["Shower head rainfall 200mm", "fixtures", "pc"],
  ["Sink kitchen single bowl", "fixtures", "pc"],
  ["Door handle brushed nickel", "fixtures", "set"],
  ["Hinge pair 100mm", "fixtures", "pair"],
  ["Sliding door track 3m", "fixtures", "pc"],
  ["Window frame ALU 1.2x1.5", "fixtures", "pc"],
  ["Insulation foam 30mm m²", "fixtures", "m2"],
  ["Waterproof membrane 1mm", "fixtures", "m2"],
  ["Geotextile fabric m²", "fixtures", "m2"],
] as const;

const RISK_SPEC = [
  { code: "permit-hold-prime-d", title: "Prime Park D · permit hold", category: "permit_delay", prob: "high", impact: "major", mit: "Liaise with BPN office, prepare revised drawing pack" },
  { code: "marble-fx-drift", title: "Marble Hindari unit cost +18.4%", category: "cost_overrun", prob: "high", impact: "moderate", mit: "Reissue RFQ to alternative vendors" },
  { code: "rebar-leadtime", title: "Rebar lead-time +4 days", category: "supplier_delay", prob: "medium", impact: "moderate", mit: "Qualify backup supplier CV Besi Jaya" },
  { code: "rainy-pour-risk", title: "Wet-season concrete pour risk", category: "weather", prob: "medium", impact: "moderate", mit: "Schedule pours pre-04:30, tarp staging area" },
  { code: "tax-pph23-deadline", title: "PPh 23 withholding · 4 vendor payments in 4d", category: "tax_uncertainty", prob: "high", impact: "minor", mit: "Tax assistant batch-file by Friday" },
];

// --- helpers ---------------------------------------------------------------

function pickWeightedChannel(rng: () => number): string {
  const total = CHANNEL_WEIGHTS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of CHANNEL_WEIGHTS) {
    r -= c.weight;
    if (r <= 0) return c.key;
  }
  return CHANNEL_WEIGHTS[0].key;
}

function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

// --- WIPE ------------------------------------------------------------------

async function wipe(
  db: ReturnType<typeof getDb>,
  organizationId: string,
): Promise<void> {
  console.log("wiping DEMO2- prefixed rows for org", organizationId);
  const counts: Record<string, number> = {};
  const log = (k: string, n: number) => (counts[k] = n);

  // Order matters: delete leaves first, then their parents.
  log(
    "project_tasks",
    (await db
      .delete(projectTasks)
      .where(sql`task_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: projectTasks.id })).length,
  );
  log(
    "work_packages",
    (await db
      .delete(workPackages)
      .where(sql`package_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: workPackages.id })).length,
  );
  log(
    "project_risks",
    (await db
      .delete(projectRisks)
      .where(sql`risk_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: projectRisks.id })).length,
  );
  log(
    "leads",
    (await db
      .delete(leads)
      .where(sql`lead_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: leads.id })).length,
  );
  log(
    "maintenance_tickets",
    (await db
      .delete(maintenanceTickets)
      .where(sql`ticket_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: maintenanceTickets.id })).length,
  );
  log(
    "maintenance_templates",
    (await db
      .delete(maintenanceTemplates)
      .where(sql`key LIKE ${DEMO_PREFIX.toLowerCase() + "%"}`)
      .returning({ id: maintenanceTemplates.id })).length,
  );
  log(
    "dev_os_inventory_items",
    (await db
      .delete(devOsInventoryItems)
      .where(sql`sku LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: devOsInventoryItems.id })).length,
  );
  log(
    "site_reports",
    (await db
      .delete(siteReports)
      .where(sql`notes LIKE ${"[DEMO2]%"}`)
      .returning({ id: siteReports.id })).length,
  );
  log(
    "dev_invoices",
    (await db
      .delete(devInvoices)
      .where(sql`invoice_number LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: devInvoices.id })).length,
  );
  log(
    "procurement_quotations",
    (await db
      .delete(procurementQuotations)
      .where(sql`quotation_number LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: procurementQuotations.id })).length,
  );
  log(
    "material_purchase_orders",
    (await db
      .delete(materialPurchaseOrders)
      .where(sql`po_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: materialPurchaseOrders.id })).length,
  );
  log(
    "dev_os_purchase_requests",
    (await db
      .delete(devOsPurchaseRequests)
      .where(sql`request_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: devOsPurchaseRequests.id })).length,
  );
  log(
    "investors",
    (await db
      .delete(investors)
      .where(sql`investor_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: investors.id })).length,
  );
  log(
    "bookings",
    (await db
      .delete(bookings)
      .where(sql`booking_code LIKE ${DEMO_PREFIX + "%"}`)
      .returning({ id: bookings.id })).length,
  );
  log(
    "booking_channels",
    (await db
      .delete(bookingChannels)
      .where(sql`key LIKE ${DEMO_PREFIX.toLowerCase() + "%"}`)
      .returning({ id: bookingChannels.id })).length,
  );
  log(
    "ownership_shares",
    (await db
      .delete(ownershipShares)
      .where(
        sql`${ownershipShares.villaId} IN (SELECT id FROM villas WHERE slug LIKE ${"demo2-%"})`,
      )
      .returning({ id: ownershipShares.id })).length,
  );
  log(
    "owners",
    (await db
      .delete(owners)
      .where(sql`email LIKE ${"%@example.com"} OR email LIKE ${"%.example"}`)
      .returning({ id: owners.id })).length,
  );
  log(
    "villas",
    (await db
      .delete(villas)
      .where(sql`slug LIKE ${"demo2-%"}`)
      .returning({ id: villas.id })).length,
  );

  for (const [k, n] of Object.entries(counts)) console.log(`  ${k}: ${n}`);
}

// --- SEED ------------------------------------------------------------------

async function seed(
  db: ReturnType<typeof getDb>,
  organizationId: string,
): Promise<void> {
  // Resolve dependencies from DEMO-1 / DB.
  const [villaAsset] = await db
    .select({ id: assetTypes.id })
    .from(assetTypes)
    .where(eq(assetTypes.typeKey, "villa"))
    .limit(1);
  if (!villaAsset) throw new Error("asset_types row for typeKey='villa' not found. Apply migration 0057.");

  const projectRows = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(inArray(projects.slug, VILLA_SPEC.map((v) => v.projectSlug)));
  const projectIdBySlug = new Map(projectRows.map((p) => [p.slug, p.id]));

  // Find any project for FK fallback (procurement / WPs target villa projects).
  const allDemoProjects = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(sql`slug LIKE ${"demo-%"}`);
  if (allDemoProjects.length === 0) {
    throw new Error("No DEMO-1 projects found. Run npm run seed:arconique-demo first.");
  }

  // Resolve vendors seeded by DEMO-1.
  const demoVendors = await db
    .select({ id: vendors.id, code: vendors.vendorCode })
    .from(vendors)
    .where(sql`vendor_code LIKE ${"DEMO-%"} AND organization_id = ${organizationId}`);
  if (demoVendors.length === 0) {
    throw new Error("No DEMO-1 vendors found.");
  }

  // Find any app_user for the org as creator/requester for FK columns.
  const [creator] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.organizationId, organizationId))
    .limit(1);
  // creator may be null in fresh dev DBs — we'll set requested_by to a uuid
  // resolver fallback only where the column is NOT NULL.

  // 1) VILLAS ---------------------------------------------------------------
  console.log("seeding villas...");
  const villaIdBySlug = new Map<string, string>();
  let nVillas = 0;
  let unitCounter = 1;
  for (const spec of VILLA_SPEC) {
    const projectId = projectIdBySlug.get(spec.projectSlug);
    if (!projectId) {
      console.log(`  skip ${spec.projectSlug} (project missing)`);
      continue;
    }
    for (const v of spec.villas) {
      const slug = `demo2-${v.slug}`;
      const existing = await db
        .select({ id: villas.id })
        .from(villas)
        .where(eq(villas.slug, slug))
        .limit(1);
      if (existing[0]) {
        villaIdBySlug.set(v.slug, existing[0].id);
        continue;
      }
      const [row] = await db
        .insert(villas)
        .values({
          projectId,
          slug,
          unitCode: `DEMO2-V${String(unitCounter++).padStart(3, "0")}`,
          name: `[DEMO2] ${v.name}`,
          status: "ready",
          bedrooms: v.bedrooms,
          bathrooms: String(v.bedrooms),
          viewType: pickDeterministic(["ocean", "rice_field", "jungle", "garden"], unitCounter),
          managementModel: "individual",
          currentNightlyRateUsd: String(v.rate),
          assetTypeId: villaAsset.id,
        })
        .returning({ id: villas.id });
      villaIdBySlug.set(v.slug, row!.id);
      nVillas++;
    }
  }
  console.log(`  ${nVillas} villas (${villaIdBySlug.size} total resolved)`);

  // 2) OWNERS + OWNERSHIP SHARES -------------------------------------------
  console.log("seeding owners...");
  const ownerIdByName = new Map<string, string>();
  let nOwners = 0;
  for (const o of OWNER_SPEC) {
    // Idempotency by email.
    const existing = await db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.email, o.email))
      .limit(1);
    if (existing[0]) {
      ownerIdByName.set(o.name, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(owners)
      .values({
        type: (o.type ?? "individual") as "individual" | "company" | "family_office",
        displayName: o.name,
        legalName: o.legal,
        email: o.email,
        nationality: o.nationality,
        status: "active",
      })
      .returning({ id: owners.id });
    ownerIdByName.set(o.name, row!.id);
    nOwners++;
  }
  console.log(`  ${nOwners} owners inserted`);

  console.log("seeding ownership shares...");
  const villaList = Array.from(villaIdBySlug.entries());
  const ownerList = Array.from(ownerIdByName.values());
  let nShares = 0;
  for (let i = 0; i < villaList.length; i++) {
    const [, villaId] = villaList[i];
    const owner1 = ownerList[i % ownerList.length];
    // Half of villas are sole-owner, half split 60/40.
    const split = i % 2 === 0;
    if (split) {
      const owner2 = ownerList[(i + 3) % ownerList.length];
      // Insert if neither share exists for this villa.
      const existing = await db
        .select({ id: ownershipShares.id })
        .from(ownershipShares)
        .where(eq(ownershipShares.villaId, villaId))
        .limit(1);
      if (existing[0]) continue;
      await db.insert(ownershipShares).values([
        {
          ownerId: owner1,
          villaId,
          sharePercent: "60.000000",
          model: "individual",
          startsOn: "2024-01-01",
          status: "active",
        },
        {
          ownerId: owner2,
          villaId,
          sharePercent: "40.000000",
          model: "individual",
          startsOn: "2024-01-01",
          status: "active",
        },
      ]);
      nShares += 2;
    } else {
      const existing = await db
        .select({ id: ownershipShares.id })
        .from(ownershipShares)
        .where(eq(ownershipShares.villaId, villaId))
        .limit(1);
      if (existing[0]) continue;
      await db.insert(ownershipShares).values({
        ownerId: owner1,
        villaId,
        sharePercent: "100.000000",
        model: "individual",
        startsOn: "2024-01-01",
        status: "active",
      });
      nShares++;
    }
  }
  console.log(`  ${nShares} ownership share rows`);

  // 3) BOOKING CHANNELS + BOOKINGS -----------------------------------------
  console.log("seeding booking channels...");
  const channelIdByKey = new Map<string, string>();
  for (const c of CHANNEL_SPEC) {
    const key = `demo2-${c.key}`;
    const existing = await db
      .select({ id: bookingChannels.id })
      .from(bookingChannels)
      .where(eq(bookingChannels.key, key))
      .limit(1);
    if (existing[0]) {
      channelIdByKey.set(c.key, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(bookingChannels)
      .values({
        key,
        name: c.name,
        type: c.type as "ota" | "direct" | "agent" | "social" | "corporate",
        commissionModel: "percent",
        defaultCommissionPct: c.commission,
        status: "active",
      })
      .returning({ id: bookingChannels.id });
    channelIdByKey.set(c.key, row!.id);
  }
  console.log(`  ${channelIdByKey.size} channels resolved`);

  console.log("seeding bookings...");
  const rng = seededRng(42);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = addDays(today, -90); // past 3 months
  const endRange = addDays(today, 42); // next 6 weeks
  const totalDays = Math.floor((endRange.getTime() - start.getTime()) / 86400000);

  let nBookings = 0;
  let bookingCounter = 1;
  const TARGET_BOOKINGS = 50;
  while (bookingCounter <= TARGET_BOOKINGS) {
    const villaEntry = villaList[bookingCounter % villaList.length];
    if (!villaEntry) break;
    const [, villaId] = villaEntry;
    const channelKey = pickWeightedChannel(rng);
    const channelId = channelIdByKey.get(channelKey);
    const startOffset = Math.floor(rng() * totalDays);
    const nights = 3 + Math.floor(rng() * 9);
    const checkIn = addDays(start, startOffset);
    const checkOut = addDays(checkIn, nights);
    const villaSpec = VILLA_SPEC.flatMap((p) => p.villas).find(
      (v) => villaIdBySlug.get(v.slug) === villaId,
    );
    const rate = villaSpec?.rate ?? 400;
    const gross = nights * rate * (0.9 + rng() * 0.3);
    const status =
      checkOut < today
        ? "checked_out"
        : checkIn < today
          ? "checked_in"
          : "confirmed";
    const guest = pickDeterministic(GUEST_NAMES, bookingCounter * 7);
    const code = `${DEMO_PREFIX}BK-${String(bookingCounter).padStart(5, "0")}`;
    bookingCounter++;

    const existing = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingCode, code))
      .limit(1);
    if (existing[0]) continue;

    await db.insert(bookings).values({
      organizationId,
      villaId,
      channelId: channelId ?? null,
      bookingCode: code,
      status: status as "confirmed" | "checked_in" | "checked_out",
      checkIn: isoDate(checkIn),
      checkOut: isoDate(checkOut),
      nights,
      adults: 2 + Math.floor(rng() * 3),
      children: rng() > 0.6 ? Math.floor(rng() * 3) : 0,
      currency: "USD",
      grossAmount: gross.toFixed(2),
      cleaningFeeAmount: "75.00",
      channelFeeAmount: ((channelKey === "direct" ? 0 : 0.15) * gross).toFixed(2),
      paymentFeeAmount: (0.029 * gross).toFixed(2),
      notes: `[DEMO2] ${guest}`,
    });
    nBookings++;
  }
  console.log(`  ${nBookings} bookings inserted`);

  // 4) INVESTORS ------------------------------------------------------------
  console.log("seeding investors...");
  let nInvestors = 0;
  for (const inv of INVESTOR_SPEC) {
    const code = `${DEMO_PREFIX}${inv.code}`;
    const existing = await db
      .select({ id: investors.id })
      .from(investors)
      .where(eq(investors.investorCode, code))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(investors).values({
      organizationId,
      investorCode: code,
      investorType: inv.type as "gp" | "lp_private" | "lp_institutional" | "landowner_jv",
      legalName: `[DEMO2] ${inv.name}`,
      legalEntityType: inv.legalType as "individual" | "llc" | "pt_pma" | "offshore" | "trust",
      taxResidency: inv.residency,
      primaryCurrency: inv.currency as "USD" | "IDR",
      reportingLanguage: "en",
      contactEmail: `${inv.code.toLowerCase()}@example.com`,
      status: "active",
    });
    nInvestors++;
  }
  console.log(`  ${nInvestors} investors`);

  // 5) DEV OS INVENTORY ----------------------------------------------------
  console.log("seeding dev_os inventory items...");
  let nInv = 0;
  for (let i = 0; i < MATERIAL_NAMES.length; i++) {
    const [name, category, uom] = MATERIAL_NAMES[i];
    const sku = `${DEMO_PREFIX}MAT-${String(i + 1).padStart(3, "0")}`;
    const existing = await db
      .select({ id: devOsInventoryItems.id })
      .from(devOsInventoryItems)
      .where(eq(devOsInventoryItems.sku, sku))
      .limit(1);
    if (existing[0]) continue;
    const baseCostMinor = BigInt(50_000 + i * 23_500);
    await db.insert(devOsInventoryItems).values({
      organizationId,
      sku,
      displayName: `[DEMO2] ${name}`,
      category,
      unitOfMeasure: uom,
      averageCostMinor: baseCostMinor,
      lastPurchasePriceMinor: baseCostMinor + BigInt(1_200),
      lastPurchaseDate: isoDate(addDays(today, -Math.floor(rng() * 60))),
      defaultCurrency: "IDR",
      minimumStockLevel: "10",
      reorderPoint: "25",
      isActive: true,
    });
    nInv++;
  }
  console.log(`  ${nInv} inventory items`);

  // 6) PURCHASE REQUESTS + QUOTATIONS + POs + INVOICES ---------------------
  console.log("seeding procurement chain...");
  const prIds: string[] = [];
  let nPRs = 0;
  if (!creator) {
    console.log("  ⚠ no app_user found for org — skipping procurement (requested_by NOT NULL)");
  } else {
    for (let i = 0; i < 12; i++) {
      const code = `${DEMO_PREFIX}PR-${String(i + 1).padStart(4, "0")}`;
      const existing = await db
        .select({ id: devOsPurchaseRequests.id })
        .from(devOsPurchaseRequests)
        .where(eq(devOsPurchaseRequests.requestCode, code))
        .limit(1);
      if (existing[0]) {
        prIds.push(existing[0].id);
        continue;
      }
      const project = pickDeterministic(allDemoProjects, i * 3);
      const [name, category, uom] = pickDeterministic(MATERIAL_NAMES as unknown as Array<readonly [string, string, string]>, i * 11);
      const states = ["draft", "submitted", "approved", "po_created"] as const;
      const status = states[i % states.length];
      const [row] = await db
        .insert(devOsPurchaseRequests)
        .values({
          organizationId,
          requestCode: code,
          requestedBy: creator.id,
          projectId: project.id,
          materialName: name,
          materialCategory: category,
          quantity: String(10 + i * 4),
          unitOfMeasure: uom,
          reason: `Replenishment for active works · ${project.slug.replace("demo-", "")}`,
          requiredByDate: isoDate(addDays(today, 5 + i)),
          urgency: i % 4 === 0 ? "high" : "normal",
          estimatedCostMinor: BigInt(500_000 + i * 220_000),
          estimatedCurrency: "IDR",
          status,
          submittedAt: status !== "draft" ? new Date() : null,
          notes: "[DEMO2] seeded",
        })
        .returning({ id: devOsPurchaseRequests.id });
      prIds.push(row!.id);
      nPRs++;
    }
  }
  console.log(`  ${nPRs} purchase requests`);

  console.log("seeding procurement quotations...");
  let nQuotes = 0;
  for (let i = 0; i < Math.min(prIds.length, 8); i++) {
    const prId = prIds[i];
    // 2 quotes per PR.
    for (let v = 0; v < 2; v++) {
      const vendor = demoVendors[(i * 2 + v) % demoVendors.length];
      const qnum = `${DEMO_PREFIX}QT-${String(i + 1).padStart(3, "0")}-V${v + 1}`;
      const existing = await db
        .select({ id: procurementQuotations.id })
        .from(procurementQuotations)
        .where(eq(procurementQuotations.quotationNumber, qnum))
        .limit(1);
      if (existing[0]) continue;
      const total = BigInt(700_000 + (i + v) * 180_000);
      const status = v === 0 && i % 3 === 0 ? "selected" : v === 1 ? "under_review" : "received";
      await db.insert(procurementQuotations).values({
        organizationId,
        purchaseRequestId: prId,
        vendorId: vendor.id,
        quotationNumber: qnum,
        quotedAt: isoDate(addDays(today, -7 + i)),
        validityUntil: isoDate(addDays(today, 14 + i)),
        totalAmountMinor: total,
        currency: "IDR",
        deliveryEstimatedDate: isoDate(addDays(today, 10 + i + v * 3)),
        status,
        notes: "[DEMO2] seeded",
      });
      nQuotes++;
    }
  }
  console.log(`  ${nQuotes} quotations`);

  console.log("seeding POs...");
  const poIds: string[] = [];
  let nPos = 0;
  for (let i = 0; i < 8; i++) {
    const code = `${DEMO_PREFIX}PO-${String(i + 1).padStart(4, "0")}`;
    const existing = await db
      .select({ id: materialPurchaseOrders.id })
      .from(materialPurchaseOrders)
      .where(eq(materialPurchaseOrders.poCode, code))
      .limit(1);
    if (existing[0]) {
      poIds.push(existing[0].id);
      continue;
    }
    const project = pickDeterministic(allDemoProjects, i * 5);
    const vendor = demoVendors[i % demoVendors.length];
    const totalIdr = BigInt(15_000_000_00 + i * 3_500_000_00); // IDR minor
    const fx = "16800";
    const totalUsd = BigInt(Math.round(Number(totalIdr) / Number(fx)));
    const states = ["ordered", "partially_delivered", "fully_delivered", "ordered"] as const;
    const [row] = await db
      .insert(materialPurchaseOrders)
      .values({
        organizationId,
        poCode: code,
        projectId: project.id,
        vendorId: vendor.id,
        orderDate: isoDate(addDays(today, -i * 3 - 2)),
        expectedDeliveryDate: isoDate(addDays(today, i + 5)),
        status: states[i % states.length],
        totalAmountUsdMinor: totalUsd,
        totalAmountCurrency: "IDR",
        totalAmountOriginalMinor: totalIdr,
        fxRateAtOrder: fx,
      })
      .returning({ id: materialPurchaseOrders.id });
    poIds.push(row!.id);
    nPos++;
  }
  console.log(`  ${nPos} POs`);

  console.log("seeding invoices...");
  let nInvoices = 0;
  for (let i = 0; i < 10; i++) {
    const num = `${DEMO_PREFIX}INV-${String(i + 1).padStart(4, "0")}`;
    const existing = await db
      .select({ id: devInvoices.id })
      .from(devInvoices)
      .where(eq(devInvoices.invoiceNumber, num))
      .limit(1);
    if (existing[0]) continue;
    const project = pickDeterministic(allDemoProjects, i * 7);
    const vendor = demoVendors[i % demoVendors.length];
    const relatedPo = poIds[i % poIds.length] ?? null;
    const totalMinor = BigInt(8_000_00 + i * 2_500_00); // USD minor
    const states = ["draft", "issued", "partial_paid", "paid", "overdue"] as const;
    const status = states[i % states.length];
    const paid =
      status === "paid"
        ? totalMinor
        : status === "partial_paid"
          ? totalMinor / 2n
          : 0n;
    await db.insert(devInvoices).values({
      organizationId,
      invoiceNumber: num,
      invoiceType: "payable",
      vendorId: vendor.id,
      projectId: project.id,
      relatedPoId: relatedPo,
      issueDate: isoDate(addDays(today, -10 - i)),
      dueDate: isoDate(addDays(today, 20 - i)),
      subtotalMinor: totalMinor,
      taxTotalMinor: 0n,
      totalMinor,
      paidMinor: paid,
      currency: "USD",
      status,
      notes: "[DEMO2] seeded",
    });
    nInvoices++;
  }
  console.log(`  ${nInvoices} invoices`);

  // 7) SITE REPORTS --------------------------------------------------------
  console.log("seeding site reports...");
  let nReports = 0;
  for (let i = 0; i < 15; i++) {
    const project = pickDeterministic(allDemoProjects, i * 13);
    const reportDate = isoDate(addDays(today, -i));
    // UNIQUE (project_id, report_date)
    const existing = await db
      .select({ id: siteReports.id })
      .from(siteReports)
      .where(
        sql`${siteReports.projectId} = ${project.id} AND ${siteReports.reportDate} = ${reportDate}`,
      )
      .limit(1);
    if (existing[0]) continue;
    await db.insert(siteReports).values({
      organizationId,
      projectId: project.id,
      reportDate,
      weatherConditions: pickDeterministic(["sunny", "cloudy", "light_rain", "humid_overcast"], i),
      totalWorkersPresent: 18 + Math.floor(rng() * 30),
      summary: `Site progress · ${project.slug.replace("demo-", "")} · day ${i + 1}`,
      reportedBy: creator?.id ?? null,
      reporterRole: "site_supervisor",
      status: i === 0 ? "draft" : "submitted",
      sourceChannel: "web",
      notes: "[DEMO2] seeded site report",
    });
    nReports++;
  }
  console.log(`  ${nReports} site reports`);

  // 8) MAINTENANCE TEMPLATES + TICKETS -------------------------------------
  console.log("seeding maintenance templates...");
  let nTpl = 0;
  for (const t of MAINT_TEMPLATES) {
    const key = `${DEMO_PREFIX.toLowerCase()}${t.key}`;
    const existing = await db
      .select({ id: maintenanceTemplates.id })
      .from(maintenanceTemplates)
      .where(eq(maintenanceTemplates.key, key))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(maintenanceTemplates).values({
      key,
      name: `[DEMO2] ${t.name}`,
      category: t.category,
      defaultFrequency: t.freq,
      defaultIntervalDays: t.days,
      defaultDurationMinutes: t.mins,
      defaultPriority: "normal",
      status: "active",
    });
    nTpl++;
  }
  console.log(`  ${nTpl} maintenance templates`);

  console.log("seeding maintenance tickets...");
  let nTickets = 0;
  for (let i = 0; i < 8; i++) {
    const code = `${DEMO_PREFIX}MT-${String(i + 1).padStart(4, "0")}`;
    const existing = await db
      .select({ id: maintenanceTickets.id })
      .from(maintenanceTickets)
      .where(eq(maintenanceTickets.ticketCode, code))
      .limit(1);
    if (existing[0]) continue;
    const villa = villaList[i % villaList.length];
    if (!villa) break;
    const titles = [
      "Pool pump intermittent shutdown",
      "Living room AC weak airflow",
      "Bathroom basin slow drain",
      "Garden sprinkler zone 3 stuck",
      "Front gate motor noisy",
      "Kitchen extractor light out",
      "Master suite door latch loose",
      "Pool deck tile chipped",
    ];
    // issue_category enum: electrical|plumbing|ac|pool|internet|furniture|
    // appliance|structural|landscaping|pest|other
    const cats = ["plumbing", "ac", "plumbing", "landscaping", "electrical", "electrical", "furniture", "structural"];
    const severities = ["normal", "normal", "high", "low", "normal", "low", "normal", "low"] as const;
    const states = ["open", "in_progress", "open", "open", "in_progress", "resolved", "open", "open"] as const;
    await db.insert(maintenanceTickets).values({
      ticketCode: code,
      villaId: villa[1],
      title: `[DEMO2] ${titles[i]}`,
      description: "Identified during routine inspection.",
      issueCategory: cats[i],
      severity: severities[i],
      status: states[i],
      ownerChargeable: i % 3 !== 0,
      reportedAt: addDays(today, -3 - i),
    });
    nTickets++;
  }
  console.log(`  ${nTickets} maintenance tickets`);

  // 9) LEADS ----------------------------------------------------------------
  console.log("seeding leads...");
  let nLeads = 0;
  // lifecycle_status enum: lead|qualified|hot|reservation|contract|closed_won|closed_lost|on_hold|archived
  const leadStatuses = ["lead", "qualified", "hot", "reservation", "lead", "qualified", "hot", "closed_won", "closed_lost", "lead", "reservation", "qualified"];
  for (let i = 0; i < 12; i++) {
    const code = `${DEMO_PREFIX}LEAD-${String(i + 1).padStart(4, "0")}`;
    const existing = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.leadCode, code))
      .limit(1);
    if (existing[0]) continue;
    const project = pickDeterministic(allDemoProjects, i * 9);
    const utmSource = pickDeterministic(["instagram", "google", "referral", "agent"], i);
    const utmMedium = pickDeterministic(["organic", "cpc", "social"], i * 2);
    const estimatedValue = BigInt(180_000_00 + i * 35_000_00);
    const note = `[DEMO2] prospective buyer · ${pickDeterministic(GUEST_NAMES, i * 5)}`;
    // leads.organization_id was added by a post-Drizzle-schema migration —
    // not in the typed schema, so use raw SQL to set it.
    await db.execute(sql`
      INSERT INTO leads (organization_id, lead_code, project_id, lifecycle_status,
                         utm_source, utm_medium, estimated_value_minor, currency, notes)
      VALUES (${organizationId}::uuid, ${code}, ${project.id}::uuid,
              ${leadStatuses[i]}, ${utmSource}, ${utmMedium},
              ${estimatedValue.toString()}::bigint, ${"USD"}, ${note})
    `);
    nLeads++;
  }
  console.log(`  ${nLeads} leads`);

  // 10) WORK PACKAGES + TASKS ----------------------------------------------
  console.log("seeding work packages...");
  const wpIds: string[] = [];
  let nWps = 0;
  const wpSpec = [
    { code: "FND-A", name: "Foundations · Block A", status: "completed" },
    { code: "FND-B", name: "Foundations · Block B", status: "in_progress" },
    { code: "STR-A", name: "Structure · Block A", status: "in_progress" },
    { code: "STR-B", name: "Structure · Block B", status: "ready_to_start" },
    { code: "MEP-A", name: "MEP rough-in · Block A", status: "in_progress" },
    { code: "MEP-B", name: "MEP rough-in · Block B", status: "planned" },
    { code: "ROOF-A", name: "Roofing · Block A", status: "in_progress" },
    { code: "FIN-A", name: "Finishes · Phase 1", status: "planned" },
    { code: "POOL-1", name: "Pool deck · Block B", status: "planned" },
    { code: "POOL-2", name: "Pool tile selection", status: "planned" },
    { code: "EXT-1", name: "Exterior render", status: "planned" },
    { code: "EXT-2", name: "Landscape phase 1", status: "planned" },
    { code: "DR-14", name: "Drawings rev 14 issue", status: "completed" },
    { code: "BOQ-RB", name: "BOQ rebaseline", status: "completed" },
    { code: "PERMIT-1", name: "Permit office liaison", status: "on_hold" },
  ] as const;
  for (let i = 0; i < wpSpec.length; i++) {
    const w = wpSpec[i];
    const code = `${DEMO_PREFIX}WP-${w.code}`;
    const existing = await db
      .select({ id: workPackages.id })
      .from(workPackages)
      .where(eq(workPackages.packageCode, code))
      .limit(1);
    if (existing[0]) {
      wpIds.push(existing[0].id);
      continue;
    }
    const project = pickDeterministic(allDemoProjects, i);
    const plannedStart = isoDate(addDays(today, -30 + i * 4));
    const plannedFinish = isoDate(addDays(today, -10 + i * 5));
    const progress =
      w.status === "completed"
        ? "100"
        : w.status === "in_progress"
          ? String(20 + (i * 13) % 60)
          : "0";
    const [row] = await db
      .insert(workPackages)
      .values({
        organizationId,
        packageCode: code,
        name: `[DEMO2] ${w.name}`,
        projectId: project.id,
        displayOrder: i,
        plannedStart,
        plannedFinish,
        progressPercentage: progress,
        budgetAmountMinor: BigInt(20_000_00 + i * 4_500_00),
        actualAmountMinor: BigInt(15_000_00 + i * 4_000_00),
        responsibleUserId: creator?.id ?? null,
        primaryVendorId: demoVendors[i % demoVendors.length].id,
        status: w.status,
        notes: "[DEMO2] seeded",
      })
      .returning({ id: workPackages.id });
    wpIds.push(row!.id);
    nWps++;
  }
  console.log(`  ${nWps} work packages`);

  console.log("seeding project tasks...");
  let nTasks = 0;
  for (let i = 0; i < wpIds.length; i++) {
    const wpId = wpIds[i];
    for (let t = 0; t < 3; t++) {
      const code = `${DEMO_PREFIX}TASK-${String(i + 1).padStart(2, "0")}-${t + 1}`;
      const existing = await db
        .select({ id: projectTasks.id })
        .from(projectTasks)
        .where(eq(projectTasks.taskCode, code))
        .limit(1);
      if (existing[0]) continue;
      const plannedStart = isoDate(addDays(today, -20 + i * 2 + t));
      const plannedFinish = isoDate(addDays(today, -15 + i * 2 + t * 2));
      await db.insert(projectTasks).values({
        organizationId,
        taskCode: code,
        name: `[DEMO2] Sub-task ${t + 1} · ${wpSpec[i].name}`,
        workPackageId: wpId,
        displayOrder: t,
        plannedStart,
        plannedFinish,
        progressPercentage: t === 0 ? "100" : t === 1 ? "60" : "0",
        responsibleUserId: creator?.id ?? null,
        vendorId: demoVendors[(i + t) % demoVendors.length].id,
        status: t === 0 ? "completed" : t === 1 ? "in_progress" : "planned",
      });
      nTasks++;
    }
  }
  console.log(`  ${nTasks} project tasks`);

  // 11) RISKS ---------------------------------------------------------------
  console.log("seeding project risks...");
  let nRisks = 0;
  for (let i = 0; i < RISK_SPEC.length; i++) {
    const r = RISK_SPEC[i];
    const code = `${DEMO_PREFIX}RISK-${r.code.toUpperCase()}`;
    const existing = await db
      .select({ id: projectRisks.id })
      .from(projectRisks)
      .where(eq(projectRisks.riskCode, code))
      .limit(1);
    if (existing[0]) continue;
    const project = pickDeterministic(allDemoProjects, i * 11);
    await db.insert(projectRisks).values({
      organizationId,
      riskCode: code,
      title: `[DEMO2] ${r.title}`,
      projectId: project.id,
      description: r.mit,
      category: r.category,
      probability: r.prob,
      impact: r.impact,
      ownerId: creator?.id ?? null,
      mitigationPlan: r.mit,
      mitigationStatus: i === RISK_SPEC.length - 1 ? "monitored" : "mitigating",
      identifiedAt: isoDate(addDays(today, -10 - i)),
      notes: "[DEMO2] seeded",
    });
    nRisks++;
  }
  console.log(`  ${nRisks} project risks`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const db = getDb();
  try {
    const organizationId = await resolveOrgId(db, opts.organizationId);
    console.log(`target org: ${organizationId}`);
    if (opts.wipe) {
      await wipe(db, organizationId);
    } else {
      await seed(db, organizationId);
    }
    console.log("done.");
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
