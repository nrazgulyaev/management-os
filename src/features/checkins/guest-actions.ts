"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkins } from "@/lib/db/schema/guest-stays";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { assertTransition, canSubmit, type CheckinStatus } from "./state-machine";
import { emitCheckinEvent } from "./events";

export type CheckinSubmitResult = { ok: true } | { ok: false; error: string };

const submitSchema = z.object({
  token: z.string().min(16),
  guestCount: z.coerce.number().int().min(1, "At least one guest.").max(30),
  eta: z.string().trim().max(40).optional(),
  passportUploaded: z.boolean().optional(),
});

/**
 * Guest submits the online check-in (FC-GUEST-STAY-PORTAL §online-check-in).
 * Resolves the booking from the stay token (verified, rate-limited), upserts
 * the `checkins` row to `submitted`, and emits `checkin.submitted` so the Front
 * office arrivals board shows it awaiting review. Idempotent once submitted.
 */
export async function submitStayCheckinAction(input: {
  token: string;
  guestCount: number;
  eta?: string;
  passportUploaded?: boolean;
}): Promise<CheckinSubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid check-in." };
  }
  const { token, guestCount, eta, passportUploaded } = parsed.data;

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const rl = await rateLimitStayTokenAccess({ tokenPrefix: token.slice(0, 8), ip });
  if (!rl.allowed) return { ok: false, error: "Too many attempts. Try again shortly." };

  const resolved = await getStayByToken(token);
  if (!resolved.ok) return { ok: false, error: "Stay not found." };
  const access = await canAccessStayWithoutVerification({ tokenHash: hashStayToken(token) });
  if (!access.allowed) return { ok: false, error: "Please verify your identity first." };

  const db = getDb();
  if (!db) return { ok: false, error: "Service unavailable." };
  const bookingId = resolved.stay.bookingId;

  const [existing] = await db
    .select({ id: checkins.id, status: checkins.status })
    .from(checkins)
    .where(eq(checkins.bookingId, bookingId))
    .limit(1);

  const from = (existing?.status ?? "not_started") as CheckinStatus;
  // Already submitted / approved / issued → idempotent no-op.
  if (from === "submitted" || from === "approved" || from === "code_issued") {
    return { ok: true };
  }
  if (!canSubmit(from)) return { ok: false, error: `Can't submit a ${from} check-in.` };
  assertTransition(from, "submitted");

  const now = new Date();
  let checkinId: string;
  if (existing) {
    await db
      .update(checkins)
      .set({
        status: "submitted",
        guestCount,
        eta: eta ?? null,
        passportUploaded: passportUploaded ?? false,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(checkins.id, existing.id));
    checkinId = existing.id;
  } else {
    const [row] = await db
      .insert(checkins)
      .values({
        bookingId,
        status: "submitted",
        guestCount,
        eta: eta ?? null,
        passportUploaded: passportUploaded ?? false,
        submittedAt: now,
      })
      .returning({ id: checkins.id });
    checkinId = row.id;
  }

  await emitCheckinEvent({
    verb: "submitted",
    checkinId,
    bookingId,
    payload: { guestCount, eta: eta ?? null },
  });
  return { ok: true };
}
