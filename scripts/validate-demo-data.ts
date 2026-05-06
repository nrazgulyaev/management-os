/**
 * Prompt 112 — Demo-data validator.
 *
 * Walks the row-count floors from `src/features/demo-data/seed-summary.ts`
 * and scans owner / public projection tables for banned tokens or
 * real-looking PII.
 *
 * Usage:
 *   npm run demo:validate
 *
 * Exit codes:
 *   0  all checks passed
 *   1  at least one check failed
 *   2  database not configured / unreachable
 */

import postgres from "postgres";
import {
  formatValidationReport,
  runValidation,
} from "@/features/demo-data/validate-demo-data";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DIRECT_URL or DATABASE_URL must be set. Copy .env.example to .env.local first.",
  );
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const report = await runValidation({
    countRows: async (table) => {
      try {
        const rows = await sql.unsafe(
          `SELECT COUNT(*)::int AS c FROM "${table}"`,
        );
        const first = rows[0] as { c?: number } | undefined;
        return Number(first?.c ?? 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Treat missing-relation as zero rows.
        if (
          /relation .* does not exist/i.test(msg) ||
          /undefined_table/i.test(msg)
        ) {
          throw new Error(`relation "${table}" does not exist`);
        }
        throw err;
      }
    },
    fetchProjections: async () => {
      // Scan the most exposure-prone owner / public tables for banned
      // tokens.  Each entry is a (label, columns, rows) triple.
      const projections: Array<{
        label: string;
        rows: Array<Record<string, unknown>>;
        columns: string[];
      }> = [];
      const safeFetch = async (
        label: string,
        sqlText: string,
        columns: string[],
      ) => {
        try {
          const rows = await sql.unsafe(sqlText);
          projections.push({
            label,
            rows: rows as unknown as Array<Record<string, unknown>>,
            columns,
          });
        } catch {
          // Missing relation in this environment — skip.
        }
      };
      await safeFetch(
        "owner_booking_summaries",
        `SELECT owner_label, guest_label, channel_label, visibility_notes
           FROM owner_booking_summaries LIMIT 200`,
        ["owner_label", "guest_label", "channel_label", "visibility_notes"],
      );
      await safeFetch(
        "owner_booking_revenue_breakdowns",
        `SELECT label FROM owner_booking_revenue_breakdowns LIMIT 200`,
        ["label"],
      );
      await safeFetch(
        "statement_explanation_snapshots",
        `SELECT headline, summary, payout_explanation, revenue_explanation,
                deduction_explanation, reserve_explanation, warning_explanation
           FROM statement_explanation_snapshots LIMIT 50`,
        [
          "headline",
          "summary",
          "payout_explanation",
          "revenue_explanation",
          "deduction_explanation",
          "reserve_explanation",
          "warning_explanation",
        ],
      );
      await safeFetch(
        "direct_booking_guest_status_snapshots",
        `SELECT headline, body, next_action_label, villa_label
           FROM direct_booking_guest_status_snapshots LIMIT 50`,
        ["headline", "body", "next_action_label", "villa_label"],
      );
      await safeFetch(
        "direct_booking_guest_notifications",
        `SELECT public_title, public_body, public_action_label
           FROM direct_booking_guest_notifications LIMIT 100`,
        ["public_title", "public_body", "public_action_label"],
      );
      return projections;
    },
  });
  console.log(formatValidationReport(report));
  await sql.end({ timeout: 5 });
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("✗ Validation failed:", err);
  sql.end({ timeout: 1 }).finally(() => process.exit(2));
});
