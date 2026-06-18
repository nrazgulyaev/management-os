import "server-only";

import { getOperationsMetrics } from "@/features/operations/services";
import {
  listOperationTasks,
  listMaintenanceTickets,
  listServiceRequests,
} from "@/features/operations/services";
import { listJobRuns } from "@/features/jobs/services";
import { listLowStockItems } from "@/features/inventory/services";
import {
  listBookingConflicts,
  listCalendarFeeds,
} from "@/features/integrations/calendar-sync/services";
import {
  ALLOWED_TOOLS,
  isAllowedTool,
  TOOL_DEFINITIONS,
  type ToolName,
} from "./tools-allowlist";

/**
 * Server-only tool dispatcher. The pure allowlist + schema lives in
 * `tools-allowlist.ts` so tests can verify enforcement without spinning
 * up the data services.
 */

export { ALLOWED_TOOLS, TOOL_DEFINITIONS };
export type { ToolName };

export interface ToolCallResult {
  ok: boolean;
  output?: unknown;
  errorMessage?: string;
}

const MAX_LIMIT = 25;
const clampLimit = (n: unknown, fallback = 10): number => {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.floor(num));
};

/**
 * Execute a tool by name. Unknown tools — even ones that exist on the
 * server but aren't in `ALLOWED_TOOLS` — return `ok: false`. The caller
 * persists this result to `ai_assistant_tool_calls` with status="blocked"
 * so we have an audit trail of any allowlist violation attempt.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  // TENANCY: the run's org (or `null` for the session-less cron = all-orgs
  // sentinel). Threaded into the org-scoped read tools so they don't
  // re-resolve via requireOrgId() (which throws in a session-less context).
  organizationId: string | null = null,
): Promise<ToolCallResult> {
  if (!isAllowedTool(name)) {
    return { ok: false, errorMessage: `tool '${name}' is not on the allowlist` };
  }
  const input = (rawInput && typeof rawInput === "object"
    ? (rawInput as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "getOperationsMetrics": {
        const m = await getOperationsMetrics();
        return { ok: true, output: m };
      }
      case "listOperationTasks": {
        const status = typeof input.status === "string" ? input.status : undefined;
        const limit = clampLimit(input.limit, 10);
        const rows = await listOperationTasks({ status, limit });
        return { ok: true, output: rows };
      }
      case "listBookingConflicts": {
        const status = typeof input.status === "string" ? input.status : undefined;
        const rows = await listBookingConflicts(status ? { status } : undefined);
        return { ok: true, output: rows.slice(0, MAX_LIMIT) };
      }
      case "listLowStockItems": {
        const rows = await listLowStockItems();
        return { ok: true, output: rows };
      }
      case "listJobRuns": {
        const status = typeof input.status === "string" ? input.status : undefined;
        const limit = clampLimit(input.limit, 10);
        const rows = await listJobRuns({ status, limit, organizationId });
        return { ok: true, output: rows };
      }
      case "listCalendarFeeds": {
        const rows = await listCalendarFeeds();
        return { ok: true, output: rows };
      }
      case "listServiceRequests": {
        const status = typeof input.status === "string" ? input.status : undefined;
        const limit = clampLimit(input.limit, 10);
        const rows = await listServiceRequests({ status, limit, organizationId });
        return { ok: true, output: rows };
      }
      case "listMaintenanceTickets": {
        const status = typeof input.status === "string" ? input.status : undefined;
        const limit = clampLimit(input.limit, 10);
        const rows = await listMaintenanceTickets({ status, limit, organizationId });
        return { ok: true, output: rows };
      }
    }
  } catch (e) {
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : "tool execution failed",
    };
  }
  return { ok: false, errorMessage: "tool dispatch fell through" };
}
