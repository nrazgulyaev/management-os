"use server";

/**
 * Owner-CHURN drill-in — write side.
 *
 * Four actions, all gated on `owners.write` (the same permission the
 * owner CRUD actions use) and all audit-logged via recordAuditEvent:
 *
 *   runChurnAnalysisAction      recompute the score and fire a dated
 *                               "Churn analysis" insight (the feed's
 *                               Run-analysis button)
 *   scheduleFounderCallAction   open a "founder call" intervention
 *   offerServiceCompAction      open a "service comp" intervention
 *   markInterventionStartedAction  open a generic "intervention started"
 *   resolveInterventionAction   close an open intervention (dismiss with
 *                               reason `acted`)
 *
 * Interventions persist as `owner_insights` rows (no new table) — see
 * retention-churn-service.ts for the payload convention.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ownerInsights } from "@/lib/db/schema/owner-insights";
import { owners } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import { listOwnershipShares } from "./services";
import { getOwnerRetentionRisk } from "./retention-risk-service";
import { computeChurnScore, INTERVENTION_LABEL, type InterventionKind } from "./retention-churn";
import { CHURN_INSIGHT_SOURCE } from "./retention-churn-service";

export type ChurnActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const ownerIdSchema = z.string().uuid();
const interventionIdSchema = z.string().uuid();

async function ownerVillaIds(ownerId: string): Promise<string[]> {
  const shares = await listOwnershipShares();
  return [
    ...new Set(
      shares
        .filter((s) => s.ownerId === ownerId)
        .map((s) => s.villaId)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

/** Band → insight level (act > watch > info). */
function levelForBand(band: "ok" | "watch" | "flag"): "info" | "watch" | "act" {
  return band === "flag" ? "act" : band === "watch" ? "watch" : "info";
}

/** Run-analysis — recompute the churn score and snapshot it as an insight. */
export async function runChurnAnalysisAction(
  _prev: ChurnActionResult | null,
  formData: FormData,
): Promise<ChurnActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = ownerIdSchema.safeParse(formData.get("ownerId"));
  if (!parsed.success) return { ok: false, error: "Missing owner id." };
  const ownerId = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const villaIds = await ownerVillaIds(ownerId);
  const risk = await getOwnerRetentionRisk(ownerId, villaIds).catch(() => null);
  const breakdown = computeChurnScore(risk ?? { level: "ok", signals: [] });

  const me = await getCurrentAppUser();
  // Org anchor (TENANCY 0158) — owner → ownership_shares → project.org.
  const organizationId = await getOwnerOrgId(ownerId);
  if (!organizationId) {
    return { ok: false, error: "Could not resolve the owner's organisation." };
  }
  await db.insert(ownerInsights).values({
    organizationId,
    ownerId,
    kind: "other",
    level: levelForBand(breakdown.band),
    payload: {
      source: CHURN_INSIGHT_SOURCE,
      churnKind: "analysis",
      title: `Churn analysis — score ${breakdown.score}/100 (${breakdown.band})`,
      detail: breakdown.summary,
      score: breakdown.score,
      band: breakdown.band,
      contributions: breakdown.contributions,
    },
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.churn.analyze",
    entityType: "owner",
    entityId: ownerId,
    after: { score: breakdown.score, band: breakdown.band },
  });

  revalidatePath(`/dashboard/owners/${ownerId}`);
  return { ok: true, message: `Analysis run — churn score ${breakdown.score}/100.` };
}

/** Shared opener for the three named interventions. */
async function openIntervention(
  ownerId: string,
  churnKind: InterventionKind,
  note: string | null,
): Promise<ChurnActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const me = await getCurrentAppUser();
  // Org anchor (TENANCY 0158) — owner → ownership_shares → project.org.
  const organizationId = await getOwnerOrgId(ownerId);
  if (!organizationId) {
    return { ok: false, error: "Could not resolve the owner's organisation." };
  }
  const label = INTERVENTION_LABEL[churnKind];
  const [row] = await db
    .insert(ownerInsights)
    .values({
      organizationId,
      ownerId,
      kind: "other",
      level: "act",
      payload: {
        source: CHURN_INSIGHT_SOURCE,
        churnKind,
        title: label,
        detail: note ?? "Owner save-plan intervention.",
        openedByUserId: me?.id ?? null,
      },
    })
    .returning({ id: ownerInsights.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.churn.intervention.open",
    entityType: "owner",
    entityId: ownerId,
    after: { interventionId: row.id, churnKind, note },
  });

  revalidatePath(`/dashboard/owners/${ownerId}`);
  return { ok: true, message: `${label} logged.` };
}

function parseOpen(formData: FormData):
  | { ok: true; ownerId: string; note: string | null }
  | { ok: false; error: string } {
  const id = ownerIdSchema.safeParse(formData.get("ownerId"));
  if (!id.success) return { ok: false, error: "Missing owner id." };
  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 500) : null;
  return { ok: true, ownerId: id.data, note };
}

export async function scheduleFounderCallAction(
  _prev: ChurnActionResult | null,
  formData: FormData,
): Promise<ChurnActionResult> {
  const p = parseOpen(formData);
  if (!p.ok) return p;
  return openIntervention(p.ownerId, "founder_call", p.note);
}

export async function offerServiceCompAction(
  _prev: ChurnActionResult | null,
  formData: FormData,
): Promise<ChurnActionResult> {
  const p = parseOpen(formData);
  if (!p.ok) return p;
  return openIntervention(p.ownerId, "service_comp", p.note);
}

export async function markInterventionStartedAction(
  _prev: ChurnActionResult | null,
  formData: FormData,
): Promise<ChurnActionResult> {
  const p = parseOpen(formData);
  if (!p.ok) return p;
  return openIntervention(p.ownerId, "intervention_started", p.note);
}

/** Close an open intervention (dismiss with reason `acted`). */
export async function resolveInterventionAction(
  _prev: ChurnActionResult | null,
  formData: FormData,
): Promise<ChurnActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const ownerId = ownerIdSchema.safeParse(formData.get("ownerId"));
  const interventionId = interventionIdSchema.safeParse(formData.get("interventionId"));
  if (!ownerId.success || !interventionId.success) {
    return { ok: false, error: "Missing identifiers." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const [updated] = await db
    .update(ownerInsights)
    .set({
      dismissedAt: new Date(),
      dismissedByUserId: me?.id ?? null,
      dismissedReason: "acted",
    })
    .where(
      and(
        eq(ownerInsights.id, interventionId.data),
        eq(ownerInsights.ownerId, ownerId.data),
      ),
    )
    .returning({ id: ownerInsights.id });

  if (!updated) return { ok: false, error: "Intervention not found." };

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.churn.intervention.resolve",
    entityType: "owner",
    entityId: ownerId.data,
    after: { interventionId: interventionId.data },
  });

  revalidatePath(`/dashboard/owners/${ownerId.data}`);
  return { ok: true, message: "Intervention resolved." };
}
