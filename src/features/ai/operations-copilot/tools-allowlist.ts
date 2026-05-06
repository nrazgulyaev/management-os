/**
 * Pure tool allowlist + schema. No `server-only` import, no DB —
 * imported by both the (server-only) executor in `tools.ts` and by the
 * tests that verify allowlist enforcement without spinning up the
 * services.
 */

export type ToolName =
  | "getOperationsMetrics"
  | "listOperationTasks"
  | "listBookingConflicts"
  | "listLowStockItems"
  | "listJobRuns"
  | "listCalendarFeeds"
  | "listServiceRequests"
  | "listMaintenanceTickets";

export const ALLOWED_TOOLS: ReadonlyArray<ToolName> = [
  "getOperationsMetrics",
  "listOperationTasks",
  "listBookingConflicts",
  "listLowStockItems",
  "listJobRuns",
  "listCalendarFeeds",
  "listServiceRequests",
  "listMaintenanceTickets",
] as const;

export interface ToolDefinition {
  name: ToolName;
  description: string;
  input_schema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "getOperationsMetrics",
    description:
      "Return aggregated operations counters: open tasks, overdue tasks, today's check-ins/outs, booking conflicts, low-stock items, failed jobs in last 24h, queued notifications. No arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listOperationTasks",
    description:
      "List operation tasks (housekeeping, maintenance, concierge). Optional filters: status, limit (capped server-side at 25).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "in_progress", "blocked", "done", "cancelled"] },
        limit: { type: "number", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listBookingConflicts",
    description:
      "List unresolved cross-channel booking conflicts detected by the calendar-sync engine. Returns conflict type, villa, detection time.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listLowStockItems",
    description:
      "List inventory items currently below par level across all locations. No arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listJobRuns",
    description:
      "List the most recent background-job runs. Useful for spotting failed cron / pipeline jobs.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
        limit: { type: "number", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listCalendarFeeds",
    description:
      "List configured channel calendar feeds (Booking.com, Airbnb, Vrbo …) along with their last sync time and current sync status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listServiceRequests",
    description:
      "List active service requests raised by guests / staff (open, acknowledged, in progress).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listMaintenanceTickets",
    description:
      "List active maintenance tickets — issues raised against villa systems / fittings.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
  },
];

export function isAllowedTool(name: string): name is ToolName {
  return (ALLOWED_TOOLS as ReadonlyArray<string>).includes(name);
}
