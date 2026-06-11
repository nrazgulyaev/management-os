"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiConciergeSessions,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { serviceRequests } from "@/lib/db/schema/operations";

import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { hashIpForLog, hashStayToken } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { recordSecurityEvent } from "@/features/guest-stays/security";
import { queueNotification } from "@/features/notifications/services";
import { buildServiceRequestCode } from "@/features/operations/codes";
import { nextDailyCounter } from "@/features/operations/services";
import { appendSystemStatusReply } from "./replies-actions";

import {
  acknowledgeHandoffSchema,
  resolveHandoffSchema,
  submitHandoffSchema,
} from "./handoff-schema";
import {
  buildServiceRequestFromHandoff,
  classifyHandoffType,
  inferHandoffPriority,
  redactHandoffContext,
  safetyFlagsFor,
  summarizeLastMessages,
  type HandoffType,
} from "./handoff-pure";
import { rateLimitHandoff } from "./handoff-rate-limit";
import {
  ensureActiveSession,
} from "./services";
import {
  getRecentSessionMessages,
  lastAssistantMessageWasRefusal,
  snapshotMessages,
} from "./handoff-services";

export type HandoffActionState =
  | null
  | {
      ok: true;
      handoffId: string;
      requestCode: string | null;
      handoffType: HandoffType;
    }
  | { ok: false; error: string };

// =============================================================================
// Guest-side: submit handoff
// =============================================================================

export async function submitHandoffAction(
  _prev: HandoffActionState | null,
  formData: FormData,
): Promise<HandoffActionState> {
  const parsed = submitHandoffSchema.safeParse({
    token: formData.get("token"),
    type: formData.get("type") || undefined,
    priority: formData.get("priority") || undefined,
    message: formData.get("message"),
    preferredContact: formData.get("preferredContact") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please add a short message.",
    };
  }
  const v = parsed.data;
  const tokenPrefix = v.token.slice(0, 8);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;
  const ipHash = hashIpForLog(ip) ?? null;

  // v9G stay-token rate limiter for the page traffic envelope.
  const generalRl = await rateLimitStayTokenAccess({
    tokenPrefix,
    ip,
  });
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
      error: "Please verify your stay first to use the concierge.",
    };
  }

  const sessionId = await ensureActiveSession({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
  });
  if (!sessionId) {
    return { ok: false, error: "Concierge is unavailable right now." };
  }

  // Pull conversation context.
  const recentMessages = await getRecentSessionMessages(sessionId, 20);
  const wasRefusal = lastAssistantMessageWasRefusal(recentMessages);
  const handoffType = classifyHandoffType({
    message: v.message,
    hint: v.type,
    lastAssistantWasRefusal: wasRefusal,
  });
  const priority = inferHandoffPriority({
    message: v.message,
    type: handoffType,
    preferred: v.priority,
  });

  // Concierge-handoff specific rate limit (5/hr, 2 urgent/hr).
  const handoffRl = await rateLimitHandoff({
    guestStayTokenId: stay.tokenId,
    isUrgent: priority === "urgent",
  });
  if (!handoffRl.allowed) {
    if (handoffRl.reason === "hourly_urgent") {
      // Spam pattern — log security event without blocking the rest of
      // the portal.
      await recordSecurityEvent({
        eventType: "suspicious_access",
        severity: "high",
        guestStayTokenId: stay.tokenId,
        bookingId: stay.bookingId,
        ipHash,
        userAgent: ua,
        metadata: { source: "guest_ai_handoff", reason: "urgent_spam" },
      });
      return {
        ok: false,
        error:
          "We've already received your urgent message. If this is a true emergency, please use the Emergency page in your stay menu.",
      };
    }
    return {
      ok: false,
      error:
        "You've reached the handoff limit for this hour. Use the Concierge & services form for anything that can wait.",
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Service is temporarily unavailable." };

  const lastMessagesSnapshot = summarizeLastMessages(
    snapshotMessages(recentMessages),
    3,
  );
  const safetyFlags = safetyFlagsFor(v.message);
  const guestSummary = redactHandoffContext(v.message);

  // Build the SR payload first (pure) then insert both rows.
  const srPayload = buildServiceRequestFromHandoff(
    {
      handoffType,
      priority,
      guestSummary,
      lastMessages: lastMessagesSnapshot,
      preferredContact: v.preferredContact || null,
    },
    {
      villaId: stay.villaId,
      bookingId: stay.bookingId,
      villaName: stay.villaName,
      villaCode: stay.villaCode,
      bookingCode: stay.bookingCode,
    },
  );

  const counter = await nextDailyCounter("SR");
  const requestCode = buildServiceRequestCode(counter);

  const [srRow] = await db
    .insert(serviceRequests)
    .values({
      requestCode,
      villaId: srPayload.villaId,
      bookingId: srPayload.bookingId,
      taskId: null,
      requestType: srPayload.requestType,
      title: srPayload.title,
      message: srPayload.message,
      status: "new",
      priority: srPayload.priority,
    })
    .returning({ id: serviceRequests.id });

  const [handoffRow] = await db
    .insert(guestAiHandoffs)
    .values({
      guestAiConciergeSessionId: sessionId,
      guestStayTokenId: stay.tokenId,
      bookingId: stay.bookingId,
      serviceRequestId: srRow!.id,
      handoffType,
      status: "linked_to_request",
      guestSummary,
      lastMessagesJson:
        lastMessagesSnapshot as unknown as typeof guestAiHandoffs.$inferInsert["lastMessagesJson"],
      safetyFlags: safetyFlags as unknown as typeof guestAiHandoffs.$inferInsert["safetyFlags"],
      priority,
      createdByIpHash: ipHash,
      createdByUserAgent: ua,
    })
    .returning({ id: guestAiHandoffs.id });

  // Audit + access log + (maybe) security event.
  await recordAuditEvent({
    actorUserId: null,
    action: "guest_ai.handoff.create",
    entityType: "guest_ai_handoff",
    entityId: handoffRow!.id,
    after: {
      handoffType,
      priority,
      bookingId: stay.bookingId,
      requestCode,
    },
  });

  if (handoffType === "emergency_concern") {
    await recordSecurityEvent({
      eventType: "suspicious_access",
      severity: "high",
      guestStayTokenId: stay.tokenId,
      bookingId: stay.bookingId,
      ipHash,
      userAgent: ua,
      metadata: {
        source: "guest_ai_handoff",
        reason: "emergency_concern",
      },
    });
  }

  // Notifications: concierge + property_manager always; ops_manager
  // also when urgent.
  await fanOutNotifications({
    handoffId: handoffRow!.id,
    handoffType,
    priority,
    organizationId: stay.organizationId,
    villaCode: stay.villaCode,
    bookingCode: stay.bookingCode,
    requestCode,
    guestPreview: guestSummary.slice(0, 120),
  });

  revalidatePath("/dashboard/guest-ai");
  revalidatePath("/dashboard/guest-ai/handoffs");
  return {
    ok: true,
    handoffId: handoffRow!.id,
    requestCode,
    handoffType,
  };
}

async function fanOutNotifications(args: {
  handoffId: string;
  handoffType: HandoffType;
  priority: "low" | "normal" | "high" | "urgent";
  organizationId: string | null;
  villaCode: string | null;
  bookingCode: string | null;
  requestCode: string;
  guestPreview: string;
}): Promise<void> {
  const recipients: string[] = ["concierge", "property_manager"];
  if (args.priority === "urgent") recipients.push("operations_manager");
  const isUrgent = args.priority === "urgent";
  const templateKey = isUrgent
    ? "guest_ai.handoff_urgent"
    : "guest_ai.handoff_created";
  const villa = args.villaCode ?? "villa";
  for (const role of recipients) {
    try {
      await queueNotification({
        recipientType: "role",
        organizationId: args.organizationId ?? undefined,
        channel: "in_app",
        templateKey,
        title: isUrgent
          ? `🚨 Urgent guest concierge handoff · ${villa}`
          : `Guest concierge handoff · ${villa}`,
        body: `${args.handoffType} · ${args.requestCode}\n${args.guestPreview}`,
        payload: {
          recipientRole: role,
          handoffId: args.handoffId,
          requestCode: args.requestCode,
          bookingCode: args.bookingCode,
          handoffType: args.handoffType,
          priority: args.priority,
        },
        priority: isUrgent ? "urgent" : "high",
        dedupeKey: `guest_ai_handoff:${args.handoffId}:${role}`,
      });
    } catch {
      // best-effort
    }
  }
}

// =============================================================================
// Admin-side: acknowledge / resolve / archive
// =============================================================================

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acknowledgeHandoffAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requirePermission("guest_ai.handoff.manage");
  const parsed = acknowledgeHandoffSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [handoff] = await db
    .select()
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, parsed.data.id))
    .limit(1);
  if (!handoff) return { ok: false, error: "Handoff not found." };
  await db
    .update(guestAiHandoffs)
    .set({
      status: "acknowledged",
      acknowledgedAt: new Date(),
    })
    .where(eq(guestAiHandoffs.id, parsed.data.id));
  // Drop a guest-visible system status reply so the guest sees the
  // acknowledgement in their request center.
  await appendSystemStatusReply({
    handoffId: parsed.data.id,
    status: "acknowledged",
    actorLabel: me?.fullName ?? null,
    actorAppUserId: me?.id ?? null,
    serviceRequestId: handoff.serviceRequestId,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.handoff.acknowledge",
    entityType: "guest_ai_handoff",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/guest-ai/handoffs");
  revalidatePath(`/dashboard/guest-ai/handoffs/${parsed.data.id}`);
  return { ok: true };
}

export async function resolveHandoffAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requirePermission("guest_ai.handoff.manage");
  const parsed = resolveHandoffSchema.safeParse({
    id: formData.get("id"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [handoff] = await db
    .select()
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, parsed.data.id))
    .limit(1);
  if (!handoff) return { ok: false, error: "Handoff not found." };
  await db
    .update(guestAiHandoffs)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
    })
    .where(eq(guestAiHandoffs.id, parsed.data.id));

  // System resolution reply (visible to guest).
  await appendSystemStatusReply({
    handoffId: parsed.data.id,
    status: "resolved",
    actorLabel: me?.fullName ?? null,
    actorAppUserId: me?.id ?? null,
    serviceRequestId: handoff.serviceRequestId,
  });

  // If the operator left a note, also drop it as a guest-visible
  // staff message via the same path (redacted on insert).
  if (parsed.data.note) {
    const fd = new FormData();
    fd.set("handoffId", parsed.data.id);
    fd.set("visibility", "guest_visible");
    fd.set("body", parsed.data.note);
    const { createStaffHandoffReplyAction } = await import(
      "./replies-actions"
    );
    await createStaffHandoffReplyAction(null, fd);
  }

  // Notify the guest (in-app inbox row keyed on the booking; if the
  // notification system can't deliver to a token-bound recipient, this
  // still lands in admin audit). v9J keeps it best-effort.
  try {
    // Org anchor: handoff row's org (0154 backfill), else the stay token's
    // org (guest_stay_tokens.organization_id is NOT NULL).
    let organizationId: string | null = handoff.organizationId;
    if (!organizationId) {
      const [tok] = await db
        .select({ organizationId: guestStayTokens.organizationId })
        .from(guestStayTokens)
        .where(eq(guestStayTokens.id, handoff.guestStayTokenId))
        .limit(1);
      organizationId = tok?.organizationId ?? null;
    }
    await queueNotification({
      recipientType: "guest",
      organizationId: organizationId ?? undefined,
      channel: "in_app",
      templateKey: "guest_ai.handoff_resolved_guest",
      title: "Your concierge request was resolved",
      body: "Open your stay portal to read the team's reply.",
      payload: {
        handoffId: parsed.data.id,
        bookingId: handoff.bookingId,
      },
      priority: "normal",
      dedupeKey: `guest_ai_resolved:${parsed.data.id}`,
    });
  } catch {
    // best-effort
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.handoff.resolve",
    entityType: "guest_ai_handoff",
    entityId: parsed.data.id,
    after: { note: parsed.data.note ?? null },
  });
  revalidatePath("/dashboard/guest-ai/handoffs");
  revalidatePath(`/dashboard/guest-ai/handoffs/${parsed.data.id}`);
  return { ok: true };
}

export async function archiveSessionAction(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requirePermission("guest_ai.manage");
  const id = formData.get("id");
  if (typeof id !== "string" || id.length < 16)
    return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(guestAiConciergeSessions)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(guestAiConciergeSessions.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_ai.session.archive",
    entityType: "guest_ai_concierge_session",
    entityId: id,
  });
  revalidatePath("/dashboard/guest-ai");
  revalidatePath("/dashboard/guest-ai/sessions");
  revalidatePath(`/dashboard/guest-ai/sessions/${id}`);
  return { ok: true };
}
