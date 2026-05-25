import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P2.3 — Mgmt OS bookings tool.
 *
 * Wraps `getBookingsActivityForDate` (date+org-scoped reader added in
 * the same sprint, P2.2a). Side-effect import: registering the factory
 * happens at module-eval time when the barrel `tools/index.ts` loads.
 */

import { tool } from "ai";
import { z } from "zod";
import { getBookingsActivityForDate } from "@/features/bookings/bookings-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory("get_bookings_for_date", (ctx: AgentExecutionContext) =>
  tool({
    description:
      "Retrieves bookings activity for a specific date. Returns counts for check-ins, check-outs, new reservations, cancellations, plus a top-3 sample of notable arrivals (largest gross revenue). Use this once per digest to summarize the day's booking activity.",
    inputSchema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
        .describe(
          "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
        ),
    }),
    execute: async ({ date }) =>
      getBookingsActivityForDate({ orgId: ctx.orgId, date }),
  }),
);
