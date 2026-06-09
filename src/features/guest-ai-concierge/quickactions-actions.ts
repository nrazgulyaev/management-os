"use server";

/**
 * P1 design-live gap — Concierge composer quick-actions ("spawn work").
 *
 * The /dashboard/concierge thread is live, but the composer was reply-only.
 * The design calls for contextual spawn-work actions a concierge can fire
 * straight from a guest conversation:
 *
 *   - Cleaning request        → operations service request (cleaning)
 *   - Call-technician request → operations maintenance task
 *   - Add extra service       → booking charge ledger line
 *   - Take over               → flip the session to staff handoff
 *   - Escalate to operator    → admin-initiated handoff + operator notify
 *
 * Each action is SESSION-SCOPED: it resolves the session's booking context
 * (booking / villa / guest) once, then delegates to the EXISTING operations,
 * bookings and handoff primitives — no new tables, no duplicated business
 * logic. Gated to staff who can manage guests (same gate as the rest of the
 * concierge cabinet) and every state write is audit-logged.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import {
  guestAiConciergeSessions,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";
import { bookings } from "@/lib/db/schema/bookings";
import { serviceRequests } from "@/lib/db/schema/operations";

import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { queueNotification } from "@/features/notifications/services";
import { buildServiceRequestCode } from "@/features/operations/codes";
import { nextDailyCounter } from "@/features/operations/services";

import {
  createServiceRequestAction,
  createOperationTaskAction,
} from "@/features/operations/actions";
import { addBookingChargeAction } from "@/features/bookings/detail-actions";
import { appendMessage } from "./services";

const idSchema = z.string().uuid();

export type QuickActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

interface SessionContext {
  sessionId: string;
  guestStayTokenId: string;
  bookingId: string | null;
  villaId: string | null;
  guestId: string | null;
  status: string;
}

/**
 * Resolve the booking context behind a concierge session. The session
 * carries `booking_id`; the booking carries the canonical villa + guest.
 * Returns null when the session (or its db) cannot be found.
 */
async function loadSessionContext(
  sessionId: string,
): Promise<SessionContext | null> {
  const db = getDb();
  if (!db) return null;
  const [session] = await db
    .select({
      id: guestAiConciergeSessions.id,
      guestStayTokenId: guestAiConciergeSessions.guestStayTokenId,
      bookingId: guestAiConciergeSessions.bookingId,
      status: guestAiConciergeSessions.status,
    })
    .from(guestAiConciergeSessions)
    .where(eq(guestAiConciergeSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  let villaId: string | null = null;
  let guestId: string | null = null;
  if (session.bookingId) {
    const [booking] = await db
      .select({ villaId: bookings.villaId, guestId: bookings.guestId })
      .from(bookings)
      .where(eq(bookings.id, session.bookingId))
      .limit(1);
    villaId = booking?.villaId ?? null;
    guestId = booking?.guestId ?? null;
  }
  return {
    sessionId: session.id,
    guestStayTokenId: session.guestStayTokenId,
    bookingId: session.bookingId,
    villaId,
    guestId,
    status: session.status,
  };
}

/** Shared gate + session resolution for every quick-action below. */
async function guardSession(
  sessionId: string,
): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; error: string }
> {
  if (!(await canManageEntity("guest"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: "Invalid session." };
  }
  const ctx = await loadSessionContext(sessionId);
  if (!ctx) return { ok: false, error: "Session not found." };
  return { ok: true, ctx };
}

/**
 * Drop a staff-authored note into the transcript marking that work was
 * spawned, so the conversation keeps an inline trail (guest never sees the
 * internal `model="staff"` tag — it renders as a concierge note).
 */
async function noteOnThread(sessionId: string, body: string): Promise<void> {
  const me = await getCurrentAppUser();
  await appendMessage({
    sessionId,
    role: "system",
    content: body,
    safetyStatus: "ok",
    model: "staff",
    toolContextJson: { author: "staff", staffUserId: me?.id ?? null },
  });
}

// =============================================================================
// 1 + 2 — Operations work: cleaning request + call-technician request.
//   Reuses the existing operations create actions (permission-gated +
//   audited there). We only resolve the booking context and build the
//   FormData payload they already expect.
// =============================================================================

export async function createConciergeCleaningRequestAction(
  sessionId: string,
): Promise<QuickActionResult> {
  const guard = await guardSession(sessionId);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const fd = new FormData();
  fd.set("title", "Cleaning — guest request via concierge");
  fd.set(
    "message",
    "Raised from the concierge inbox while assisting the guest in chat.",
  );
  fd.set("requestType", "cleaning");
  fd.set("priority", "normal");
  if (ctx.villaId) fd.set("villaId", ctx.villaId);
  if (ctx.bookingId) fd.set("bookingId", ctx.bookingId);
  if (ctx.guestId) fd.set("guestId", ctx.guestId);

  const res = await createServiceRequestAction(null, fd);
  if (!res.ok) {
    return { ok: false, error: res.error ?? "Could not raise cleaning request." };
  }
  await noteOnThread(sessionId, "Cleaning request raised for this stay.");
  revalidatePath("/dashboard/concierge");
  return { ok: true, message: "Cleaning request raised." };
}

export async function createConciergeTechnicianRequestAction(
  sessionId: string,
): Promise<QuickActionResult> {
  const guard = await guardSession(sessionId);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const fd = new FormData();
  fd.set("title", "Call technician — guest reported issue via concierge");
  fd.set(
    "description",
    "Raised from the concierge inbox while assisting the guest in chat.",
  );
  fd.set("category", "maintenance");
  fd.set("priority", "high");
  fd.set("source", "guest");
  if (ctx.villaId) fd.set("villaId", ctx.villaId);
  if (ctx.bookingId) fd.set("bookingId", ctx.bookingId);
  if (ctx.guestId) fd.set("guestId", ctx.guestId);

  const res = await createOperationTaskAction(null, fd);
  if (!res.ok) {
    return {
      ok: false,
      error: res.error ?? "Could not raise technician request.",
    };
  }
  await noteOnThread(sessionId, "Technician dispatch task raised for this stay.");
  revalidatePath("/dashboard/concierge");
  return { ok: true, message: "Technician request raised." };
}

// =============================================================================
// 3 — Add extra service to the linked booking (booking charge ledger line).
//   Reuses addBookingChargeAction. Money is handled there in MINOR units /
//   ledger conventions; we only forward the operator's description + amount.
// =============================================================================

const extraServiceSchema = z.object({
  description: z.string().trim().min(2, "Describe the service.").max(200),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.string().length(3).toUpperCase().default("IDR"),
});

export async function addConciergeExtraServiceAction(
  sessionId: string,
  input: { description: string; amount: number; currency?: string },
): Promise<QuickActionResult> {
  const guard = await guardSession(sessionId);
  if (!guard.ok) return guard;
  const { ctx } = guard;
  if (!ctx.bookingId) {
    return {
      ok: false,
      error: "This session has no linked booking to bill an extra service to.",
    };
  }
  const parsed = extraServiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please review the service.",
    };
  }

  const fd = new FormData();
  fd.set("chargeType", "service");
  fd.set("description", parsed.data.description);
  fd.set("amount", String(parsed.data.amount));
  fd.set("direction", "charge");
  fd.set("currency", parsed.data.currency);

  const res = await addBookingChargeAction(ctx.bookingId, fd);
  if (!res.ok) {
    return { ok: false, error: res.error ?? "Could not add the extra service." };
  }
  await noteOnThread(
    sessionId,
    `Extra service added to the booking: ${parsed.data.description}.`,
  );
  revalidatePath("/dashboard/concierge");
  return { ok: true, message: "Extra service added to the booking." };
}

// =============================================================================
// 4 — Take over: explicitly flip the session to a staff-handled state so it
//   leaves the AI's hands. Renders under the "Handoff" filter in the inbox.
// =============================================================================

export async function takeOverConciergeSessionAction(
  sessionId: string,
): Promise<QuickActionResult> {
  const guard = await guardSession(sessionId);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  if (ctx.status === "handoff") {
    return { ok: true, message: "You are already handling this session." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  await db
    .update(guestAiConciergeSessions)
    .set({ status: "handoff", updatedAt: new Date() })
    .where(eq(guestAiConciergeSessions.id, sessionId));

  await noteOnThread(
    sessionId,
    `${me?.fullName ?? "A staff member"} has taken over this conversation.`,
  );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "concierge.session.takeover",
    entityType: "concierge_session",
    entityId: sessionId,
    before: { status: ctx.status },
    after: { status: "handoff" },
  });

  revalidatePath("/dashboard/concierge");
  return { ok: true, message: "You are now handling this session." };
}

// =============================================================================
// 5 — Escalate to operator: admin-initiated handoff. Mirrors the guest-side
//   submitHandoffAction (service request + handoff row + operator notify) but
//   originates from staff inside the cabinet.
// =============================================================================

export async function escalateConciergeToOperatorAction(
  sessionId: string,
): Promise<QuickActionResult> {
  const guard = await guardSession(sessionId);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const summary =
    "Escalated to operator from the concierge inbox by staff for hands-on follow-up.";

  // Link a service request so the escalation lands in the ops queue too.
  const counter = await nextDailyCounter("SR");
  const requestCode = buildServiceRequestCode(counter);
  const [srRow] = await db
    .insert(serviceRequests)
    .values({
      requestCode,
      villaId: ctx.villaId,
      bookingId: ctx.bookingId,
      taskId: null,
      requestType: "concierge",
      title: "Concierge escalation — operator follow-up",
      message: summary,
      status: "new",
      priority: "high",
    })
    .returning({ id: serviceRequests.id });

  const [handoffRow] = await db
    .insert(guestAiHandoffs)
    .values({
      guestAiConciergeSessionId: sessionId,
      guestStayTokenId: ctx.guestStayTokenId,
      bookingId: ctx.bookingId,
      serviceRequestId: srRow?.id ?? null,
      handoffType: "staff_escalation",
      status: "linked_to_request",
      guestSummary: summary,
      priority: "high",
    })
    .returning({ id: guestAiHandoffs.id });

  // Flip the session to handoff so it surfaces in the cabinet filter.
  await db
    .update(guestAiConciergeSessions)
    .set({ status: "handoff", updatedAt: new Date() })
    .where(eq(guestAiConciergeSessions.id, sessionId));

  await noteOnThread(
    sessionId,
    "This conversation has been escalated to an operator for follow-up.",
  );

  // Best-effort operator notification.
  try {
    await queueNotification({
      recipientType: "role",
      channel: "in_app",
      templateKey: "guest_ai.handoff_created",
      title: "Concierge escalation · operator follow-up",
      body: `${requestCode} · ${summary}`,
      payload: {
        recipientRole: "operations_manager",
        handoffId: handoffRow?.id ?? null,
        sessionId,
        requestCode,
      },
      priority: "high",
      dedupeKey: `concierge_escalation:${handoffRow?.id ?? sessionId}`,
    });
  } catch {
    // best-effort
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "concierge.session.escalate",
    entityType: "concierge_session",
    entityId: sessionId,
    after: { handoffId: handoffRow?.id ?? null, requestCode },
  });

  revalidatePath("/dashboard/concierge");
  return { ok: true, message: "Escalated to operator." };
}
