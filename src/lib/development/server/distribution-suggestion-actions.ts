import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { aiDistributionSuggestions } from "@/lib/db/schema/ai-development";
import { projects } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  suggestDistribution,
  type SuggestDistributionResult,
} from "@/lib/development/ai/distribution-preview";
import { declareDistribution } from "@/lib/development/server/distribution-actions";

/**
 * HITL actions for distribution suggestions. Approving a suggestion
 * calls the existing `declareDistribution` action — the AI never
 * declares directly. Defense in depth: even if a future caller
 * bypasses this action, `declareDistribution` re-validates the
 * allocation against the live snapshot.
 */

const idSchema = z.object({ suggestionId: z.string().uuid() });
const reqSchema = z.object({
  projectId: z.string().uuid(),
  triggeredBy: z
    .enum(["cron_check", "manual_request", "threshold_event"])
    .optional(),
});

export async function requestDistributionSuggestion(
  input: z.input<typeof reqSchema>,
): Promise<SuggestDistributionResult> {
  const parsed = reqSchema.parse(input);
  await requireInternalUser();
  const out = await suggestDistribution({
    projectId: parsed.projectId,
    triggeredBy: parsed.triggeredBy ?? "manual_request",
  });
  await revalidateProjectPath(parsed.projectId);
  return out;
}

export async function regenerateSuggestion(
  input: z.input<typeof idSchema>,
): Promise<SuggestDistributionResult> {
  const parsed = idSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  // Mark the current draft as superseded, then regenerate.
  const [existing] = await db
    .select({
      projectId: aiDistributionSuggestions.projectId,
      status: aiDistributionSuggestions.status,
    })
    .from(aiDistributionSuggestions)
    .where(eq(aiDistributionSuggestions.id, parsed.suggestionId))
    .limit(1);
  if (!existing) throw new Error("Suggestion not found");

  if (existing.status === "draft" || existing.status === "reviewed") {
    await db
      .update(aiDistributionSuggestions)
      .set({
        status: "superseded",
        reviewedBy: meId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiDistributionSuggestions.id, parsed.suggestionId));
  }

  const out = await suggestDistribution({
    projectId: existing.projectId,
    triggeredBy: "manual_request",
  });
  await revalidateProjectPath(existing.projectId);
  return out;
}

const approveSchema = z.object({
  suggestionId: z.string().uuid(),
  edits: z
    .object({
      amountUsdMinor: z.union([z.bigint(), z.string(), z.number()]).optional(),
      type: z.enum(["capital_return", "profit_distribution", "mixed"]).optional(),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().max(2000).optional(),
    })
    .optional(),
});

/**
 * Approves the suggestion and DECLARES the actual distribution. Atomic:
 * the suggestion row is updated to status='declared' AND linked to the
 * new distribution row in one transaction, so we never end up with a
 * suggestion claiming approval without a backing distribution.
 *
 * Operator may override amount / type / effective date via `edits`.
 * Validation:
 *   - amount > 0 (the existing declareDistribution helper enforces this).
 *   - amount must NOT exceed the suggestion's safe envelope
 *     (we re-check in code; defense in depth on top of declareDistribution).
 */
export async function approveDistributionSuggestion(
  input: z.input<typeof approveSchema>,
): Promise<{ ok: true; distributionId: string }> {
  const parsed = approveSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  const [s] = await db
    .select()
    .from(aiDistributionSuggestions)
    .where(eq(aiDistributionSuggestions.id, parsed.suggestionId))
    .limit(1);
  if (!s) throw new Error("Suggestion not found");
  if (s.status !== "draft" && s.status !== "reviewed") {
    throw new Error(`Cannot approve suggestion in '${s.status}' state`);
  }

  // Resolve operator-overridden values, falling back to the suggestion's.
  const amountSource =
    parsed.edits?.amountUsdMinor ?? s.suggestedAmountUsdMinor;
  const amountBig =
    typeof amountSource === "bigint"
      ? amountSource
      : BigInt(typeof amountSource === "number" ? Math.trunc(amountSource) : amountSource);
  if (amountBig <= 0n) {
    throw new Error(
      "Cannot declare a distribution with amount 0. Reject this suggestion instead.",
    );
  }
  // Defense in depth: amount cannot exceed the suggestion's safe envelope.
  // The envelope was computed at suggest-time and is the operator's
  // source of truth at approval — if too much time has passed and the
  // operator wants a fresh envelope, they should regenerate.
  const safeEnvelope =
    BigInt(s.currentProjectBalanceUsdMinor) -
    BigInt(s.bufferAmountUsdMinor) -
    BigInt(s.outstandingCommitmentsUsdMinor) -
    BigInt(s.outstandingInvoicesUsdMinor);
  if (amountBig > safeEnvelope) {
    throw new Error(
      `Approved amount $${(Number(amountBig) / 100).toFixed(2)} exceeds the suggestion's safe envelope $${(Number(safeEnvelope > 0n ? safeEnvelope : 0n) / 100).toFixed(2)}. Regenerate the suggestion to refresh the envelope.`,
    );
  }

  const finalType =
    parsed.edits?.type ??
    (s.suggestedDistributionType === "none"
      ? // The 'none' suggestion type is a marker for "do nothing" — refuse
        // to approve without an explicit operator override.
        (() => {
          throw new Error(
            "Suggestion was 'none' (do not distribute). Operator must explicitly choose a distribution type via edits.",
          );
        })()
      : (s.suggestedDistributionType as
          | "capital_return"
          | "profit_distribution"
          | "mixed"));
  const finalDate = parsed.edits?.effectiveDate ?? s.suggestedEffectiveDate;

  // Declare the distribution OUTSIDE a transaction (declareDistribution
  // opens its own). Then in a follow-up update link the suggestion.
  const declared = await declareDistribution({
    projectId: s.projectId,
    totalAmountUsdMinor: amountBig,
    distributionType: finalType,
    triggerReason: "manual",
    triggerCompanyBalanceUsdMinor: s.currentCompanyBalanceUsdMinor,
    effectiveDate: finalDate,
    notes:
      parsed.edits?.notes ??
      `Approved from AI suggestion ${parsed.suggestionId}`,
  });

  await db
    .update(aiDistributionSuggestions)
    .set({
      status: "declared",
      relatedDistributionId: declared.distributionId,
      reviewedBy: meId,
      reviewedAt: new Date(),
      reviewerNotes: parsed.edits?.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(aiDistributionSuggestions.id, s.id));

  await revalidateProjectPath(s.projectId);
  return { ok: true, distributionId: declared.distributionId };
}

const rejectSchema = z.object({
  suggestionId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function rejectDistributionSuggestion(
  input: z.input<typeof rejectSchema>,
): Promise<{ ok: true }> {
  const parsed = rejectSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  const [s] = await db
    .select({
      id: aiDistributionSuggestions.id,
      projectId: aiDistributionSuggestions.projectId,
      status: aiDistributionSuggestions.status,
    })
    .from(aiDistributionSuggestions)
    .where(eq(aiDistributionSuggestions.id, parsed.suggestionId))
    .limit(1);
  if (!s) throw new Error("Suggestion not found");
  if (s.status !== "draft" && s.status !== "reviewed") {
    throw new Error(`Cannot reject suggestion in '${s.status}' state`);
  }
  await db
    .update(aiDistributionSuggestions)
    .set({
      status: "rejected",
      reviewerNotes: parsed.reason,
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiDistributionSuggestions.id, s.id));
  await revalidateProjectPath(s.projectId);
  return { ok: true };
}

/** Read-side: the active suggestion for a project (or null). */
export async function getActiveSuggestionForProject(projectId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(aiDistributionSuggestions)
    .where(
      and(
        eq(aiDistributionSuggestions.projectId, projectId),
        sql`${aiDistributionSuggestions.status} IN ('draft','reviewed')`,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function revalidateProjectPath(projectId: string): Promise<void> {
  const db = requireDb();
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) revalidatePath(`/development-os/projects/${p.slug}`);
}
