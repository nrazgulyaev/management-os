"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { riskRadarAlerts } from "@/lib/db/schema/executive";
import { requireOrgId } from "@/features/auth/require-org";
import type { DetectedAlert } from "./risk-radar-detector";

const codeSchema = z.string().min(2).max(80);

export async function persistDetectedAlert(args: {
  detected: DetectedAlert;
  alertCode: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  // TENANT-1: persistDetectedAlert is called both from user actions
  // (interactive) and from the weekly cron job. The cron path has no
  // session and will throw here. TODO(cron): refactor cron caller to
  // pass an organizationId per-alert (derived from the entity the
  // alert was raised against).
  const organizationId = await requireOrgId();
  try {
    const inserted = await db
      .insert(riskRadarAlerts)
      .values({
        organizationId,
        alertCode: args.alertCode,
        detectionSource: "rule_based",
        detectionMethod: args.detected.detectionMethod,
        alertCategory: args.detected.category,
        severity: args.detected.severity,
        title: args.detected.title,
        description: args.detected.description,
        detectedPattern: args.detected.detectedPattern,
        affectedEntities: args.detected.affectedEntities,
        supportingData: args.detected.supportingData,
        recommendedAction: args.detected.recommendedAction,
        status: "open",
      })
      .returning({ id: riskRadarAlerts.id });
    return { ok: true, id: inserted[0].id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

export async function acknowledgeAlert(args: {
  alertCode: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.alertCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  try {
    await db
      .update(riskRadarAlerts)
      .set({
        status: "acknowledged",
        acknowledgedBy: args.userId,
        acknowledgedAt: new Date(),
      })
      .where(
        and(
          eq(riskRadarAlerts.alertCode, code),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function resolveAlert(args: {
  alertCode: string;
  userId: string;
  resolutionNotes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.alertCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  try {
    await db
      .update(riskRadarAlerts)
      .set({
        status: "resolved",
        resolvedBy: args.userId,
        resolvedAt: new Date(),
        resolutionNotes: args.resolutionNotes ?? null,
      })
      .where(
        and(
          eq(riskRadarAlerts.alertCode, code),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function markFalsePositive(args: {
  alertCode: string;
  userId: string;
  resolutionNotes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.alertCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  try {
    await db
      .update(riskRadarAlerts)
      .set({
        status: "false_positive",
        resolvedBy: args.userId,
        resolvedAt: new Date(),
        resolutionNotes: args.resolutionNotes ?? null,
      })
      .where(
        and(
          eq(riskRadarAlerts.alertCode, code),
          eq(riskRadarAlerts.organizationId, organizationId),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
