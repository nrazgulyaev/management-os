"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { projectRisks } from "@/lib/db/schema/project-memory";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const PROBABILITIES = [
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
] as const;
const IMPACTS = ["minor", "moderate", "major", "severe", "catastrophic"] as const;
const CATEGORIES = [
  "land_legal",
  "permit_delay",
  "weather",
  "supplier_delay",
  "fx_currency",
  "buyer_payment_delay",
  "cost_overrun",
  "quality_issue",
  "labor_shortage",
  "investor_funding_delay",
  "tax_uncertainty",
  "design_change",
  "safety",
  "other",
] as const;
const MITIGATION_STATUSES = [
  "identified",
  "planning_mitigation",
  "mitigating",
  "monitored",
  "closed_resolved",
  "closed_realized",
] as const;

const createSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid(),
  description: z.string().min(1),
  category: z.enum(CATEGORIES),
  probability: z.enum(PROBABILITIES),
  impact: z.enum(IMPACTS),
  ownerId: z.string().uuid().nullable().optional(),
  mitigationPlan: z.string().nullable().optional(),
  mitigationDeadline: z.string().nullable().optional(),
  estimatedCostImpactMinor: z.bigint().nullable().optional(),
  estimatedScheduleImpactDays: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createProjectRisk(input: z.input<typeof createSchema>) {
  await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  // HF-5: project_risks is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(projectRisks);
  const seq = String(Number(count ?? "0") + 1).padStart(3, "0");
  const riskCode = `RSK-${parsed.projectId.slice(0, 8)}-${seq}`;
  const [row] = await db
    .insert(projectRisks)
    .values({
      organizationId,
      riskCode,
      title: parsed.title,
      projectId: parsed.projectId,
      description: parsed.description,
      category: parsed.category,
      probability: parsed.probability,
      impact: parsed.impact,
      ownerId: parsed.ownerId ?? null,
      mitigationPlan: parsed.mitigationPlan ?? null,
      mitigationDeadline: parsed.mitigationDeadline ?? null,
      estimatedCostImpactMinor: parsed.estimatedCostImpactMinor ?? null,
      estimatedScheduleImpactDays: parsed.estimatedScheduleImpactDays ?? null,
      identifiedAt: new Date().toISOString().slice(0, 10),
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  riskId: z.string().uuid(),
  to: z.enum(MITIGATION_STATUSES),
  closedReason: z.string().nullable().optional(),
});

export async function transitionRiskStatus(
  input: z.input<typeof transitionSchema>,
) {
  await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  // HF-5: scope UPDATE by organization_id.
  const organizationId = await requireOrgId();
  const updates: Record<string, unknown> = { mitigationStatus: parsed.to };
  if (parsed.to.startsWith("closed_")) {
    updates.closedAt = new Date().toISOString().slice(0, 10);
    if (parsed.closedReason) updates.closedReason = parsed.closedReason;
  }
  const [row] = await db
    .update(projectRisks)
    .set(updates)
    .where(
      and(
        eq(projectRisks.id, parsed.riskId),
        eq(projectRisks.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}
