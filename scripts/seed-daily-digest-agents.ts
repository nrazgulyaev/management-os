#!/usr/bin/env tsx
/**
 * DAILY-DIGEST-SPRINT-1 P1.4 + P1.5 — provision daily_digest_mgmt
 * and daily_digest_dev agent configs + per-agent Vault entries +
 * digest subscriptions backfill.
 *
 * Idempotent — safe to re-run. The script no-ops on a second call:
 *   · platform_agent_configs rows matched by `agent_code` (ON CONFLICT)
 *   · Vault entries matched by name (skip create if already exists)
 *   · agent_digest_subscriptions matched by unique (agent_code, user_id)
 *
 * Vault strategy: each agent owns its own Vault row named
 * `agent_<agent_id>_api_key` (the convention vault.ts:25 enforces).
 * For now all three platform agents (tax_assistant + the two
 * daily_digest agents) share the SAME Anthropic key value, so this
 * script reads tax_assistant's decrypted secret and replicates it
 * into the two new agents' Vault entries. Single billing source,
 * per-agent retrieval addressability.
 *
 * Subscription backfill (Option B from the spec — two-layered):
 *   · daily_digest_mgmt — every active user in orgs whose
 *     organizations.products_enabled contains 'mgmt'.
 *   · daily_digest_dev — every active user in 'dev'-enabled orgs
 *     WHO ALSO either has a Dev OS cabinet role
 *     (site_supervisor / qs_analyst / cfo_accountant) OR is super_admin.
 *
 *   npm run seed:daily-digest
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const TAX_ASSISTANT_AGENT_CODE = "tax_assistant";

interface AgentSeed {
  agentCode: string;
  displayName: string;
  description: string;
  promptFile: string;
}

const AGENTS: AgentSeed[] = [
  {
    agentCode: "daily_digest_mgmt",
    displayName: "Daily Digest — Operations",
    description:
      "Auto-generated morning summary of yesterday villa rental operations.",
    promptFile: "docs/agents/daily-digest-mgmt-system-prompt.md",
  },
  {
    agentCode: "daily_digest_dev",
    displayName: "Daily Digest — Construction",
    description:
      "Auto-generated morning summary of yesterday construction site activity.",
    promptFile: "docs/agents/daily-digest-dev-system-prompt.md",
  },
];

function asRows<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : [];
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL not set");
    process.exit(2);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("==========================================");
  console.log(" Seed Daily Digest agents + subscriptions");
  console.log("==========================================\n");

  try {
    // -------------------------------------------------------------
    // 0. Sanity — required tables present (migration applied?)
    // -------------------------------------------------------------
    const tablesOk = asRows<{ n: string }>(
      await db.execute(sql`
        SELECT count(*)::text AS n FROM information_schema.tables
         WHERE table_schema='public'
           AND table_name IN ('agent_digest_subscriptions','notifications')
      `),
    );
    if (Number(tablesOk[0]?.n ?? "0") < 2) {
      console.error(
        "✗ migrations 0110 + 0111 not applied — run `npm run migrate:daily-digest` first",
      );
      await client.end();
      process.exit(1);
    }

    // -------------------------------------------------------------
    // 1. Read tax_assistant's Anthropic key from Vault (shared source)
    // -------------------------------------------------------------
    const taxRows = asRows<{ id: string; vault_secret_name: string | null }>(
      await db.execute(sql`
        SELECT id::text AS id, vault_secret_name FROM platform_agent_configs
         WHERE agent_code = ${TAX_ASSISTANT_AGENT_CODE} LIMIT 1
      `),
    );
    if (taxRows.length === 0 || !taxRows[0].vault_secret_name) {
      console.error(
        `✗ ${TAX_ASSISTANT_AGENT_CODE} has no vault_secret_name — set its key first via the platform UI`,
      );
      await client.end();
      process.exit(1);
    }
    const taxVaultName = taxRows[0].vault_secret_name;

    const decRows = asRows<{ decrypted_secret: string }>(
      await db.execute(sql`
        SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = ${taxVaultName} LIMIT 1
      `),
    );
    const sharedKey = decRows[0]?.decrypted_secret;
    if (!sharedKey) {
      console.error(`✗ Vault row '${taxVaultName}' decrypts to NULL`);
      await client.end();
      process.exit(1);
    }
    console.log(
      `  · shared Anthropic key sourced from tax_assistant's Vault row (length=${sharedKey.length}, prefix=${sharedKey.slice(0, 8)}…)`,
    );

    // -------------------------------------------------------------
    // 2. Upsert each agent config + Vault entry
    // -------------------------------------------------------------
    for (const a of AGENTS) {
      console.log(`\n  · ${a.agentCode}`);
      const prompt = readFileSync(resolve(process.cwd(), a.promptFile), "utf8");

      // Upsert config WITHOUT vault_secret_name yet — set after we
      // know the agent_id (Vault row names key off it).
      const inserted = asRows<{ id: string; existed: boolean }>(
        await db.execute(sql`
          INSERT INTO platform_agent_configs (
            agent_code, display_name, description, scope,
            provider, model, system_prompt,
            temperature, max_tokens, budget_monthly_usd_minor, is_active
          ) VALUES (
            ${a.agentCode}, ${a.displayName}, ${a.description}, 'global',
            'anthropic', 'claude-sonnet-4-6', ${prompt},
            0.3, 2000, 5000, true
          )
          ON CONFLICT (agent_code) DO UPDATE SET
            display_name  = EXCLUDED.display_name,
            description   = EXCLUDED.description,
            system_prompt = EXCLUDED.system_prompt,
            updated_at    = now()
          RETURNING id::text AS id, (xmax = 0) AS existed
        `),
      );
      const agentId = inserted[0].id;
      const wasNew = inserted[0].existed;
      console.log(
        `      config: ${wasNew ? "✓ inserted" : "✓ updated"} id=${agentId.slice(0, 8)}…`,
      );

      // Vault row name follows the vault.ts convention.
      const secretName = `agent_${agentId}_api_key`;
      const existing = asRows<{ id: string }>(
        await db.execute(sql`
          SELECT id::text AS id FROM vault.secrets WHERE name = ${secretName} LIMIT 1
        `),
      );
      if (existing.length > 0) {
        console.log(`      vault:  ✓ already present (${secretName})`);
      } else {
        await db.execute(sql`
          SELECT vault.create_secret(
            ${sharedKey},
            ${secretName},
            ${`Daily Digest shared Anthropic key (mirrors ${taxVaultName})`}
          )
        `);
        console.log(`      vault:  ✓ created ${secretName}`);
      }

      await db.execute(sql`
        UPDATE platform_agent_configs
           SET vault_secret_name = ${secretName}
         WHERE id = ${agentId}::uuid
      `);
    }

    // -------------------------------------------------------------
    // 3. Backfill subscriptions
    // -------------------------------------------------------------
    console.log("\n  · backfilling subscriptions");

    const mgmtInserted = asRows<{ n: string }>(
      await db.execute(sql`
        WITH ins AS (
          INSERT INTO agent_digest_subscriptions (agent_code, user_id, org_id)
          SELECT 'daily_digest_mgmt', u.id, u.organization_id
            FROM app_users u
            JOIN organizations o ON o.id = u.organization_id
           WHERE u.status = 'active'
             AND 'mgmt' = ANY(o.products_enabled)
          ON CONFLICT (agent_code, user_id) DO NOTHING
          RETURNING 1
        )
        SELECT count(*)::text AS n FROM ins
      `),
    );
    const mgmtN = Number(mgmtInserted[0]?.n ?? "0");

    const devInserted = asRows<{ n: string }>(
      await db.execute(sql`
        WITH ins AS (
          INSERT INTO agent_digest_subscriptions (agent_code, user_id, org_id)
          SELECT 'daily_digest_dev', u.id, u.organization_id
            FROM app_users u
            JOIN organizations o ON o.id = u.organization_id
           WHERE u.status = 'active'
             AND 'dev' = ANY(o.products_enabled)
             AND (
               EXISTS (
                 SELECT 1 FROM app_user_roles aur
                  WHERE aur.user_id = u.id
                    AND aur.is_active = true
                    AND aur.role_key IN ('site_supervisor','qs_analyst','cfo_accountant')
               )
               OR EXISTS (
                 SELECT 1 FROM user_roles ur
                   JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.key = 'super_admin'
               )
             )
          ON CONFLICT (agent_code, user_id) DO NOTHING
          RETURNING 1
        )
        SELECT count(*)::text AS n FROM ins
      `),
    );
    const devN = Number(devInserted[0]?.n ?? "0");

    console.log(`      daily_digest_mgmt: +${mgmtN} new subscriptions`);
    console.log(`      daily_digest_dev:  +${devN} new subscriptions`);

    // -------------------------------------------------------------
    // 4. Totals + Ali sanity check
    // -------------------------------------------------------------
    const totals = asRows<{ agent_code: string; n: string }>(
      await db.execute(sql`
        SELECT agent_code, count(*)::text AS n
          FROM agent_digest_subscriptions
         WHERE is_enabled = true
         GROUP BY agent_code ORDER BY agent_code
      `),
    );
    console.log("\n  · subscription totals (enabled):");
    for (const t of totals) {
      console.log(`      ${t.agent_code}: ${t.n}`);
    }

    const ali = asRows<{ agent_code: string }>(
      await db.execute(sql`
        SELECT s.agent_code FROM agent_digest_subscriptions s
          JOIN app_users u ON u.id = s.user_id
         WHERE u.email = 'ali-test@arconique.local' AND s.is_enabled = true
         ORDER BY s.agent_code
      `),
    );
    const aliCodes = ali.map((r) => r.agent_code);
    const aliHasBoth =
      aliCodes.includes("daily_digest_mgmt") &&
      aliCodes.includes("daily_digest_dev");
    console.log(
      `\n  · ali-test subscribed: ${aliCodes.join(", ") || "(none)"} ${aliHasBoth ? "✓" : "✗ MISSING DIGEST"}`,
    );
    if (!aliHasBoth) {
      console.error(
        "      Daily Digest dev access did not include ali-test — re-check cabinet role assignment",
      );
    }

    console.log("\n✓ Seed complete.\n");
  } catch (e) {
    console.error("FATAL:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
