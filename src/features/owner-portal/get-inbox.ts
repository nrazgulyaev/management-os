/**
 * Phase 2.3 owner-05 — getOwnerInbox / getOwnerThread.
 *
 * Server fns that resolve inbox data. Both ownership-scoped to
 * prevent thread leakage across owners.
 *
 * Today returns empty lists; the data PR wires `owner_threads` +
 * `owner_messages` tables and the read paths through them.
 */

import "server-only";
import type { ThreadListItem } from "@/components/owner-portal/thread-list";
import type { ThreadMessage } from "@/components/owner-portal/thread-view";

export interface OwnerInboxResult {
  threads: ThreadListItem[];
  totalUnread: number;
}

export interface OwnerThreadResult {
  threadId: string;
  subject: string;
  counterpart: string;
  messages: ThreadMessage[];
}

export async function getOwnerInbox(ownerId: string): Promise<OwnerInboxResult> {
  void ownerId;
  return { threads: [], totalUnread: 0 };
}

export async function getOwnerThread(
  ownerId: string,
  threadId: string,
): Promise<OwnerThreadResult | null> {
  void ownerId;
  void threadId;
  return null;
}
