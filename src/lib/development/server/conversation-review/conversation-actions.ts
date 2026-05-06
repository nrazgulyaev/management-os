"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { salesConversationThreads } from "@/lib/db/schema/marketing";

export async function recordConsent(args: {
  threadCode: string;
  userId: string;
  consent: boolean;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(salesConversationThreads)
    .set({
      consentToAnalyze: args.consent,
      consentRecordedAt: args.consent ? new Date() : null,
      consentRecordedBy: args.consent ? args.userId : null,
    })
    .where(eq(salesConversationThreads.threadCode, args.threadCode));
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
  const rows = await db
    .select()
    .from(salesConversationThreads)
    .where(eq(salesConversationThreads.threadCode, args.threadCode))
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
    .where(eq(salesConversationThreads.id, thread.id));
  // Actual provider call would happen here; in dry-run we just mark analyzed
  // and rely on the Stage 5.D Marketing Assistant agent for any text gen.
  await db
    .update(salesConversationThreads)
    .set({ aiAnalysisStatus: "analyzed" })
    .where(eq(salesConversationThreads.id, thread.id));
  return { ok: true };
}
