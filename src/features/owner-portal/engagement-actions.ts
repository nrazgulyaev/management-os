"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { ownerGuestPreapprovals } from "@/lib/db/schema/owner-guest-preapprovals";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { ownerActivityLog } from "@/lib/db/schema/owner-activity-log";
import { villas } from "@/lib/db/schema/projects";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import { recordAuditEvent } from "@/features/audit/services";
import { uploadDocument } from "@/features/storage/storage-service";
import {
  defaultCallSlots,
  formatSlot,
  type InlineActionsPayload,
  type MessageAttachmentRef,
  type OwnerActionState,
  type OwnerVillaOption,
  type ScheduleCallResult,
} from "@/features/owner-portal/engagement-types";

/**
 * OWNER-ENGAGEMENT (#168 follow-up).
 *
 * Makes the owner-home quick-actions and inbox scheduling chips REAL:
 *   - preApproveGuestAction        → owner_guest_preapprovals + a thread
 *   - scheduleQReviewCallAction    → opens a q_review thread with scheduling chips
 *   - respondToSchedulingAction    → owner accepts a slot / asks to propose another
 *   - attachFileToThreadAction     → paperclip → documents + owner_messages.attachments
 *   - listOwnerVillaOptions        → ownership-scoped villa picker
 *
 * Every export is async (this is a "use server" module — pure helpers/types
 * live in engagement-types.ts). All writes are owner-scoped via
 * requireOwnerWrite (impersonating super-admins are read-only) and
 * audit-logged. No money columns are touched.
 */

// ---------------------------------------------------------------------------
// Villa options (ownership-scoped) — used by the pre-approve-guest picker.
// ---------------------------------------------------------------------------

export async function listOwnerVillaOptions(ownerId: string): Promise<OwnerVillaOption[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: villas.id,
      code: villas.unitCode,
      name: villas.name,
    })
    .from(ownershipShares)
    .innerJoin(villas, eq(villas.id, ownershipShares.villaId))
    .where(and(eq(ownershipShares.ownerId, ownerId), eq(ownershipShares.status, "active")))
    .orderBy(villas.unitCode)
    .limit(50);

  const seen = new Set<string>();
  const out: OwnerVillaOption[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const name = (r.name ?? r.code ?? "Villa").replace(/^\[DEMO2\] /, "");
    out.push({ id: r.id, label: r.code ? `${r.code} · ${name}` : name });
  }
  return out;
}

/** Confirm a villa belongs to this owner (active share). */
async function ownerOwnsVilla(
  db: NonNullable<ReturnType<typeof getDb>>,
  ownerId: string,
  villaId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ownershipShares.id })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.ownerId, ownerId),
        eq(ownershipShares.villaId, villaId),
        eq(ownershipShares.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Pre-approve a guest.
// ---------------------------------------------------------------------------

const preApproveSchema = z
  .object({
    villaId: z.string().uuid(),
    guestName: z.string().trim().min(2, "Add the guest's name.").max(120),
    guestRelationship: z.string().trim().max(80).optional().or(z.literal("")),
    partySize: z.coerce.number().int().min(1).max(20),
    arriveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an arrival date."),
    departOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a departure date."),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => v.departOn > v.arriveOn, {
    message: "Departure must be after arrival.",
    path: ["departOn"],
  });

export async function preApproveGuestAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = preApproveSchema.safeParse({
    villaId: formData.get("villaId"),
    guestName: formData.get("guestName"),
    guestRelationship: formData.get("guestRelationship"),
    partySize: formData.get("partySize"),
    arriveOn: formData.get("arriveOn"),
    departOn: formData.get("departOn"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const d = parsed.data;

  if (!(await ownerOwnsVilla(db, auth.ownerId, d.villaId))) {
    return { ok: false, error: "That villa is not in your portfolio." };
  }

  const relationship = d.guestRelationship || null;
  const notes = d.notes || null;

  // Open a thread so mgmt can discuss the pre-approval inline.
  const subject = `Pre-approved guest · ${d.guestName}`;
  const [thread] = await db
    .insert(ownerThreads)
    .values({
      ownerId: auth.ownerId,
      subject,
      kind: "personal_stay_request",
      relatedEntityType: "guest_preapproval",
      status: "open",
      unreadCount: 1,
    })
    .returning({ id: ownerThreads.id });

  const [preapproval] = await db
    .insert(ownerGuestPreapprovals)
    .values({
      ownerId: auth.ownerId,
      villaId: d.villaId,
      guestName: d.guestName,
      guestRelationship: relationship,
      partySize: d.partySize,
      arriveOn: d.arriveOn,
      departOn: d.departOn,
      notes,
      status: "requested",
      threadId: thread.id,
      createdByAppUserId: auth.appUserId,
    })
    .returning({ id: ownerGuestPreapprovals.id });

  // Link the thread back + seed the first message.
  await db
    .update(ownerThreads)
    .set({ relatedEntityId: preapproval.id })
    .where(eq(ownerThreads.id, thread.id));

  const body = [
    `I'd like to pre-approve **${d.guestName}**${relationship ? ` (${relationship})` : ""} to stay at this villa.`,
    `Party of ${d.partySize}, arriving ${d.arriveOn} and departing ${d.departOn}.`,
    notes ? `Notes: ${notes}` : null,
    "No booking is needed — this is a courtesy authorisation. Please confirm.",
  ]
    .filter(Boolean)
    .join("\n");

  await db.insert(ownerMessages).values({
    threadId: thread.id,
    actorKind: "owner",
    actorId: auth.appUserId,
    body,
  });

  await db.insert(ownerActivityLog).values({
    ownerId: auth.ownerId,
    kind: "message_received",
    relatedEntityType: "guest_preapproval",
    relatedEntityId: preapproval.id,
    subject: "Guest pre-approval submitted",
    body: `${d.guestName} · ${d.arriveOn} → ${d.departOn}`,
    linkUrl: `/owner/inbox?thread=${thread.id}`,
  });

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner_portal.guest.preapprove",
    entityType: "owner_guest_preapproval",
    entityId: preapproval.id,
    after: {
      ownerId: auth.ownerId,
      villaId: d.villaId,
      guestName: d.guestName,
      arriveOn: d.arriveOn,
      departOn: d.departOn,
      threadId: thread.id,
    },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/inbox");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Schedule a Q-review call — opens a q_review thread with scheduling chips.
// ---------------------------------------------------------------------------

const scheduleCallSchema = z.object({
  topic: z.string().trim().max(400).optional().or(z.literal("")),
});

export async function scheduleQReviewCallAction(
  _prev: ScheduleCallResult | null,
  formData: FormData,
): Promise<ScheduleCallResult> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = scheduleCallSchema.safeParse({ topic: formData.get("topic") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const topic = parsed.data.topic || null;

  // Reuse an already-open q_review request thread rather than spawning dupes.
  const [existing] = await db
    .select({ id: ownerThreads.id })
    .from(ownerThreads)
    .where(
      and(
        eq(ownerThreads.ownerId, auth.ownerId),
        eq(ownerThreads.kind, "tax_question"),
        eq(ownerThreads.relatedEntityType, "q_review_call"),
        eq(ownerThreads.status, "open"),
      ),
    )
    .orderBy(desc(ownerThreads.lastMessageAt))
    .limit(1);

  let threadId: string;
  if (existing) {
    threadId = existing.id;
  } else {
    const [thread] = await db
      .insert(ownerThreads)
      .values({
        ownerId: auth.ownerId,
        subject: "Quarterly review call",
        kind: "tax_question",
        relatedEntityType: "q_review_call",
        status: "open",
        unreadCount: 1,
      })
      .returning({ id: ownerThreads.id });
    threadId = thread.id;
  }

  // Owner's request message.
  const ownerBody = topic
    ? `I'd like to schedule a 15-minute quarterly review call. Topic: ${topic}`
    : "I'd like to schedule a 15-minute quarterly review call.";
  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "owner",
    actorId: auth.appUserId,
    body: ownerBody,
  });

  // System message offering three slots as structured scheduling chips.
  const slots = defaultCallSlots();
  const inlineActions: InlineActionsPayload = { scheduling: slots };
  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "system",
    actorId: null,
    body: "Your director will confirm a 15-minute call. Pick a time that works, or ask for another.",
    inlineActions,
  });

  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${ownerThreads.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ownerThreads.id, threadId));

  await db.insert(ownerActivityLog).values({
    ownerId: auth.ownerId,
    kind: "q_review_scheduled",
    relatedEntityType: "owner_thread",
    relatedEntityId: threadId,
    subject: "Review call requested",
    body: topic ?? "15-minute quarterly review",
    linkUrl: `/owner/inbox?thread=${threadId}`,
  });

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner_portal.q_review.request",
    entityType: "owner_thread",
    entityId: threadId,
    after: { ownerId: auth.ownerId, topic, slots: slots.length },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/inbox");
  return { ok: true, threadId };
}

// ---------------------------------------------------------------------------
// Respond to a scheduling chip inside a Q-review thread.
// ---------------------------------------------------------------------------

const respondSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  actionId: z.string().min(1).max(80),
  proposedNote: z.string().trim().max(400).optional().or(z.literal("")),
});

export async function respondToSchedulingAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = respondSchema.safeParse({
    threadId: formData.get("threadId"),
    messageId: formData.get("messageId"),
    actionId: formData.get("actionId"),
    proposedNote: formData.get("proposedNote"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid response." };
  }
  const { threadId, messageId, actionId, proposedNote } = parsed.data;

  // Authorize: the thread must belong to this owner.
  const [thread] = await db
    .select({ id: ownerThreads.id, ownerId: ownerThreads.ownerId })
    .from(ownerThreads)
    .where(eq(ownerThreads.id, threadId))
    .limit(1);
  if (!thread || thread.ownerId !== auth.ownerId) {
    return { ok: false, error: "Conversation not found." };
  }

  // Load the offering message + verify it belongs to the thread and carries
  // the named scheduling action (prevents a crafted actionId from firing).
  const [offer] = await db
    .select({ id: ownerMessages.id, threadId: ownerMessages.threadId, inlineActions: ownerMessages.inlineActions })
    .from(ownerMessages)
    .where(eq(ownerMessages.id, messageId))
    .limit(1);
  if (!offer || offer.threadId !== threadId) {
    return { ok: false, error: "That scheduling message is no longer available." };
  }
  const payload = (offer.inlineActions ?? {}) as InlineActionsPayload;
  const chosen = payload.scheduling?.find((a) => a.id === actionId);
  if (!chosen) {
    return { ok: false, error: "That time is no longer offered." };
  }

  let body: string;
  if (chosen.kind === "accept_slot" && chosen.slotIso) {
    body = `Confirmed — ${formatSlot(chosen.slotIso)} works for me. Talk then.`;
  } else {
    body = proposedNote
      ? `None of those work — could we try: ${proposedNote}?`
      : "None of those times work for me — could you propose a few others?";
  }

  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "owner",
    actorId: auth.appUserId,
    body,
  });

  // Consume the chips on the offering message so they can't be re-clicked.
  const consumed: InlineActionsPayload = {
    scheduling: (payload.scheduling ?? []).map((a) => ({
      ...a,
      label:
        a.id === actionId
          ? chosen.kind === "accept_slot"
            ? `Accepted · ${chosen.slotIso ? formatSlot(chosen.slotIso) : ""}`.trim()
            : "Asked to propose another time"
          : a.label,
    })),
  };
  await db
    .update(ownerMessages)
    .set({ inlineActions: { ...consumed, resolved: true, resolvedActionId: actionId } })
    .where(eq(ownerMessages.id, messageId));

  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${ownerThreads.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ownerThreads.id, threadId));

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action:
      chosen.kind === "accept_slot"
        ? "owner_portal.q_review.accept_slot"
        : "owner_portal.q_review.propose_time",
    entityType: "owner_thread",
    entityId: threadId,
    after: { messageId, actionId, slotIso: chosen.slotIso ?? null, proposedNote: proposedNote || null },
  });

  revalidatePath("/owner/inbox");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attach a file to a thread reply (paperclip affordance).
// ---------------------------------------------------------------------------

const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "text/plain",
]);

export async function attachFileToThreadAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const threadId = String(formData.get("threadId") ?? "");
  if (!z.string().uuid().safeParse(threadId).success) {
    return { ok: false, error: "Pick a conversation first." };
  }
  const note = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to attach." };
  }
  if (file.size > MAX_ATTACH_BYTES) {
    return { ok: false, error: "Files must be 10 MB or smaller." };
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "Attach a PDF, image, or text file." };
  }

  // Authorize: the thread must belong to this owner.
  const [thread] = await db
    .select({ id: ownerThreads.id, ownerId: ownerThreads.ownerId })
    .from(ownerThreads)
    .where(eq(ownerThreads.id, threadId))
    .limit(1);
  if (!thread || thread.ownerId !== auth.ownerId) {
    return { ok: false, error: "Conversation not found." };
  }

  const orgId = await getOwnerOrgId(auth.ownerId).catch(() => null);
  if (!orgId) {
    return { ok: false, error: "Could not resolve your organisation for upload." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = await uploadDocument({
    organizationId: orgId,
    entityType: "owner",
    entityId: auth.ownerId,
    documentType: "other",
    title: file.name || "Attachment",
    fileName: file.name || "attachment",
    mimeType: mime,
    bytes,
    visibility: "owner_visible",
    uploadedBy: auth.appUserId,
  });
  if (!upload.ok || !upload.documentId) {
    return {
      ok: false,
      error: upload.error?.includes("Supabase")
        ? "File storage isn't configured in this environment."
        : (upload.error ?? "Upload failed."),
    };
  }

  const attachment: MessageAttachmentRef = {
    documentId: upload.documentId,
    name: file.name || "Attachment",
    mimeType: mime,
    sizeBytes: file.size,
  };

  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "owner",
    actorId: auth.appUserId,
    body: note || `Attached ${attachment.name}`,
    attachments: [attachment],
  });

  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${ownerThreads.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ownerThreads.id, threadId));

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner_portal.thread.attach_file",
    entityType: "owner_thread",
    entityId: threadId,
    after: { documentId: upload.documentId, name: attachment.name, sizeBytes: file.size },
  });

  revalidatePath("/owner/inbox");
  return { ok: true };
}
