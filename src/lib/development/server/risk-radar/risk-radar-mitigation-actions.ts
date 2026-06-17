"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { riskRadarAlerts } from "@/lib/db/schema/executive";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * P1 — Executive risk drill-in mitigation verbs.
 *
 * The generic acknowledge/resolve lifecycle lives in
 * `risk-radar-actions.ts`. These add the design's mitigation context:
 *
 *  - saveMitigationPlan — persists a free-text plan onto the existing
 *    `risk_radar_alerts.notes` column (no migration). State write is
 *    audit-logged.
 *  - briefBoard — records a board brief about the risk (persist into the
 *    mitigation notes + audit event for the leadership paper trail). No
 *    automatic digest fan-out yet; no new table.
 *  - lockPriceAdvanceOrder — records a "lock price / advance order"
 *    decision against the alert (audit-logged) so the procurement team
 *    has a paper trail until the real PO is raised via the RFQ flow.
 *
 * "Issue RFQ to vendors" reuses the existing procurement purchase
 * request create flow via a deep link from the UI — no server action is
 * duplicated here.
 */

const codeSchema = z.string().min(2).max(80);

type Result = { ok: true } | { ok: false; error: string };

/**
 * Load an alert (id + current notes) scoped to the caller's org so we
 * can append rather than clobber, and avoid cross-tenant writes.
 */
async function loadAlertForOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  code: string,
  organizationId: string,
): Promise<{ id: string; notes: string | null } | null> {
  const rows = await db
    .select({ id: riskRadarAlerts.id, notes: riskRadarAlerts.notes })
    .from(riskRadarAlerts)
    .where(
      and(
        eq(riskRadarAlerts.alertCode, code),
        eq(riskRadarAlerts.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

const savePlanSchema = z.object({
  alertCode: codeSchema,
  plan: z.string().max(8000),
});

/**
 * Persist a mitigation plan onto the alert's `notes` column. This is a
 * full replace of the plan body (the editor shows the current value),
 * so the caller owns the final text.
 */
export async function saveMitigationPlan(
  input: z.input<typeof savePlanSchema>,
): Promise<Result> {
  const parsed = savePlanSchema.parse(input);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  try {
    const alert = await loadAlertForOrg(db, parsed.alertCode, organizationId);
    if (!alert) return { ok: false, error: "Alert not found" };
    const next = parsed.plan.trim() || null;
    await db
      .update(riskRadarAlerts)
      .set({ notes: next, updatedAt: new Date() })
      .where(
        and(
          eq(riskRadarAlerts.id, alert.id),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    await recordAuditEvent({
      actorUserId: me.appUser?.id ?? null,
      action: "risk.mitigation_plan.save",
      entityType: "risk_radar_alert",
      entityId: alert.id,
      before: { notes: alert.notes },
      after: { notes: next },
      metadata: { alertCode: parsed.alertCode },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const briefSchema = z.object({
  alertCode: codeSchema,
  brief: z.string().min(3).max(8000),
});

/**
 * Record a board brief about the risk. The composed text is appended to
 * the alert notes under a "Board brief" heading and an audit event is
 * emitted for the leadership paper trail. There is no automatic fan-out
 * to the executive digest yet (the UI copy reflects this), so the brief
 * lives on the alert until a digest author cites it. No PSP, no money write.
 */
export async function briefBoard(
  input: z.input<typeof briefSchema>,
): Promise<Result> {
  const parsed = briefSchema.parse(input);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  try {
    const alert = await loadAlertForOrg(db, parsed.alertCode, organizationId);
    if (!alert) return { ok: false, error: "Alert not found" };
    const stamp = new Date().toISOString();
    const block = `--- Board brief (${stamp}) ---\n${parsed.brief.trim()}`;
    const next = alert.notes ? `${alert.notes}\n\n${block}` : block;
    await db
      .update(riskRadarAlerts)
      .set({ notes: next, updatedAt: new Date() })
      .where(
        and(
          eq(riskRadarAlerts.id, alert.id),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    await recordAuditEvent({
      actorUserId: me.appUser?.id ?? null,
      action: "risk.board_brief.compose",
      entityType: "risk_radar_alert",
      entityId: alert.id,
      after: { brief: parsed.brief.trim() },
      metadata: { alertCode: parsed.alertCode },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const lockPriceSchema = z.object({
  alertCode: codeSchema,
  note: z.string().max(2000).optional(),
});

/**
 * Record a "lock price / advance order" mitigation decision. This is a
 * paper-trail / routing action — the actual PO is raised through the
 * procurement RFQ flow. We append the decision to the alert notes and
 * audit-log it (state write).
 */
export async function lockPriceAdvanceOrder(
  input: z.input<typeof lockPriceSchema>,
): Promise<Result> {
  const parsed = lockPriceSchema.parse(input);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  try {
    const alert = await loadAlertForOrg(db, parsed.alertCode, organizationId);
    if (!alert) return { ok: false, error: "Alert not found" };
    const stamp = new Date().toISOString();
    const body = parsed.note?.trim()
      ? `Lock price / advance order requested (${stamp}): ${parsed.note.trim()}`
      : `Lock price / advance order requested (${stamp}).`;
    const next = alert.notes ? `${alert.notes}\n\n${body}` : body;
    await db
      .update(riskRadarAlerts)
      .set({ notes: next, updatedAt: new Date() })
      .where(
        and(
          eq(riskRadarAlerts.id, alert.id),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    await recordAuditEvent({
      actorUserId: me.appUser?.id ?? null,
      action: "risk.lock_price.request",
      entityType: "risk_radar_alert",
      entityId: alert.id,
      after: { note: parsed.note?.trim() ?? null },
      metadata: { alertCode: parsed.alertCode },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
