/**
 * Phase 2.4 mgmt-04 — Concierge cabinet data fns.
 *
 * Surfaces:
 *   getInbox          — RequestInbox rows
 *   getThread         — single stay's messages + meta
 *   getJourney        — moments timeline
 *   getCompOffered    — running comp list for a booking
 *   postStaffMessage  — write a staff message
 *
 * Today returns stubs.
 */

import "server-only";
import type { RequestInboxItem } from "@/components/concierge/request-inbox";
import type { ConciergeMessage } from "@/components/concierge/thread";
import type { JourneyMoment } from "@/components/concierge/journey-timeline";
import type { CompOfferedRow } from "@/components/concierge/comp-watch";

export async function getInbox(): Promise<RequestInboxItem[]> {
  return [];
}

export interface GetThreadResult {
  threadId: string;
  bookingId: string;
  guestName: string;
  villaCode: string;
  messages: ConciergeMessage[];
}

export async function getThread(stayId: string): Promise<GetThreadResult | null> {
  void stayId;
  return null;
}

export async function getJourney(bookingId: string): Promise<JourneyMoment[]> {
  void bookingId;
  return [];
}

export async function getCompOffered(bookingId: string): Promise<CompOfferedRow[]> {
  void bookingId;
  return [];
}

export interface PostStaffMessageInput {
  threadId: string;
  staffUserId: string;
  body: string;
}

export async function postStaffMessage(_input: PostStaffMessageInput): Promise<{ messageId: string }> {
  return { messageId: "stub" };
}
