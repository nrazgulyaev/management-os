"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { contentPieces, contentVariants } from "@/lib/db/schema/marketing";
import { isValidTransition } from "./content-status-helpers";

export async function transitionContentStatus(args: {
  contentCode: string;
  newStatus:
    | "draft"
    | "in_production"
    | "pending_review"
    | "approved"
    | "scheduled"
    | "published"
    | "paused"
    | "archived"
    | "rejected";
  userId: string;
  rejectionReason?: string;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const rows = await db
    .select()
    .from(contentPieces)
    .where(eq(contentPieces.contentCode, args.contentCode))
    .limit(1);
  const current = rows[0];
  if (!current) return { ok: false as const, error: "Not found" };
  if (!isValidTransition(current.status, args.newStatus)) {
    return {
      ok: false as const,
      error: `Invalid transition: ${current.status} → ${args.newStatus}`,
    };
  }
  const updates: Record<string, unknown> = {
    status: args.newStatus,
    statusChangedAt: new Date(),
  };
  if (args.newStatus === "approved") {
    updates.approvedBy = args.userId;
    updates.approvedAt = new Date();
  } else if (args.newStatus === "rejected") {
    updates.rejectionReason = args.rejectionReason ?? "no reason provided";
  } else if (args.newStatus === "pending_review") {
    updates.reviewedBy = args.userId;
    updates.reviewedAt = new Date();
  } else if (args.newStatus === "published") {
    updates.publishedAt = new Date();
  }
  await db
    .update(contentPieces)
    .set(updates)
    .where(eq(contentPieces.contentCode, args.contentCode));
  return { ok: true as const };
}

const createVariantSchema = z.object({
  parentContentCode: z.string(),
  variantType: z.enum(["language", "platform", "audience", "format", "a_b_test"]),
  variantLabel: z.string().min(2).max(120),
  languageCode: z.string().optional(),
  platformTarget: z.string().optional(),
  caption: z.string().optional(),
});

export async function createContentVariant(input: z.input<typeof createVariantSchema>) {
  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const parentRows = await db
    .select({ id: contentPieces.id })
    .from(contentPieces)
    .where(eq(contentPieces.contentCode, parsed.data.parentContentCode))
    .limit(1);
  if (!parentRows[0]) return { ok: false as const, error: "Parent not found" };
  await db.insert(contentVariants).values({
    parentContentId: parentRows[0].id,
    variantType: parsed.data.variantType,
    variantLabel: parsed.data.variantLabel,
    languageCode: parsed.data.languageCode ?? null,
    platformTarget: parsed.data.platformTarget ?? null,
    caption: parsed.data.caption ?? null,
  });
  return { ok: true as const };
}
