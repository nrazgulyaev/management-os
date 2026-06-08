/**
 * Seed the standard double-entry chart of accounts (migration 0122) for
 * every organization. Idempotent — ON CONFLICT (organization_id, code)
 * DO NOTHING — safe to re-run. Uses raw postgres (the drizzle client is
 * server-only and can't be imported from a node script).
 *
 * Run: npm run seed:gl-coa
 */

import postgres from "postgres";
import { STANDARD_COA } from "@/lib/development/server/general-ledger/chart-of-accounts";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL / DATABASE_URL not set — cannot connect.");
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false });
  try {
    const orgs = await sql<Array<{ id: string; name: string }>>`
      SELECT id, name FROM organizations ORDER BY name
    `;
    if (orgs.length === 0) {
      console.log("No organizations found — nothing to seed.");
      return;
    }
    let grandTotal = 0;
    for (const o of orgs) {
      let inserted = 0;
      for (const a of STANDARD_COA) {
        const rows = await sql`
          INSERT INTO chart_of_accounts
            (organization_id, code, name, type, normal_balance, note)
          VALUES
            (${o.id}, ${a.code}, ${a.name}, ${a.type}, ${a.normalBalance}, ${a.note ?? null})
          ON CONFLICT (organization_id, code) DO NOTHING
          RETURNING id
        `;
        inserted += rows.length;
      }
      grandTotal += inserted;
      console.log(`${o.name.padEnd(28)} +${inserted}/${STANDARD_COA.length} accounts`);
    }
    console.log(`\nDone. ${grandTotal} account(s) inserted across ${orgs.length} org(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
