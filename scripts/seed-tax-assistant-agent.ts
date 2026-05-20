#!/usr/bin/env tsx
/**
 * P5.5.1 AGENT-TAX-SEED — provision the platform's first user-facing
 * agent (Tax Assistant) + subscribe Arconique to it.
 *
 * Idempotent — safe to re-run. The script no-ops on a second call:
 *   · platform_agent_configs row matched by `agent_code = 'tax_assistant'`
 *   · org_agent_subscriptions row matched by (organization_id, agent_id)
 *
 * Defaults to (provider='anthropic', model='claude-sonnet-4-6') since
 * Anthropic models handle regulation interpretation + multi-language
 * (Bahasa Indonesia ↔ English) better than gpt-4o-mini in our tests.
 * Override with env:
 *
 *   PROVIDER=openai MODEL=gpt-4o-mini npm run seed:tax-assistant-agent
 *
 * The script does NOT set an API key — that lands via the platform
 * admin UI (Vault). Until a key is added, `vault_secret_name` is NULL
 * and inference will 503.
 *
 *   npm run seed:tax-assistant-agent
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const AGENT_CODE = "tax_assistant";
const ARCONIQUE_ORG_CODE = "ARCONIQUE_DEFAULT";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a tax assistant specialised in Indonesian villa rental operations in Bali. You help villa operators understand tax obligations including:
- PPh 21 (income tax)
- PB1 (regional tourism tax)
- PPh Final 4(2) (final rental income tax)
- PPN (VAT) for tourism services

Answer based on provided knowledge base context. Cite specific regulations when possible. If information isn't in the context, say so explicitly instead of guessing. Provide Indonesian terms with English explanations.`;

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

async function main(): Promise<void> {
  const provider = (process.env.PROVIDER ?? DEFAULT_PROVIDER).toLowerCase();
  const model = process.env.MODEL ?? DEFAULT_MODEL;

  console.log("=================================================");
  console.log(" P5.5.1 — Seed Tax Assistant agent + subscription");
  console.log("=================================================");
  console.log(`  provider: ${provider}`);
  console.log(`  model:    ${model}\n`);

  const db = getDb();

  // -------------------------------------------------------------------
  // 1. Resolve Arconique org_id
  // -------------------------------------------------------------------
  const orgRows = asRows<{ id: string; name: string }>(
    await db.execute(sql`
      SELECT id::text AS id, display_name AS name
        FROM organizations
       WHERE organization_code = ${ARCONIQUE_ORG_CODE}
       LIMIT 1
    `),
  );

  if (orgRows.length === 0) {
    console.error(
      `✗ No organization with code '${ARCONIQUE_ORG_CODE}' found.`,
    );
    console.error("  Run the org bootstrap before seeding agents.");
    await closeDb();
    process.exit(1);
  }
  const org = orgRows[0];
  console.log(`✓ Arconique org: ${org.name} (${org.id})`);

  // -------------------------------------------------------------------
  // 2. Upsert platform_agent_configs row
  // -------------------------------------------------------------------
  const existing = asRows<{ id: string }>(
    await db.execute(sql`
      SELECT id::text AS id FROM platform_agent_configs
       WHERE agent_code = ${AGENT_CODE}
       LIMIT 1
    `),
  );

  let agentId: string;

  if (existing.length > 0) {
    agentId = existing[0].id;
    console.log(`✓ Agent already exists: ${AGENT_CODE} (${agentId}) — no change.`);
  } else {
    const inserted = asRows<{ id: string }>(
      await db.execute(sql`
        INSERT INTO platform_agent_configs (
          agent_code, display_name, description, scope,
          provider, model, system_prompt,
          temperature, max_tokens, budget_monthly_usd_minor, is_active
        ) VALUES (
          ${AGENT_CODE},
          ${"Tax Assistant"},
          ${"AI assistant for Indonesian villa tax questions (PPh 21, PB1, PPh Final, PPN)"},
          ${"global"},
          ${provider},
          ${model},
          ${SYSTEM_PROMPT},
          ${"0.3"},
          ${2000},
          ${5000},
          ${true}
        )
        RETURNING id::text AS id
      `),
    );
    agentId = inserted[0].id;
    console.log(`✓ Created agent: ${AGENT_CODE} (${agentId})`);
  }

  // -------------------------------------------------------------------
  // 3. Upsert org_agent_subscriptions row (idempotent on the unique
  //    constraint org_agent_subscriptions_unique).
  // -------------------------------------------------------------------
  await db.execute(sql`
    INSERT INTO org_agent_subscriptions (
      organization_id, agent_id, is_enabled, enabled_at
    ) VALUES (
      ${org.id}::uuid,
      ${agentId}::uuid,
      ${true},
      now()
    )
    ON CONFLICT (organization_id, agent_id) DO UPDATE
       SET is_enabled = EXCLUDED.is_enabled,
           updated_at = now()
  `);

  console.log(`✓ Subscribed ${org.name} to ${AGENT_CODE}\n`);

  console.log("=================================================");
  console.log(" DONE — Next steps");
  console.log("=================================================");
  console.log("  1. Visit /platform/agents/${agentId} (or /platform/agents)");
  console.log("  2. Open Config tab → set the provider API key (Vault)");
  console.log("  3. Open Knowledge tab → upload tax-regulation PDFs");
  console.log(
    "  4. Open Test tab (super_admin) or visit /development-os/agents/tax_assistant\n",
  );

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
