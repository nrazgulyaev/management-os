"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { executiveDigests } from "@/lib/db/schema/executive";
import {
  buildDigestSkeleton,
  nextDigestCode,
  type DigestContext,
} from "./digest-helpers";

const codeSchema = z.string().min(2).max(80);

export async function generateDigest(args: {
  context: DigestContext;
  digestType: "weekly" | "monthly" | "quarterly" | "on_demand";
  metricsSnapshotId?: string;
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  const skeleton = buildDigestSkeleton(args.context);
  const code = nextDigestCode(args.context.periodStart);
  const aiGenerated =
    !!process.env.ANTHROPIC_API_KEY && process.env.AI_DRY_RUN !== "1";

  try {
    await db
      .insert(executiveDigests)
      .values({
        digestCode: code,
        periodLabel: args.context.periodLabel,
        periodStart: args.context.periodStart.toISOString().slice(0, 10),
        periodEnd: args.context.periodEnd.toISOString().slice(0, 10),
        digestType: args.digestType,
        executiveSummary: skeleton.executiveSummary,
        cashPositionSection: skeleton.cashPosition,
        projectProgressSection: skeleton.projectProgress,
        salesSection: skeleton.sales,
        investorSection: skeleton.investor,
        operationsSection: skeleton.operations,
        risksSection: skeleton.risks,
        keyWins: skeleton.keyWins,
        keyConcerns: skeleton.keyConcerns,
        recommendedActions: skeleton.recommendedActions,
        metricsSnapshotId: args.metricsSnapshotId ?? null,
        aiGenerated,
        aiProvider: aiGenerated ? "anthropic" : null,
        aiModel: aiGenerated ? "claude-opus-4-7" : null,
        status: "draft",
      })
      .onConflictDoNothing({ target: executiveDigests.digestCode });
    return { ok: true, code };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

export async function approveDigest(args: {
  digestCode: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.digestCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  try {
    await db
      .update(executiveDigests)
      .set({
        status: "approved",
        approvedBy: args.userId,
        approvedAt: new Date(),
      })
      .where(eq(executiveDigests.digestCode, code));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function distributeDigest(args: {
  digestCode: string;
  recipients: Array<{ recipientType: string; recipientId: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.digestCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  try {
    const distributedAt = new Date().toISOString();
    const distributedTo = args.recipients.map((r) => ({
      ...r,
      distributedAt,
    }));
    await db
      .update(executiveDigests)
      .set({
        status: "distributed",
        distributedTo,
      })
      .where(eq(executiveDigests.digestCode, code));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function editDigestSection(args: {
  digestCode: string;
  section:
    | "executiveSummary"
    | "cashPosition"
    | "projectProgress"
    | "sales"
    | "investor"
    | "operations"
    | "risks";
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const code = codeSchema.parse(args.digestCode);
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const map: Record<string, keyof typeof executiveDigests.$inferInsert> = {
    executiveSummary: "executiveSummary",
    cashPosition: "cashPositionSection",
    projectProgress: "projectProgressSection",
    sales: "salesSection",
    investor: "investorSection",
    operations: "operationsSection",
    risks: "risksSection",
  };
  const col = map[args.section];
  if (!col) return { ok: false, error: "Invalid section" };
  try {
    await db
      .update(executiveDigests)
      .set({ [col]: args.content })
      .where(eq(executiveDigests.digestCode, code));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
