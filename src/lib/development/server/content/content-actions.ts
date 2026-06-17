"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { contentPieces, contentVariants, campaigns } from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { isValidTransition } from "./content-status-helpers";

const createContentSchema = z.object({
  title: z.string().min(2).max(200),
  contentType: z.string().min(2).max(60),
  contentBrief: z.string().min(2).max(8000),
  // Optional campaign association — passed as the campaign CODE from the
  // `?campaign=` query param; resolved to the org-scoped campaign UUID below.
  campaignCode: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

export type CreateContentResult =
  | { ok: true; contentCode: string }
  | { ok: false; error: string };

/**
 * Create a new content piece in `draft`. Org-scoped (requireOrgId) +
 * gated on an internal user (createdBy is NOT NULL). The content_code is
 * generated server-side (never client-supplied) and is globally unique.
 * When a campaignCode is supplied it must resolve to a campaign the caller
 * owns, else it is ignored (no cross-org association is ever written).
 */
export async function createContentPiece(
  input: z.input<typeof createContentSchema>,
): Promise<CreateContentResult> {
  const parsed = createContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  const ctx = await requireInternalUser();
  const createdBy = ctx.appUser?.id;
  if (!createdBy) {
    return { ok: false, error: "An authenticated internal user is required." };
  }

  // Resolve the optional campaign association (org-scoped — a foreign code
  // simply yields no association rather than leaking another tenant's id).
  let relatedCampaignId: string | null = null;
  if (parsed.data.campaignCode) {
    const [camp] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.campaignCode, parsed.data.campaignCode),
          eq(campaigns.organizationId, organizationId),
        ),
      )
      .limit(1);
    relatedCampaignId = camp?.id ?? null;
  }

  // Generate a unique content_code (e.g. CONT-7F3A21). Retry on the rare
  // unique collision rather than trusting client input for the code.
  let contentCode = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `CONT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [clash] = await db
      .select({ id: contentPieces.id })
      .from(contentPieces)
      .where(eq(contentPieces.contentCode, candidate))
      .limit(1);
    if (!clash) {
      contentCode = candidate;
      break;
    }
  }
  if (!contentCode) {
    return { ok: false, error: "Could not allocate a content code. Try again." };
  }

  await db.insert(contentPieces).values({
    organizationId,
    contentCode,
    title: parsed.data.title,
    contentType: parsed.data.contentType,
    contentBrief: parsed.data.contentBrief,
    relatedCampaignId,
    status: "draft",
    createdBy,
  });
  return { ok: true, contentCode };
}

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
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.contentCode, args.contentCode),
        eq(contentPieces.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(contentPieces.contentCode, args.contentCode),
        eq(contentPieces.organizationId, organizationId),
      ),
    );
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
  const organizationId = await requireOrgId();
  const parentRows = await db
    .select({ id: contentPieces.id })
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.contentCode, parsed.data.parentContentCode),
        eq(contentPieces.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!parentRows[0]) return { ok: false as const, error: "Parent not found" };
  await db.insert(contentVariants).values({
    organizationId,
    parentContentId: parentRows[0].id,
    variantType: parsed.data.variantType,
    variantLabel: parsed.data.variantLabel,
    languageCode: parsed.data.languageCode ?? null,
    platformTarget: parsed.data.platformTarget ?? null,
    caption: parsed.data.caption ?? null,
  });
  return { ok: true as const };
}
