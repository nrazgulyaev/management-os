/**
 * OWNER-ENGAGEMENT — pure types + helpers shared by the owner engagement
 * server actions and their client components.
 *
 * Kept OUT of engagement-actions.ts because that file is "use server" (it may
 * only export async functions). Safe to import from client components.
 */

import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";

export type { OwnerActionState };

/** Villa option for the pre-approve-guest picker. */
export interface OwnerVillaOption {
  id: string;
  label: string;
}

/** Outcome of opening (or finding) a Q-review call thread. */
export interface ScheduleCallResult extends OwnerActionState {
  /** The owner_threads id of the conversation that was opened / reused. */
  threadId?: string;
}

/**
 * Structured scheduling action stored on owner_messages.inline_actions, surfaced
 * as chips in the inbox ("Accept · <time>" / "Propose different time"). The
 * `kind` discriminates how the owner's click is handled by the server action.
 */
export interface SchedulingInlineAction {
  /** Stable id so the server can resolve which slot was accepted. */
  id: string;
  kind: "accept_slot" | "propose_time";
  label: string;
  /** ISO datetime for accept_slot; absent for propose_time. */
  slotIso?: string;
}

/** Shape of owner_messages.inline_actions when it carries scheduling chips. */
export interface InlineActionsPayload {
  scheduling?: SchedulingInlineAction[];
}

/** Shape of owner_messages.attachments entries (documents-pattern refs). */
export interface MessageAttachmentRef {
  documentId: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

/** Three default 15-min Q-review slots offered when a call is requested. */
export function defaultCallSlots(now = new Date()): SchedulingInlineAction[] {
  const slots: SchedulingInlineAction[] = [];
  // Next 3 business-ish weekdays at 10:00 local-equivalent (UTC for storage).
  const cursor = new Date(now);
  cursor.setUTCHours(10, 0, 0, 0);
  let added = 0;
  let guard = 0;
  while (added < 3 && guard < 14) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue; // skip Sat/Sun
    const iso = cursor.toISOString();
    slots.push({
      id: `slot-${iso.slice(0, 13)}`,
      kind: "accept_slot",
      label: `Accept · ${formatSlot(iso)}`,
      slotIso: iso,
    });
    added += 1;
  }
  slots.push({ id: "propose", kind: "propose_time", label: "Propose different time" });
  return slots;
}

export function formatSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
