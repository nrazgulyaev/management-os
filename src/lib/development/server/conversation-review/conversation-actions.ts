"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { salesConversationThreads } from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";

export async function recordConsent(args: {
  threadCode: string;
  userId: string;
  consent: boolean;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();
  await db
    .update(salesConversationThreads)
    .set({
      consentToAnalyze: args.consent,
      consentRecordedAt: args.consent ? new Date() : null,
      consentRecordedBy: args.consent ? args.userId : null,
    })
    .where(
      and(
        eq(salesConversationThreads.threadCode, args.threadCode),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  return { ok: true as const };
}

/**
 * Trigger AI analysis on a conversation. **Hard-gated on consent.**
 */
export async function triggerConversationAnalysis(args: {
  threadCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(salesConversationThreads)
    .where(
      and(
        eq(salesConversationThreads.threadCode, args.threadCode),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  const thread = rows[0];
  if (!thread) return { ok: false, error: "Thread not found" };
  if (!thread.consentToAnalyze) {
    return {
      ok: false,
      error: "Cannot analyze without explicit consent_to_analyze=true",
    };
  }
  await db
    .update(salesConversationThreads)
    .set({ aiAnalysisStatus: "analyzing" })
    .where(
      and(
        eq(salesConversationThreads.id, thread.id),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  // Actual provider call would happen here; in dry-run we just mark analyzed
  // and rely on the Stage 5.D Marketing Assistant agent for any text gen.
  await db
    .update(salesConversationThreads)
    .set({ aiAnalysisStatus: "analyzed" })
    .where(
      and(
        eq(salesConversationThreads.id, thread.id),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  return { ok: true };
}
