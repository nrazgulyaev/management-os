import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P2.3 — Mgmt OS operations tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { getOperationalIncidentsForDate } from "@/features/operations/operations-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory(
  "get_operational_incidents_for_date",
  (ctx: AgentExecutionContext) =>
    tool({
      description:
        "Retrieves operational incidents logged on a specific date — maintenance tickets opened/resolved, currently-open high-severity tickets, new service requests, plus a top-3 sample of the most urgent new tickets. Use this once per digest to surface 'what needs attention'.",
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
          .describe(
            "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
          ),
      }),
      execute: async ({ date }) =>
        getOperationalIncidentsForDate({ orgId: ctx.orgId, date }),
    }),
);
