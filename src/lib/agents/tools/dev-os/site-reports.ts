import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P3 — Dev OS site reports tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { getSiteReportsActivityForDate } from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory("get_site_reports_for_date", (ctx: AgentExecutionContext) =>
  tool({
    description:
      "Retrieves construction site reports submitted on a specific date: total reports, distinct active projects, total workers present, plus a top-3 sample with weather, reporter role, and a 300-char summary excerpt. Use this once per digest to pull qualitative progress notes.",
    inputSchema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
        .describe(
          "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
        ),
    }),
    execute: async ({ date }) =>
      getSiteReportsActivityForDate({ orgId: ctx.orgId, date }),
  }),
);
