"use server";

import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { aiInvestorQaDrafts } from "@/lib/db/schema/ai-development";
import { investors } from "@/lib/db/schema/investor-capital";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  draftInvestorResponse,
  type DraftInvestorResponseResult,
} from "@/lib/development/ai/investor-relations";

const generateSchema = z.object({
  investorId: z.string().uuid(),
  question: z.string().min(1).max(4000),
  questionLanguage: z.enum(["en", "ru", "id", "zh"]).optional(),
  responseLanguage: z.enum(["en", "ru", "id", "zh"]).optional(),
});

export async function generateInvestorDraft(
  input: z.input<typeof generateSchema>,
): Promise<DraftInvestorResponseResult> {
  const parsed = generateSchema.parse(input);
  await requireInternalUser();
  const out = await draftInvestorResponse(parsed);
  // Resolve investor code for the path revalidation.
  const db = requireDb();
  const [inv] = await db
    .select({ code: investors.investorCode })
    .from(investors)
    .where(eq(investors.id, parsed.investorId))
    .limit(1);
  if (inv) revalidatePath(`/development-os/investors/${inv.code}`);
  return out;
}

const idSchema = z.object({ draftId: z.string().uuid() });

export async function approveInvestorDraft(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true }> {
  const parsed = idSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  await db
    .update(aiInvestorQaDrafts)
    .set({
      status: "approved",
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiInvestorQaDrafts.id, parsed.draftId));
  await revalidatePathForDraft(parsed.draftId);
  return { ok: true };
}

const editSchema = z.object({
  draftId: z.string().uuid(),
  approvedResponse: z.string().min(1).max(10_000),
});

export async function editAndApproveInvestorDraft(
  input: z.input<typeof editSchema>,
): Promise<{ ok: true }> {
  const parsed = editSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  await db
    .update(aiInvestorQaDrafts)
    .set({
      approvedResponse: parsed.approvedResponse,
      status: "edited_approved",
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiInvestorQaDrafts.id, parsed.draftId));
  await revalidatePathForDraft(parsed.draftId);
  return { ok: true };
}

const rejectSchema = z.object({
  draftId: z.string().uuid(),
  reason: z.string().min(3).max(500).optional(),
});

export async function rejectInvestorDraft(
  input: z.input<typeof rejectSchema>,
): Promise<{ ok: true }> {
  const parsed = rejectSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  await db
    .update(aiInvestorQaDrafts)
    .set({
      status: "rejected",
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiInvestorQaDrafts.id, parsed.draftId));
  await revalidatePathForDraft(parsed.draftId);
  return { ok: true };
}

const sentSchema = z.object({
  draftId: z.string().uuid(),
  sentVia: z.enum(["email", "manual_copy", "whatsapp", "portal"]),
});

export async function markInvestorDraftSent(
  input: z.input<typeof sentSchema>,
): Promise<{ ok: true }> {
  const parsed = sentSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(aiInvestorQaDrafts)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentVia: parsed.sentVia,
      updatedAt: new Date(),
    })
    .where(eq(aiInvestorQaDrafts.id, parsed.draftId));
  await revalidatePathForDraft(parsed.draftId);
  return { ok: true };
}

export async function getInvestorDrafts(investorId: string, limit = 20) {
  const db = requireDb();
  return await db
    .select()
    .from(aiInvestorQaDrafts)
    .where(eq(aiInvestorQaDrafts.investorId, investorId))
    .orderBy(desc(aiInvestorQaDrafts.generatedAt))
    .limit(limit);
}

async function revalidatePathForDraft(draftId: string): Promise<void> {
  const db = requireDb();
  const [row] = await db
    .select({ investorId: aiInvestorQaDrafts.investorId })
    .from(aiInvestorQaDrafts)
    .where(eq(aiInvestorQaDrafts.id, draftId))
    .limit(1);
  if (!row) return;
  const [inv] = await db
    .select({ code: investors.investorCode })
    .from(investors)
    .where(eq(investors.id, row.investorId))
    .limit(1);
  if (inv) revalidatePath(`/development-os/investors/${inv.code}`);
}
