#!/usr/bin/env tsx
/**
 * MEGA-SPRINT P3.2 — Seed org_ai_agent_config rows so the AI Hub counter
 * stops showing "0 of 8 live" for the Arconique org. Idempotent.
 *
 * Why this exists: ai-hub-cabinet-queries.ts:142 reads
 *   isLive: cfg?.isEnabled ?? false
 * Absence of a row defaults to NOT-live in the UI, even though the
 * schema doc at src/lib/db/schema/org-ai-agent-config.ts says the
 * intended behavior is "plan-allowed agents are enabled by default
 * unless this table has is_enabled=false". The UI is stricter than
 * the doc; this seed bridges the gap by inserting explicit
 * is_enabled=true rows so the counter reflects the intended state.
 *
 * Note this only flips the counter — it doesn't configure provider/
 * model/api_key. Operators set those via the per-agent detail page
 * once they paste in their OpenAI/Anthropic credentials.
 *
 * The 8 Mgmt OS agents (per MGMT_AGENT_REGISTRY in
 * ai-hub-cabinet-queries.ts):
 *   executive_business, tax_assistant, daily_digest, weekly_plan,
 *   marketing_assistant, procurement_analyst, inbox, memory
 *
 * Plus the Dev OS QS agent (qs_cost_analyst) which the migration 0090
 * agent_key CHECK accepts.
 *
 * Usage:
 *   npm run seed:ai-agent-config
 *   npm run seed:ai-agent-config -- --wipe   # remove this seed's rows
 *   npm run seed:ai-agent-config -- --org=<uuid>
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";

/**
 * Agent keys from migration 0090's CHECK constraint:
 *   qs_cost_analyst, procurement_analyst, tax_assistant,
 *   marketing_assistant, executive_business, daily_digest,
 *   weekly_plan, inbox, memory
 *
 * Source of truth for the Mgmt registry: MGMT_AGENT_REGISTRY in
 * src/features/ai-agents/ai-hub-cabinet-queries.ts.
 */
const AGENT_KEYS = [
  "executive_business",
  "tax_assistant",
  "daily_digest",
  "weekly_plan",
  "marketing_assistant",
  "procurement_analyst",
  "inbox",
  "memory",
  "qs_cost_analyst",
] as const;

interface Args {
  wipe: boolean;
  orgId: string;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const orgArg = a.find((x) => x.startsWith("--org="));
  return {
    wipe: a.includes("--wipe"),
    orgId: orgArg ? orgArg.split("=", 2)[1] : ARCONIQUE_ORG_ID,
  };
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log("==========================================");
  console.log(" MEGA-SPRINT P3.2 — seed org_ai_agent_config");
  console.log(" Org:", args.orgId);
  console.log(" Mode:", args.wipe ? "WIPE only" : "IDEMPOTENT seed");
  console.log("==========================================\n");

  const db = getDb();

  if (args.wipe) {
    const r = await db.execute(sql`
      DELETE FROM org_ai_agent_config
       WHERE organization_id = ${args.orgId}::uuid
         AND notes = 'MEGA-SPRINT P3.2 seed'
    `);
    console.log(
      `  ✓ wiped ${(r as unknown as { count?: number }).count ?? "?"} rows`,
    );
    await closeDb();
    return;
  }

  let inserted = 0;
  let alreadyConfigured = 0;
  let alreadyEnabled = 0;

  for (const key of AGENT_KEYS) {
    const existing = asRows<{ id: string; is_enabled: boolean }>(
      await db.execute(sql`
        SELECT id::text AS id, is_enabled
          FROM org_ai_agent_config
         WHERE organization_id = ${args.orgId}::uuid
           AND agent_key = ${key}
         LIMIT 1
      `),
    );

    if (existing[0]) {
      if (existing[0].is_enabled) {
        console.log(`  · ${key}: already enabled`);
        alreadyEnabled++;
      } else {
        console.log(`  · ${key}: row exists with is_enabled=false — leaving as-is (operator chose to disable)`);
        alreadyConfigured++;
      }
      continue;
    }

    await db.execute(sql`
      INSERT INTO org_ai_agent_config (
        organization_id, agent_key, is_enabled, notes
      ) VALUES (
        ${args.orgId}::uuid, ${key}, true, 'MEGA-SPRINT P3.2 seed'
      )
    `);
    console.log(`  ✓ ${key}: enabled`);
    inserted++;
  }

  console.log(`\n  Summary: ${inserted} inserted, ${alreadyEnabled} already on, ${alreadyConfigured} explicitly off`);
  console.log("\nExpected effect:");
  console.log("  AI Hub should show: 'N of 8 live' where N reflects enabled state.");
  console.log("  /dashboard/ai and /development-os/ai-agents both read this table.");
  console.log("\nOperator next step: visit /dashboard/settings/ai-agents/<agent_key>");
  console.log("to paste provider keys + model selection for each agent.");

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
