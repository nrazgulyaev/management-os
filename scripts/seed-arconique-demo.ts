#!/usr/bin/env tsx
/**
 * DEMO-1 — Arconique demo seed.
 *
 * Seeds the operator's organization with realistic demo data driven
 * by the real Arconique XLSX export at
 * docs/reference/arconique-real-data-sample.xlsx.
 *
 * Every seeded row is marked with a "DEMO-" prefix on its code/slug
 * field so wipe is a simple WHERE-LIKE filter — no schema changes.
 *
 *   npm run seed:arconique-demo               # insert demo rows
 *   npm run seed:arconique-demo -- --wipe      # remove all DEMO- rows
 *   npm run seed:arconique-demo -- --org=<id>  # target a specific org
 *
 * Idempotent: re-running inserts nothing new if the rows already
 * exist (ON CONFLICT DO NOTHING on the unique code/slug fields).
 *
 * Scope shipped in DEMO-1:
 *   - 6 projects   (real names from XLSX)
 *   - 4 bank accounts  (3 real holders + KLNR USD)
 *   - 21 cost categories  (real list from XLSX)
 *   - 15 vendors  (realistic Bali construction suppliers)
 *   - 100 transactions  (XLSX-shaped sample)
 *
 * Deferred to DEMO-2 (entities without easy DEMO- marking — would
 * need an is_demo schema column added):
 *   - villas, owners, bookings, investors, site reports, BoQ docs,
 *     procurement chain, materials/inventory, leads, maintenance,
 *     AI agent runs.
 */

import { eq, sql, like } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { getDb } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema/saas";
import { projects, villas } from "../src/lib/db/schema/projects";
import { vendors } from "../src/lib/db/schema/site-operations";
import {
  devBankAccounts,
  devCostCategories,
  devTransactions,
} from "../src/lib/db/schema/dev-finance";

const ROOT = resolve(__dirname, "..");
const XLSX_PATH = resolve(ROOT, "docs/reference/arconique-real-data-sample.xlsx");
const DEMO_PREFIX = "DEMO-";

// Real values pulled from the XLSX (extracted via node + xlsx).
const PROJECTS = [
  { slug: "prime-park-villas", name: "Prime Park Villas" },
  { slug: "mexico-villas", name: "Mexico Villas" },
  { slug: "views-villas", name: "Views Villas" },
  { slug: "japanese-villas", name: "Japanese Villas" },
  { slug: "back-office", name: "Back Office" },
  { slug: "new-land", name: "New Land" },
];

const COST_CATEGORIES = [
  { code: "MATERIAL", name: "Material", type: "capex" },
  { code: "WORKER_MEAL", name: "Worker Meal Allowance", type: "opex" },
  { code: "CARGO_DELIVERY", name: "Cargo Delivery", type: "opex" },
  { code: "TREATS", name: "Treats", type: "opex" },
  { code: "WORKPLACE_INFRA", name: "Workplace and Infrastruktur", type: "opex" },
  { code: "TOOL", name: "Tool", type: "capex" },
  { code: "DEPOSIT", name: "Deposit", type: "capex" },
  { code: "TRANSPORTATION", name: "Transportation", type: "opex" },
  { code: "OFFICE_EQUIPMENT", name: "Office Equipment", type: "capex" },
  { code: "TRANSFER_OF_WORKERS", name: "Transfer of workers", type: "opex" },
  { code: "WATER", name: "Water", type: "opex" },
  { code: "RENT", name: "Rent", type: "opex" },
  { code: "TAX_PAYMENT", name: "Tax Payment", type: "opex" },
  { code: "OFFICE_SUPPLIES", name: "Office Supplies", type: "opex" },
  { code: "ELECTRICITY", name: "Electricity", type: "opex" },
  { code: "CONSUMABLES", name: "Consumables", type: "opex" },
  { code: "OTHER_EXPENSE", name: "Other Expense", type: "opex" },
  { code: "SALARY", name: "Salary", type: "opex" },
  { code: "MANDOR_PROGRESS", name: "Mandor - Progress payment", type: "opex" },
  { code: "DAILY_WORKER", name: "Daily worker", type: "opex" },
  { code: "DEBT_ADVANCE", name: "Debt Advance", type: "opex" },
];

const BANK_ACCOUNTS = [
  {
    code: "HOLDER_RACHMAT_IDR",
    name: "Pak Rachmat (cash holder)",
    type: "cash",
    currency: "IDR",
  },
  {
    code: "HOLDER_ALYAA_IDR",
    name: "Alyaa (cash holder)",
    type: "cash",
    currency: "IDR",
  },
  {
    code: "KLNR_REAL_ESTATE_USD",
    name: "KLNR Real Estate USD",
    type: "bank",
    currency: "USD",
  },
  {
    code: "KLNR_REAL_ESTATE_IDR",
    name: "KLNR Real Estate IDR",
    type: "bank",
    currency: "IDR",
  },
];

const VENDORS = [
  { code: "TOKO_BANGUNAN_SEJAHTERA", name: "Toko Bangunan Sejahtera" },
  { code: "PT_SEMEN_INDONESIA", name: "PT Semen Indonesia" },
  { code: "CV_BESI_JAYA", name: "CV Besi Jaya (steel/rebar)" },
  { code: "TOKO_LISTRIK_SENTOSA", name: "Toko Listrik Sentosa" },
  { code: "INDOMARET_BALI", name: "Indomaret Bali" },
  { code: "PERTAMINA", name: "Pertamina (fuel)" },
  { code: "PLN", name: "PLN (electricity utility)" },
  { code: "PDAM", name: "PDAM (water utility)" },
  { code: "BANGUNAN_BALI_MULIA", name: "Bangunan Bali Mulia" },
  { code: "TOKO_CAT_PRIMA", name: "Toko Cat Prima" },
  { code: "CV_GRANIT_TILES", name: "CV Granit Tiles" },
  { code: "MEGA_BANGUN_PERSADA", name: "Mega Bangun Persada" },
  { code: "WARUNG_MAKAN_SEDAP", name: "Warung Makan Sedap (worker meals)" },
  { code: "CARGO_BALI_EXPRESS", name: "Cargo Bali Express" },
  { code: "SUMBER_ALAM_KAYU", name: "Sumber Alam Kayu (timber)" },
];

interface SeedOptions {
  wipe: boolean;
  organizationId: string | null;
  fromCli: string[];
}

function parseArgs(argv: string[]): SeedOptions {
  const args = argv.slice(2);
  const orgArg = args.find((a) => a.startsWith("--org="));
  return {
    wipe: args.includes("--wipe"),
    organizationId: orgArg ? orgArg.split("=", 2)[1] : null,
    fromCli: args,
  };
}

async function resolveOrgId(
  db: NonNullable<ReturnType<typeof getDb>>,
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

async function wipe(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
): Promise<void> {
  console.log("wiping DEMO- prefixed rows for org", organizationId, "...");
  const tDel = await db
    .delete(devTransactions)
    .where(
      sql`${devTransactions.organizationId} = ${organizationId} AND ${devTransactions.transactionCode} LIKE ${DEMO_PREFIX + "%"}`,
    )
    .returning({ id: devTransactions.id });
  const bDel = await db
    .delete(devBankAccounts)
    .where(
      sql`${devBankAccounts.organizationId} = ${organizationId} AND ${devBankAccounts.accountCode} LIKE ${DEMO_PREFIX + "%"}`,
    )
    .returning({ id: devBankAccounts.id });
  const cDel = await db
    .delete(devCostCategories)
    .where(
      sql`${devCostCategories.organizationId} = ${organizationId} AND ${devCostCategories.categoryCode} LIKE ${DEMO_PREFIX + "%"}`,
    )
    .returning({ id: devCostCategories.id });
  const vDel = await db
    .delete(vendors)
    .where(
      sql`${vendors.organizationId} = ${organizationId} AND ${vendors.vendorCode} LIKE ${DEMO_PREFIX + "%"}`,
    )
    .returning({ id: vendors.id });
  const pDel = await db
    .delete(projects)
    .where(like(projects.slug, DEMO_PREFIX.toLowerCase() + "%"))
    .returning({ id: projects.id });
  console.log(
    `wiped: ${tDel.length} transactions, ${bDel.length} bank accounts, ${cDel.length} categories, ${vDel.length} vendors, ${pDel.length} projects`,
  );
}

async function seed(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
): Promise<void> {
  // 1) Projects
  console.log("seeding projects...");
  const projectIds = new Map<string, string>();
  for (const p of PROJECTS) {
    const slug = DEMO_PREFIX.toLowerCase() + p.slug;
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (existing[0]) {
      projectIds.set(p.slug, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(projects)
      .values({
        slug,
        name: `[DEMO] ${p.name}`,
        location: "Bali",
        status: "active",
        managementStatus: "managed",
      })
      .returning({ id: projects.id });
    projectIds.set(p.slug, row!.id);
  }
  console.log(`  ${projectIds.size} projects`);

  // 2) Cost categories
  console.log("seeding cost categories...");
  const categoryIds = new Map<string, string>();
  for (const c of COST_CATEGORIES) {
    const code = DEMO_PREFIX + c.code;
    const existing = await db
      .select({ id: devCostCategories.id })
      .from(devCostCategories)
      .where(eq(devCostCategories.categoryCode, code))
      .limit(1);
    if (existing[0]) {
      categoryIds.set(c.name, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(devCostCategories)
      .values({
        organizationId,
        categoryCode: code,
        displayName: `[DEMO] ${c.name}`,
        categoryType: c.type,
        displayOrder: 100,
      })
      .returning({ id: devCostCategories.id });
    categoryIds.set(c.name, row!.id);
  }
  console.log(`  ${categoryIds.size} categories`);

  // 3) Bank accounts
  console.log("seeding bank accounts...");
  const accountIds = new Map<string, string>();
  for (const a of BANK_ACCOUNTS) {
    const code = DEMO_PREFIX + a.code;
    const existing = await db
      .select({ id: devBankAccounts.id })
      .from(devBankAccounts)
      .where(eq(devBankAccounts.accountCode, code))
      .limit(1);
    if (existing[0]) {
      accountIds.set(a.code, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(devBankAccounts)
      .values({
        organizationId,
        accountCode: code,
        accountName: `[DEMO] ${a.name}`,
        accountType: a.type,
        currency: a.currency,
        isCompanyAccount: true,
      })
      .returning({ id: devBankAccounts.id });
    accountIds.set(a.code, row!.id);
  }
  console.log(`  ${accountIds.size} bank accounts`);

  // 4) Vendors
  console.log("seeding vendors...");
  let nVendors = 0;
  for (const v of VENDORS) {
    const code = DEMO_PREFIX + v.code;
    const existing = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.vendorCode, code))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(vendors).values({
      organizationId,
      vendorCode: code,
      legalName: `[DEMO] ${v.name}`,
      vendorType: "supplier",
    });
    nVendors++;
  }
  console.log(`  ${nVendors} vendors inserted (${VENDORS.length - nVendors} already existed)`);

  // 5) Transactions — sample from real XLSX
  console.log("seeding transactions from XLSX...");
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets["Transactions"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
  });
  // Headers at row index 2; data starts row 3.
  // Cols: 1=№, 2=cash advance date (excel serial), 3=actual date,
  // 4=IDR amount, 5=USD amount, 6=desc short, 7=desc full, 8=fx rate,
  // 9=group/category, 10=project, 11=holder
  const dataRows = rows.slice(3).filter((r) => Array.isArray(r) && r[1]);
  // Sample 100 evenly distributed rows.
  const stride = Math.max(1, Math.floor(dataRows.length / 100));
  const sample = dataRows
    .filter((_, i) => i % stride === 0)
    .slice(0, 100);

  let nTx = 0;
  for (let i = 0; i < sample.length; i++) {
    const r = sample[i] as (number | string | null)[];
    const actualDate = r[3]; // excel serial date
    const idrAmount = Number(r[4]);
    const fxRate = String(r[8] ?? "16800");
    const categoryName = String(r[9] ?? "").trim();
    const projectName = String(r[10] ?? "").trim();
    const holderName = String(r[11] ?? "").trim();
    const description = String(r[6] ?? "").trim();
    if (!actualDate || !idrAmount || !categoryName) continue;

    // Excel serial date → ISO YYYY-MM-DD.
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const txDate = new Date(
      excelEpoch.getTime() + Number(actualDate) * 86400_000,
    )
      .toISOString()
      .slice(0, 10);

    // Resolve FKs.
    const categoryId = categoryIds.get(categoryName);
    const projectKey = projectName
      .toLowerCase()
      .replace(/\s+/g, "-");
    const projectId =
      projectKey === "back-office"
        ? projectIds.get("back-office")
        : projectIds.get(projectKey);
    const holderKey =
      holderName === "Pak Rachmat"
        ? "HOLDER_RACHMAT_IDR"
        : holderName === "Alyaa"
          ? "HOLDER_ALYAA_IDR"
          : holderName === "KLNR Real Estate"
            ? "KLNR_REAL_ESTATE_IDR"
            : null;
    if (!holderKey) continue;
    const bankAccountId = accountIds.get(holderKey);
    if (!categoryId || !bankAccountId) continue;

    const txCode = `${DEMO_PREFIX}TXN-${new Date(txDate).getFullYear()}-${String(i + 1).padStart(6, "0")}`;
    // Idempotency: skip if already exists.
    const existing = await db
      .select({ id: devTransactions.id })
      .from(devTransactions)
      .where(eq(devTransactions.transactionCode, txCode))
      .limit(1);
    if (existing[0]) continue;

    const amountMinor = BigInt(Math.round(idrAmount * 100));
    const usdAmount = idrAmount / Number(fxRate);
    const usdMinor = BigInt(Math.round(usdAmount * 100));

    await db.insert(devTransactions).values({
      organizationId,
      transactionCode: txCode,
      bankAccountId,
      direction: "outflow",
      categoryId,
      projectId: projectId ?? null,
      amountMinor,
      currency: "IDR",
      amountUsdMinor: usdMinor,
      fxRateAtTransaction: fxRate,
      counterpartyName: null,
      transactionDate: txDate,
      description: description || "[DEMO] expense",
      notes: `[DEMO] seeded from arconique-real-data-sample.xlsx`,
    });
    nTx++;
  }
  console.log(`  ${nTx} transactions inserted`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL not set — cannot connect to the database.");
    process.exit(1);
  }
  const organizationId = await resolveOrgId(db, opts.organizationId);
  console.log(`target org: ${organizationId}`);

  if (opts.wipe) {
    await wipe(db, organizationId);
  } else {
    await seed(db, organizationId);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
