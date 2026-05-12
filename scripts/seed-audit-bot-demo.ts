/**
 * Stage 10.6.B.1 — Audit-bot demo seed.
 *
 * Solves the empty-cabinets problem documented in
 * docs/stage-10-6-a-audit/05-cross-cutting/demo-data-quality.md.
 *
 * What it does:
 *   1. Resolves the audit-bot user (app_users row created by
 *      bootstrap-admin.ts) and ARCONIQUE_DEFAULT organization.
 *   2. Creates an "Audit Bot Owner" (owners) record + grants the
 *      audit-bot app_user access via app_users_owners.
 *   3. Picks 3 existing villas (any project) and creates
 *      ownership_shares for the audit-bot's owner record.
 *   4. Inserts a villa_health_snapshot per villa (2 of 3 healthy + 1
 *      "watch") so Owner cabinet KPIs + alerts populate.
 *   5. Inserts a manager_performance_metrics row for audit-bot so
 *      Sales cabinet weekly snapshot populates.
 *   6. Inserts 1 sample agent_outputs row per of the 5 user-runnable
 *      agents (qs_cost_analyst, procurement_analyst, tax_assistant,
 *      marketing_assistant, executive_business, daily_digest,
 *      weekly_plan) so each cabinet's "Latest analysis" tile
 *      populates.
 *   7. Inserts 1 executive_metrics_snapshot (scope='company_wide') so
 *      CFO cabinet renders.
 *
 * Idempotent: every INSERT uses ON CONFLICT DO NOTHING or pre-checks
 * existence. Safe to run repeatedly.
 *
 * Production guard: requires `ALLOW_AUDIT_DEMO_SEED=1` env var.
 * Without it, the script prints what it would do and exits without
 * touching the database.
 *
 * Why this gate exists: the project's existing
 * scripts/seed-production-minimal.ts policy says "Demo owners /
 * villas / bookings / guests / tokens / MFA factors are NEVER
 * created in production." This audit-bot seed does NOT create any
 * villas / bookings / guests / tokens / MFA — it only creates an
 * AUDIT-OBSERVABILITY layer (owner grant + health snapshots + agent
 * outputs + metrics) on top of EXISTING demo data. The gate makes
 * the operator's intent explicit per-run.
 *
 * Usage:
 *   ALLOW_AUDIT_DEMO_SEED=1 node --env-file=.env.production.local \
 *     --import tsx scripts/seed-audit-bot-demo.ts
 */

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const URL_ENV = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!URL_ENV) {
  console.error(
    "DIRECT_URL or DATABASE_URL must be set. Load .env.production.local first.",
  );
  process.exit(2);
}
const url: string = URL_ENV;

const ALLOW = process.env.ALLOW_AUDIT_DEMO_SEED === "1";
const AUDIT_BOT_EMAIL =
  process.env.AUDIT_BOT_EMAIL ?? "audit-bot@arconique.com";
const ORG_CODE = process.env.AUDIT_BOT_ORG_CODE ?? "ARCONIQUE_DEFAULT";

const RUNNABLE_AGENTS = [
  "qs_cost_analyst",
  "procurement_analyst",
  "tax_assistant",
  "marketing_assistant",
  "executive_business",
  "daily_digest",
  "weekly_plan",
] as const;

async function main(): Promise<void> {
  console.log("Audit-bot demo seed");
  console.log("===================");
  console.log(`Audit-bot email: ${AUDIT_BOT_EMAIL}`);
  console.log(`Target org code: ${ORG_CODE}`);
  console.log("");

  if (!ALLOW) {
    console.warn(
      "DRY RUN: ALLOW_AUDIT_DEMO_SEED is not set — refusing to write to the database.",
    );
    console.warn(
      "Re-run with ALLOW_AUDIT_DEMO_SEED=1 to actually seed. Demo data will be:",
    );
    console.warn("  - 1 owners row ('Audit Bot Owner') + app_users_owners grant");
    console.warn("  - 3 ownership_shares linking the owner to existing villas");
    console.warn("  - 3 villa_health_snapshots (2 healthy + 1 watch)");
    console.warn(
      "  - 1 manager_performance_metrics row (period: current week)",
    );
    console.warn(
      `  - ${RUNNABLE_AGENTS.length} agent_outputs rows (1 per runnable agent)`,
    );
    console.warn("  - 1 executive_metrics_snapshot (scope=company_wide)");
    process.exit(0);
  }

  const sql = postgres(url, { max: 1, prepare: false });

  try {
    // 1. Resolve org + audit-bot app_user.
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations
       WHERE organization_code = ${ORG_CODE}
       LIMIT 1
    `;
    if (!org) {
      console.error(
        `Organization with code "${ORG_CODE}" not found. Run bootstrap-admin first.`,
      );
      process.exit(1);
    }
    const orgId = org.id;
    console.log(`✓ Org "${ORG_CODE}" → ${orgId}`);

    const [auditUser] = await sql<{ id: string }[]>`
      SELECT id FROM app_users
       WHERE email = ${AUDIT_BOT_EMAIL}
       LIMIT 1
    `;
    if (!auditUser) {
      console.error(
        `Audit-bot app_user with email "${AUDIT_BOT_EMAIL}" not found.`,
      );
      console.error(
        "Run scripts/create-audit-bot.ts then scripts/bootstrap-admin.ts first.",
      );
      process.exit(1);
    }
    const auditUserId = auditUser.id;
    console.log(`✓ Audit-bot app_user → ${auditUserId}`);

    // 2. Create or reuse "Audit Bot Owner".
    const [existingOwner] = await sql<{ id: string }[]>`
      SELECT id FROM owners WHERE display_name = 'Audit Bot Owner' LIMIT 1
    `;
    let auditOwnerId: string;
    if (existingOwner) {
      auditOwnerId = existingOwner.id;
      console.log(`✓ Owner already exists → ${auditOwnerId}`);
    } else {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO owners (id, type, display_name, email, status)
        VALUES (${randomUUID()}, 'individual', 'Audit Bot Owner',
                ${AUDIT_BOT_EMAIL}, 'active')
        RETURNING id
      `;
      auditOwnerId = created.id;
      console.log(`✓ Created Audit Bot Owner → ${auditOwnerId}`);
    }

    // 3. Grant audit-bot app_user access to the owner.
    await sql`
      INSERT INTO app_users_owners (id, app_user_id, owner_id, grant_type, status)
      VALUES (${randomUUID()}, ${auditUserId}, ${auditOwnerId},
              'owner_portal', 'active')
      ON CONFLICT DO NOTHING
    `;
    console.log("✓ Granted audit-bot owner access");

    // 4. Pick 3 existing villas + create ownership_shares.
    const villas = await sql<{ id: string; project_id: string | null }[]>`
      SELECT id, project_id FROM villas
       ORDER BY created_at ASC
       LIMIT 3
    `;
    if (villas.length === 0) {
      console.warn(
        "⚠ No villas found in DB. Skipping ownership_shares + health_snapshots.",
      );
    } else {
      console.log(`✓ Found ${villas.length} villas to attach ownership to`);
      for (const v of villas) {
        await sql`
          INSERT INTO ownership_shares
            (id, owner_id, villa_id, project_id, share_percent, model,
             starts_on, status)
          SELECT ${randomUUID()}, ${auditOwnerId}, ${v.id}, ${v.project_id},
                 100.0, 'individual', CURRENT_DATE - INTERVAL '90 days',
                 'active'
           WHERE NOT EXISTS (
             SELECT 1 FROM ownership_shares
              WHERE owner_id = ${auditOwnerId}
                AND villa_id = ${v.id}
                AND status = 'active'
           )
        `;
      }
      console.log(`✓ ownership_shares ensured (${villas.length})`);

      // 5. Insert villa_health_snapshots — 2 healthy + 1 watch.
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getTime() - 30 * 86400 * 1000)
        .toISOString()
        .slice(0, 10);
      const healthStatuses = ["good", "good", "watch"];
      const healthScores = ["88.00", "82.00", "55.00"];
      for (let i = 0; i < villas.length; i++) {
        const v = villas[i];
        await sql`
          INSERT INTO villa_health_snapshots
            (id, villa_id, project_id, period_start, period_end,
             occupancy_rate, booked_nights, owner_stay_nights,
             housekeeping_tasks_completed, maintenance_tickets_open,
             maintenance_tickets_completed, average_review_rating,
             negative_review_count, health_score, health_status)
          VALUES (${randomUUID()}, ${v.id}, ${v.project_id},
                  ${periodStart}, ${periodEnd},
                  '0.7400', 22, 0, 18, ${i === 2 ? 3 : 1},
                  ${i === 2 ? 2 : 4}, ${i === 2 ? "3.20" : "4.50"},
                  ${i === 2 ? 1 : 0}, ${healthScores[i]},
                  ${healthStatuses[i]})
          ON CONFLICT (villa_id, period_start, period_end) DO NOTHING
        `;
      }
      console.log("✓ villa_health_snapshots ensured");
    }

    // 6. manager_performance_metrics — current week, audit-bot as manager.
    const weekStart = (() => {
      const d = new Date();
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setUTCDate(diff);
      return monday.toISOString().slice(0, 10);
    })();
    const weekEnd = (() => {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().slice(0, 10);
    })();
    // Migration 0072 (Stage 5.J.2) added organization_id NOT NULL to
    // a Dev OS allow-list of tables. The Drizzle schema files weren't
    // updated, so the first seed run hit a NOT NULL violation. All
    // INSERTs below now thread `orgId` through.
    await sql`
      INSERT INTO manager_performance_metrics
        (id, organization_id, manager_id, period_start, period_end,
         period_type, total_leads_assigned, total_conversations_active,
         reservations_secured, contracts_signed,
         lead_to_reservation_rate, average_response_time_minutes,
         ai_quality_score)
      VALUES (${randomUUID()}, ${orgId}, ${auditUserId},
              ${weekStart}, ${weekEnd}, 'weekly',
              12, 4, 2, 1, '16.50', '23.00', '85.00')
      ON CONFLICT (manager_id, period_start, period_end, period_type)
      DO NOTHING
    `;
    console.log("✓ manager_performance_metrics ensured");

    // 7. agent_outputs — 1 per runnable agent. organization_id NOT NULL
    // per migration 0072 (Stage 5.J.2 propagation).
    for (const agentKey of RUNNABLE_AGENTS) {
      const code = `AUDIT-${agentKey.toUpperCase()}-${Date.now()
        .toString()
        .slice(-6)}`;
      await sql`
        INSERT INTO agent_outputs
          (id, organization_id, output_code, agent_key,
           output_category, title, summary, detailed_output, status)
        SELECT ${randomUUID()}, ${orgId}, ${code}, ${agentKey},
               'audit_seed',
               ${"Sample " + agentKey + " output"},
               ${"Demo output seeded by audit-bot. Replace with a real run from /development-os/ai-agents/" + agentKey + "."},
               ${'{"seeded": true, "by": "audit-bot-demo"}'}::jsonb,
               'awaiting_review'
         WHERE NOT EXISTS (
           SELECT 1 FROM agent_outputs
            WHERE agent_key = ${agentKey}
              AND output_category = 'audit_seed'
         )
      `;
    }
    console.log(
      `✓ agent_outputs ensured (${RUNNABLE_AGENTS.length} agent samples)`,
    );

    // 8. executive_metrics_snapshot — single company-wide row.
    // organization_id NOT NULL per migration 0072.
    await sql`
      INSERT INTO executive_metrics_snapshots
        (id, organization_id, snapshot_date, snapshot_type, scope,
         total_cash_on_hand_minor, total_receivables_minor,
         payables_due_next_30_days_minor, payables_overdue_minor,
         cash_at_30_days_minor, cash_at_60_days_minor,
         cash_at_90_days_minor, unclassified_transactions_count,
         active_projects_count, active_leads_count,
         hot_leads_count, reservations_count,
         total_committed_capital_minor, total_drawn_capital_minor,
         pending_distribution_minor, base_currency)
      SELECT ${randomUUID()}, ${orgId}, CURRENT_DATE, 'daily', 'company_wide',
             550000000000, 80000000000, 120000000000, 0,
             430000000000, 380000000000, 320000000000, 3,
             3, 12, 4, 2,
             2500000000000, 1800000000000, 50000000000, 'IDR'
       WHERE NOT EXISTS (
         SELECT 1 FROM executive_metrics_snapshots
          WHERE scope = 'company_wide'
            AND project_id IS NULL
            AND snapshot_date = CURRENT_DATE
       )
    `;
    console.log("✓ executive_metrics_snapshot ensured (today, company_wide)");

    console.log("");
    console.log("Done. Audit-bot should now see populated cabinets.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
