import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P3 — Dev OS milestone changes tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { getMilestoneChangesForDate } from "@/lib/development/server/cabinets/project-manager-cabinet-queries";
import {
  registerToolFactory,
  type AgentExecutionContext,
} from "../registry";

registerToolFactory(
  "get_milestone_changes_for_date",
  (ctx: AgentExecutionContext) =>
    tool({
      description:
        "Retrieves project milestone transitions on a specific date: work packages completed/started, project phases entered/completed, plus a top-6 sample with project context. Use this once per digest to surface phase transitions and work-package completions.",
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD")
          .describe(
            "ISO date in YYYY-MM-DD format. Use yesterday's date in the user's local timezone.",
          ),
      }),
      execute: async ({ date }) =>
        getMilestoneChangesForDate({ orgId: ctx.orgId, date }),
    }),
);
