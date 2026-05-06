import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { waterfallRules } from "@/lib/db/schema/waterfall-rules";

export async function listWaterfallRules(filters?: {
  projectId?: string;
  commitmentId?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(waterfallRules.projectId, filters.projectId));
  }
  if (filters?.commitmentId) {
    conditions.push(eq(waterfallRules.commitmentId, filters.commitmentId));
  }
  if (filters?.activeOnly !== false) {
    conditions.push(eq(waterfallRules.isActive, true));
  }
  return db
    .select()
    .from(waterfallRules)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(waterfallRules.effectiveFrom));
}

export async function getWaterfallRule(id: string) {
  const db = requireDb();
  const [rule] = await db
    .select()
    .from(waterfallRules)
    .where(eq(waterfallRules.id, id))
    .limit(1);
  return rule ?? null;
}

/**
 * Resolve the *active* waterfall rule for a (commitmentId | projectId) pair.
 * Commitment-scoped rules win over project-scoped rules — that is the
 * legal-document escape hatch (a per-investor rider can override the
 * project default).
 */
export async function resolveActiveRuleForCommitment(input: {
  commitmentId: string;
  projectId: string;
}) {
  const db = requireDb();
  const [byCommitment] = await db
    .select()
    .from(waterfallRules)
    .where(
      and(
        eq(waterfallRules.commitmentId, input.commitmentId),
        eq(waterfallRules.isActive, true),
      ),
    )
    .orderBy(desc(waterfallRules.effectiveFrom))
    .limit(1);
  if (byCommitment) return byCommitment;

  const [byProject] = await db
    .select()
    .from(waterfallRules)
    .where(
      and(
        eq(waterfallRules.projectId, input.projectId),
        eq(waterfallRules.isActive, true),
        isNull(waterfallRules.commitmentId),
      ),
    )
    .orderBy(desc(waterfallRules.effectiveFrom))
    .limit(1);
  return byProject ?? null;
}
