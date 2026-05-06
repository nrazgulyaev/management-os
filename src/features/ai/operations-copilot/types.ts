/**
 * Pure types for the Operations Co-pilot v0. No `server-only` import so
 * UI components and tests can share the shape definitions.
 *
 * The Co-pilot is read-only: it surfaces a narrative + structured
 * highlights/risks/actions for the operations dashboard. It never writes
 * to the database, never sends notifications, and never invokes write
 * tools — see `tools.ts` for the strict allowlist.
 */

import { z } from "zod";

export type RiskLevel = "normal" | "elevated" | "high";

export const RISK_LEVELS: readonly RiskLevel[] = ["normal", "elevated", "high"] as const;

/**
 * Structured highlight / risk / action item. Kept deliberately small —
 * the model is asked to emit short, action-oriented strings, not
 * paragraphs. `source` is a free-form pointer the model can populate so
 * the UI can render "from: bookings.conflicts (3)" hints.
 */
export const summaryItemSchema = z.object({
  title: z.string().min(2).max(180),
  detail: z.string().max(400).optional().default(""),
  source: z.string().max(120).optional().default(""),
});
export type SummaryItem = z.infer<typeof summaryItemSchema>;

/**
 * Structured response the Co-pilot returns. Validated with Zod before we
 * persist anything — invalid output falls through to the deterministic
 * fallback in `fallback.ts`.
 */
export const copilotResponseSchema = z.object({
  title: z.string().min(2).max(160),
  executiveSummary: z.string().min(10).max(1200),
  riskLevel: z.enum(["normal", "elevated", "high"]),
  highlights: z.array(summaryItemSchema).max(8).default([]),
  risks: z.array(summaryItemSchema).max(8).default([]),
  recommendedActions: z.array(summaryItemSchema).max(8).default([]),
});
export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

/**
 * Status the assistant run lands on:
 *   - `succeeded` — model returned valid JSON we persisted
 *   - `failed`    — model errored or violated the schema; fallback used
 *   - `fallback`  — AI was disabled / dry-run / no API key; fallback used
 *   - `running`   — in-flight (rare; we mostly write terminal state)
 */
export type RunStatus = "succeeded" | "failed" | "fallback" | "running";

export interface OperationsSnapshot {
  /** When the snapshot was built — used for "as of" labels in the UI. */
  generatedAt: string;
  metrics: {
    openTasks: number;
    overdueTasks: number;
    todaysCheckins: number;
    todaysCheckouts: number;
    bookingConflicts: number;
    lowStockItems: number;
    failedJobsLast24h: number;
    queuedNotifications: number;
  };
  topTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
  conflicts: Array<{
    id: string;
    villaId: string | null;
    detail: string;
    detectedAt: string | null;
  }>;
  lowStock: Array<{
    itemId: string;
    itemName: string;
    villaId: string | null;
    onHand: number;
    parLevel: number;
  }>;
  jobRuns: Array<{
    id: string;
    jobKey: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  serviceRequests: Array<{
    id: string;
    status: string;
    priority: string;
    title: string;
  }>;
  maintenance: Array<{
    id: string;
    status: string;
    priority: string;
    title: string;
  }>;
  feeds: Array<{
    id: string;
    villaId: string;
    syncStatus: string;
    lastSyncedAt: string | null;
  }>;
}

export const OPERATIONS_COPILOT_KEY = "operations_copilot";
