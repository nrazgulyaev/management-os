"use server";
import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { offlineActionQueue } from "@/lib/db/schema/pwa";
import { nextOfflineActionCode } from "../push/dispatch-helpers";

const ACTION_TYPES = z.enum([
  "create_site_report",
  "upload_photo",
  "create_qa_qc_issue",
  "record_inventory_movement",
  "submit_purchase_request",
  "log_productivity",
  "add_decision",
  "other",
]);

const submissionSchema = z.object({
  userId: z.string().uuid(),
  clientActionId: z.string().min(2).max(120),
  actionType: ACTION_TYPES,
  actionPayload: z.record(z.unknown()),
  clientInitiatedAt: z.string(),
  deviceSubscriptionId: z.string().uuid().optional(),
});

export interface SubmitOfflineActionResult {
  ok: boolean;
  status?:
    | "received"
    | "duplicate"
    | "completed"
    | "failed";
  actionCode?: string;
  error?: string;
}

/**
 * Receive a single offline action from a client. Deduplicates by
 * (user_id, client_action_id). Append-only — no edit conflict
 * detection in this stage.
 */
export async function submitOfflineAction(
  input: z.input<typeof submissionSchema>,
): Promise<SubmitOfflineActionResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  // Check duplicate via UNIQUE (user_id, client_action_id).
  const existing = await db.execute<{ action_code: string; sync_status: string }>(sql`
    SELECT action_code, sync_status FROM offline_action_queue
     WHERE user_id = ${parsed.data.userId}::uuid
       AND client_action_id = ${parsed.data.clientActionId}
     LIMIT 1
  `);
  const dupRow =
    (existing as unknown as {
      rows: Array<{ action_code: string; sync_status: string }>;
    }).rows?.[0] ?? null;
  if (dupRow) {
    return {
      ok: true,
      status: "duplicate",
      actionCode: dupRow.action_code,
    };
  }

  const yyyy = new Date().getUTCFullYear();
  const seqRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM offline_action_queue
     WHERE action_code LIKE ${`OFFLINE-${yyyy}-%`}
  `);
  const seq = Number(
    (seqRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
  );
  const code = nextOfflineActionCode(yyyy, seq);

  await db.insert(offlineActionQueue).values({
    actionCode: code,
    clientActionId: parsed.data.clientActionId,
    userId: parsed.data.userId,
    deviceSubscriptionId: parsed.data.deviceSubscriptionId ?? null,
    actionType: parsed.data.actionType,
    actionPayload: parsed.data.actionPayload as never,
    clientInitiatedAt: new Date(parsed.data.clientInitiatedAt),
    syncStatus: "received",
  });
  return { ok: true, status: "received", actionCode: code };
}
