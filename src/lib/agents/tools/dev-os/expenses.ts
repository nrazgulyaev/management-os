import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P3 — Dev OS construction-expenses tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { getConstructionExpensesForDate } from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory(
  "get_construction_expenses_for_date",
  (ctx: AgentExecutionContext) =>
    tool({
      description:
        "Retrieves construction expenses logged on a specific date: outflow count + sum (USD minor), inflow count + sum, count of large outflows (≥90th percentile vs trailing 30 days), and a top-3 sample of outflows with counterparty + description. Use this once per digest to summarize budget activity + flag anomalies.",
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
          .describe(
            "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
          ),
      }),
      execute: async ({ date }) =>
        getConstructionExpensesForDate({ orgId: ctx.orgId, date }),
    }),
);
