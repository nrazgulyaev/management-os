import { type NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { submitOfflineAction } from "@/lib/development/server/offline-sync/sync-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface IncomingPayload {
  clientActionId: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  clientInitiatedAt: string;
  deviceSubscriptionId?: string;
}

export async function POST(request: NextRequest) {
  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: IncomingPayload | IncomingPayload[];
  try {
    body = (await request.json()) as IncomingPayload | IncomingPayload[];
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(body) ? body : [body];
  const processed: Array<{ clientActionId: string; status: string; actionCode?: string }> = [];
  const failed: Array<{ clientActionId: string; reason: string }> = [];
  for (const item of items) {
    try {
      const result = await submitOfflineAction({
        userId: me.id,
        clientActionId: item.clientActionId,
        actionType:
          item.actionType as "create_site_report" | "upload_photo" | "create_qa_qc_issue" |
          "record_inventory_movement" | "submit_purchase_request" | "log_productivity" |
          "add_decision" | "other",
        actionPayload: item.actionPayload,
        clientInitiatedAt: item.clientInitiatedAt,
        deviceSubscriptionId: item.deviceSubscriptionId,
      });
      if (result.ok) {
        processed.push({
          clientActionId: item.clientActionId,
          status: result.status ?? "received",
          actionCode: result.actionCode,
        });
      } else {
        failed.push({
          clientActionId: item.clientActionId,
          reason: result.error ?? "unknown",
        });
      }
    } catch (e) {
      failed.push({
        clientActionId: item.clientActionId,
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }
  return NextResponse.json({ ok: true, processed, failed });
}
