/**
 * Diagnostic: which Stage 2.2.B tables exist on this DB, and can we
 * actually SELECT against each one through the Drizzle client?
 *
 * Run with:
 *   node --env-file=.env.local --import tsx scripts/check-stage-22b-tables.ts
 *
 * Returns exit 0 when everything is fine, exit 1 on error.
 */

import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const expectedTables = [
  "contract_groups",
  "contracts",
  "contract_milestones",
  "contract_templates",
  "contract_template_components",
  "invoices",
  "reservations",
  "sales_schemes",
  "sales_scheme_milestones",
  "pricing_rules",
  "unit_price_snapshots",
  "unit_discounts",
  "discount_authorizations",
  "late_fee_rules",
  "late_fee_accruals",
  "dev_notification_rules",
  "dev_notification_templates",
  "dev_notification_delivery_log",
];

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false });
  try {
    const result = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${expectedTables})
      ORDER BY tablename;
    `;
    const found = result.map((r) => r.tablename);
    const missing = expectedTables.filter((t) => !found.includes(t));

    console.log("\n=== Stage 2.2.B Database State ===\n");
    console.log(
      `Found ${found.length}/${expectedTables.length} expected tables.\n`,
    );

    // SELECT 0 rows from each — the same query path the page would take
    // through Drizzle. If this returns cleanly, the routes will too.
    let queryFails = 0;
    for (const t of expectedTables) {
      try {
        await sql.unsafe(`SELECT 1 FROM "${t}" LIMIT 1`);
      } catch (err) {
        queryFails += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ ${t}: ${msg.split("\n")[0]}`);
      }
    }
    if (queryFails === 0) {
      console.log(`✓ All ${expectedTables.length} tables are queryable.`);
    } else {
      console.log(`✗ ${queryFails} tables failed a basic SELECT.`);
    }

    if (missing.length > 0) {
      console.log(`\nMissing:\n  ${missing.join("\n  ")}\n`);
    }

    // Supporting tables (2.1 + 2.2.A) — quick presence check.
    const supportingTables = [
      "development_project_meta",
      "project_phases",
      "land_plots",
      "unit_types",
      "unit_development_meta",
      "contacts",
      "contact_roles",
      "contact_interactions",
      "agents",
      "lead_sources",
    ];
    const supporting = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${supportingTables})
      ORDER BY tablename;
    `;
    console.log(
      `\nSupporting (2.1 + 2.2.A) tables: ${supporting.length}/${supportingTables.length} present.`,
    );

    process.exit(missing.length === 0 && queryFails === 0 ? 0 : 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
