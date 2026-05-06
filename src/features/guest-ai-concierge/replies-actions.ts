"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";

import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { hashIpForLog, hashStayToken } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { recordSecurityEvent } from "@/features/guest-stays/security";
import { queueNotification } from "@/features/notifications/services";

import {
  guestReplySchema,
  staffReplySchema,
  markReadSchema,
} from "./replies-schema";
import {
  buildSystemStatusReply,
  canGuestReply,
  canStaffReply,
  redactGuestReply,
  redactStaffReply,
  type HandoffStatus,
} from "./replies-pure";
import { rateLimitGuestReply } from "./replies-rate-limit";
import {
  markGuestReadAt,
  markStaffReadAt,
} from "./replies-services";

export type ReplyActionState =
  | null
  | { ok: true; replyId: string }
  | { ok: false; error: string };

// =============================================================================
// Guest replies
// =============================================================================

export async function createGuestHandoffReplyAction(
  _prev: ReplyActionState | null,
  formData: FormData,
): Promise<ReplyActionState> {
  const parsed = guestReplySchema.safeParse({
    token: formData.get("token"),
    handoffId: formData.get("handoffId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please add a short note.",
    };
  }
  const v = parsed.data;
  const tokenPrefix = v.token.slice(0, 8);
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;
  const ipHash = hashIpForLog(ip) ?? null;

  // v9G stay-token IP rate limit.
  const generalRl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!generalRl.allowed) {
    return {
      ok: false,
      error: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  const resolved = await getStayByToken(v.token);
  if (!resolved.ok) {
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  const stay = resolved.stay;
  const tokenHash = hashStayToken(v.token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    return {
      ok: false,
      error: "Please verify your stay first to add a reply.",
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Service is temporarily unavailable." };

  // Handoff must belong to this token.
  const [handoff] = await db
    .select()
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, v.handoffId))
    .limit(1);
  if (!handoff || handoff.guestStayTokenId !== stay.tokenId) {
    return { ok: false, error: "Request not found." };
  }
  if (!canGuestReply(handoff.status as HandoffStatus)) {
    return {
      ok: false,
      error:
        "This request is closed. Tap 'Ask human concierge' on the AI page to start a new one.",
    };
  }

  // Reply rate limiter (10/handoff/hour, 30/token/hour).
  const rl = await rateLimitGuestReply({
    handoffId: v.handoffId,
    guestStayTokenId: stay.tokenId,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error:
        rl.reason === "per_handoff"
          ? "Too many replies on this request. Wait a bit and try again."
          : "You've sent a lot of replies in the last hour. Please wait before sending more.",
    };
  }

  const bodyRedacted = redactGuestReply(v.body);
  if (bodyRedacted !== v.body) {
    // The text contained something the redactor scrubbed (code, token,
    // password literal, email, phone). Log a low-severity event so ops
    // can spot patterns; not a hard block.
    await recordSecurityEvent({
      eventType: "suspicious_access",
      severity: "low",
      guestStayTokenId: stay.tokenId,
      bookingId: stay.bookingId,
      ipHash,
      userAgent: ua,
      metadata: { source: "guest_ai_handoff_reply", reason: "redacted" },
    });
  }

  const [row] = await db
    .insert(guestAiHandoffReplies)
    .values({
      handoffId: v.handoffId,
      serviceRequestId: handoff.serviceRequestId,
      authorType: "guest",
      authorAppUserId: null,
      visibility: "guest_visible",
      body: v.body,
      bodyRedacted,
      replyType: "message",
    })
    .returning({ id: guestAiHandoffReplies.id });

  await db
    .update(guestAiHandoffs)
    .set({
      lastGuestReplyAt: new Date(),
      staffUnreadCount: sql`${guestAiHandoffs.staffUnreadCount} + 1`,
    })
    .where(eq(guestAiHandoffs.id, v.handoffId));

  await recordAuditEvent({
    actorUserId: null,
    action: "guest_ai.handoff.guest_reply",
    entityType: "guest_ai_handoff_reply",
    entityId: row!.id,
    after: { handoffId: v.handoffId, redacted: bodyRedacted !== v.body },
  });

  // Notify staff.
  for (const role of ["concierge", "property_manager"]) {
    try {
      await queueNotification({
        recipientType: "role",
        channel: "in_app",
        templateKey: "guest_ai.handoff_reply_guest",
        title: `Guest replied · ${stay.villaCode ?? "villa"}`,
        body: bodyRedacted.slice(0, 160),
        payload: {
          recipientRole: role,
          handoffId: v.handoffId,
          replyId: row!.id,
        },
        priority: handoff.priority === "urgent" ? "urgent" : "high",
        dedupeKey: `guest_ai_reply_guest:${row!.id}:${role}`,
      });
    } catch {
      // best-effort
    }
  }

  revalidatePath(`/dashboard/guest-ai/handoffs/${v.handoffId}`);
  return { ok: true, replyId: row!.id };
}

// =============================================================================
// Staff replies (guest-visible OR internal-only)
// =============================================================================

export async function createStaffHandoffReplyAction(
  _prev: ReplyActionState | null,
  formData: FormData,
): Promise<ReplyActionState> {
  await requirePermission("guest_ai.handoff.manage");
  const parsed = staffReplySchema.safeParse({
    handoffId: formData.get("handoffId"),
    visibility: formData.get("visibility") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please add a reply.",
    };
  }
  const v = parsed.data;
  const me = await getCurrentAppUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [handoff] = await db
    .select()
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, v.handoffId))
    .limit(1);
  if (!handoff) return { ok: false, error: "Handoff not found." };
  if (!canStaffReply(handoff.status as HandoffStatus)) {
    return {
      ok: false,
      error: "This handoff is cancelled — replies are no longer accepted.",
    };
  }

  const bodyRedacted = redactStaffReply(v.body);
  const visibility = v.visibility;

  const [row] = await db
    .insert(guestAiHandoffReplies)
    .values({
      handoffId: v.handoffId,
      serviceRequestId: handoff.serviceRequestId,
      authorType: "staff",
      authorAppUserId: me?.id ?? null,
      visibility,
      body: v.body,
      bodyRedacted,
      replyType: visibility === "internal_only" ? "internal_note" : "message",
    })
    .returning({ id: guestAiHandoffReplies.id });

  if (visibility === "guest_visible") {
    await db
      .update(guestAiHandoffs)
      .set({
        lastStaffReplyAt: new Date(),
        firstStaffReplyAt:
          handoff.firstStaffReplyAt ??
          (sql`now()` as unknown as Date | null),
        guestUnreadCount: sql`${guestAiHandoffs.guestUnreadCount} + 1`,
      })
      .where(eq(guestAiHandoffs.id, v.handoffId));
  }
  // Internal notes don't update SLA timestamps or unread counters.

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action:
      visibility === "internal_only"
        ? "guest_ai.handoff.internal_note"
        : "guest_ai.handoff.staff_reply",
    entityType: "guest_ai_handoff_reply",
    entityId: row!.id,
    after: { handoffId: v.handoffId, visibility },
  });

  revalidatePath(`/dashboard/guest-ai/handoffs/${v.handoffId}`);
  return { ok: true, replyId: row!.id };
}

// =============================================================================
// Mark-read (no-op when no DB).
// =============================================================================

export async function markGuestReadAction(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean }> {
  const parsed = markReadSchema.safeParse({
    token: formData.get("token") || undefined,
    handoffId: formData.get("handoffId"),
  });
  if (!parsed.success) return { ok: false };
  if (parsed.data.token) {
    const resolved = await getStayByToken(parsed.data.token);
    if (!resolved.ok) return { ok: false };
    const tokenHash = hashStayToken(parsed.data.token);
    const access = await canAccessStayWithoutVerification({ tokenHash });
    if (!access.allowed) return { ok: false };
    // Confirm the handoff belongs to this token.
    const db = getDb();
    if (!db) return { ok: false };
    const [row] = await db
      .select()
      .from(guestAiHandoffs)
      .where(eq(guestAiHandoffs.id, parsed.data.handoffId))
      .limit(1);
    if (!row || row.guestStayTokenId !== resolved.stay.tokenId) {
      return { ok: false };
    }
  }
  await markGuestReadAt({ handoffId: parsed.data.handoffId });
  revalidatePath(`/dashboard/guest-ai/handoffs/${parsed.data.handoffId}`);
  return { ok: true };
}

export async function markStaffReadAction(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean }> {
  await requirePermission("guest_ai.handoff.read");
  const parsed = markReadSchema.safeParse({
    handoffId: formData.get("handoffId"),
  });
  if (!parsed.success) return { ok: false };
  await markStaffReadAt({ handoffId: parsed.data.handoffId });
  revalidatePath(`/dashboard/guest-ai/handoffs/${parsed.data.handoffId}`);
  return { ok: true };
}

// =============================================================================
// System replies — used by acknowledge / resolve transitions.
// =============================================================================

export async function appendSystemStatusReply(args: {
  handoffId: string;
  status: HandoffStatus;
  actorLabel: string | null;
  actorAppUserId: string | null;
  serviceRequestId: string | null;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const draft = buildSystemStatusReply(args.status, args.actorLabel);
  const [row] = await db
    .insert(guestAiHandoffReplies)
    .values({
      handoffId: args.handoffId,
      serviceRequestId: args.serviceRequestId,
      authorType: "system",
      authorAppUserId: args.actorAppUserId,
      visibility: "guest_visible",
      body: draft.body,
      bodyRedacted: draft.bodyRedacted,
      replyType: draft.replyType,
      statusSnapshot: draft.statusSnapshot,
    })
    .returning({ id: guestAiHandoffReplies.id });
  await db
    .update(guestAiHandoffs)
    .set({
      lastStaffReplyAt: new Date(),
      guestUnreadCount: sql`${guestAiHandoffs.guestUnreadCount} + 1`,
    })
    .where(eq(guestAiHandoffs.id, args.handoffId));
  return row?.id ?? null;
}
