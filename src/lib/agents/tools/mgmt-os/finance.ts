import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P2.3 — Mgmt OS finance tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { getFinancialActivityForDate } from "@/features/finance/finance-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory(
  "get_financial_activity_for_date",
  (ctx: AgentExecutionContext) =>
    tool({
      description:
        "Retrieves the day's financial pulse — booking revenue created on the date, owner statements approved/sent, and the current payout queue depth. Use this once per digest to summarize money flow.",
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
          .describe(
            "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
          ),
      }),
      execute: async ({ date }) =>
        getFinancialActivityForDate({ orgId: ctx.orgId, date }),
    }),
);
