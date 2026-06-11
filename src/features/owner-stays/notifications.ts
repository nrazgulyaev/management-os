import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { villas } from "@/lib/db/schema/projects";
import { queueNotification } from "@/features/notifications/services";
import {
  mapStatusTransitionToTemplate,
  OWNER_STAY_TEMPLATE_COPY,
  type OwnerStayTemplateKey,
} from "./notification-templates";

/**
 * V9C — owner-stay notification helpers (DB-aware). The pure registry
 * + transition mapper live in `./notification-templates.ts`. Best-
 * effort: every helper swallows errors so a failed enqueue never blocks
 * the underlying owner-stay action. The queue itself is idempotent via
 * `dedupeKey`.
 */

export type { OwnerStayTemplateKey };
export { mapStatusTransitionToTemplate };

interface OwnerStayContext {
  ownerId: string;
  /** Org anchor — owner_stay_requests.organization_id (NOT NULL since 0158). */
  organizationId: string;
  villaCode: string | null;
  requestedStart: string;
  requestedEnd: string;
}

async function loadOwnerStayContext(
  requestId: string,
): Promise<OwnerStayContext | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      ownerId: ownerStayRequests.ownerId,
      organizationId: ownerStayRequests.organizationId,
      requestedStart: ownerStayRequests.requestedStart,
      requestedEnd: ownerStayRequests.requestedEnd,
      villaCode: villas.unitCode,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .where(eq(ownerStayRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  return {
    ownerId: row.ownerId,
    organizationId: row.organizationId,
    villaCode: row.villaCode ?? null,
    requestedStart: row.requestedStart as unknown as string,
    requestedEnd: row.requestedEnd as unknown as string,
  };
}

/**
 * Queue an in-app owner-stay notification by template. Idempotent via
 * `dedupeKey = "{templateKey}:{requestId}:{transition?}"`.
 */
export async function queueOwnerStayNotification(
  requestId: string,
  templateKey: OwnerStayTemplateKey,
  opts?: { transition?: string },
): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await loadOwnerStayContext(requestId);
  if (!ctx) return { ok: false, reason: "owner_stay request not found" };
  const copy = OWNER_STAY_TEMPLATE_COPY[templateKey];
  if (!copy) return { ok: false, reason: `unknown template: ${templateKey}` };

  const dedupeKey = opts?.transition
    ? `${templateKey}:${requestId}:${opts.transition}`
    : `${templateKey}:${requestId}`;

  const payload = {
    ownerStayRequestId: requestId,
    villa: ctx.villaCode ?? "your villa",
    checkIn: ctx.requestedStart,
    checkOut: ctx.requestedEnd,
  };

  try {
    await queueNotification({
      recipientType: "owner",
      recipientId: ctx.ownerId,
      organizationId: ctx.organizationId,
      channel: "in_app",
      templateKey,
      title: copy.title,
      body: copy.body
        .replace("{{villa}}", payload.villa)
        .replace("{{checkIn}}", payload.checkIn)
        .replace("{{checkOut}}", payload.checkOut),
      payload,
      priority: "normal",
      dedupeKey,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "queue failed",
    };
  }
}

/**
 * Queue the right notification for a status transition. The mapping is
 * intentionally narrow — only the transitions owners care about emit a
 * notification. Internal-only transitions (e.g. requested →
 * pending_admin_approval) stay quiet.
 */
export async function queueOwnerStayStatusChangedNotification(
  requestId: string,
  oldStatus: string,
  newStatus: string,
): Promise<{ ok: boolean; templateKey?: OwnerStayTemplateKey }> {
  const key = mapStatusTransitionToTemplate(oldStatus, newStatus);
  if (!key) return { ok: true };
  const out = await queueOwnerStayNotification(requestId, key, {
    transition: `${oldStatus}->${newStatus}`,
  });
  return { ok: out.ok, templateKey: key };
}

