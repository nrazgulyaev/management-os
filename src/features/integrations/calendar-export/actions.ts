"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { villaIcalExportTokens } from "@/lib/db/schema/integrations";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { env } from "@/lib/env";
import { generateFeedToken, hashFeedToken, feedTokenPrefix } from "./token";

/**
 * ICAL-EXPORT-1 — manage a villa's outbound iCal feed token.
 *
 * Rotate = deactivate any existing active token for the villa, insert a fresh
 * one, and return the RAW token + full feed URL ONCE (only the hash persists —
 * mirrors guest-stay tokens). Revoke = deactivate without replacement (the OTA
 * URL immediately 404s). Both gated by integrations.write + org-scoped through
 * the villa's project.
 */

const villaIdSchema = z.object({ villaId: z.string().uuid() });

const FEEDS_PATH = "/dashboard/integrations/calendar-feeds";

function feedUrlFor(rawToken: string): string {
  const base = env.server.APP_BASE_URL ?? "https://app.arconique.com";
  return `${base.replace(/\/$/, "")}/api/ical/${rawToken}.ics`;
}

export type RotateFeedResult =
  | { ok: true; feedUrl: string; tokenPrefix: string }
  | { ok: false; error: string };

export async function rotateVillaIcalTokenAction(
  input: z.input<typeof villaIdSchema>,
): Promise<RotateFeedResult> {
  await requirePermission("integrations.write");
  const organizationId = await requireOrgId();
  const parsed = villaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid villa." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  // Villa must belong to the caller's org (villas anchor via project).
  const [villa] = await db
    .select({ id: villas.id, unitCode: villas.unitCode })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, parsed.data.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!villa) return { ok: false, error: "Villa not found." };

  const rawToken = generateFeedToken();
  const tokenHash = hashFeedToken(rawToken);
  const tokenPrefix = feedTokenPrefix(rawToken);

  await db.transaction(async (tx) => {
    await tx
      .update(villaIcalExportTokens)
      .set({ isActive: false, rotatedAt: new Date() })
      .where(
        and(
          eq(villaIcalExportTokens.villaId, villa.id),
          eq(villaIcalExportTokens.organizationId, organizationId),
          eq(villaIcalExportTokens.isActive, true),
        ),
      );
    await tx.insert(villaIcalExportTokens).values({
      organizationId,
      villaId: villa.id,
      tokenHash,
      tokenPrefix,
      isActive: true,
      createdBy: me?.id ?? null,
    });
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "integrations.ical_export.rotate",
    entityType: "villa",
    entityId: villa.id,
    metadata: { unitCode: villa.unitCode, tokenPrefix },
  });

  revalidatePath(FEEDS_PATH);
  return { ok: true, feedUrl: feedUrlFor(rawToken), tokenPrefix };
}

export type RevokeFeedResult = { ok: true } | { ok: false; error: string };

export async function revokeVillaIcalTokenAction(
  input: z.input<typeof villaIdSchema>,
): Promise<RevokeFeedResult> {
  await requirePermission("integrations.write");
  const organizationId = await requireOrgId();
  const parsed = villaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid villa." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const updated = await db
    .update(villaIcalExportTokens)
    .set({ isActive: false, rotatedAt: new Date() })
    .where(
      and(
        eq(villaIcalExportTokens.villaId, parsed.data.villaId),
        eq(villaIcalExportTokens.organizationId, organizationId),
        eq(villaIcalExportTokens.isActive, true),
      ),
    )
    .returning({ id: villaIcalExportTokens.id });
  if (updated.length === 0) {
    return { ok: false, error: "No active feed for this villa." };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "integrations.ical_export.revoke",
    entityType: "villa",
    entityId: parsed.data.villaId,
    metadata: {},
  });

  revalidatePath(FEEDS_PATH);
  return { ok: true };
}
