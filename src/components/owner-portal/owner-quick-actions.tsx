"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PreApproveGuestModal } from "@/components/owner-portal/preapprove-guest-modal";
import { ScheduleCallModal } from "@/components/owner-portal/schedule-call-modal";
import {
  preApproveGuestAction,
  scheduleQReviewCallAction,
} from "@/features/owner-portal/engagement-actions";
import type { OwnerVillaOption } from "@/features/owner-portal/engagement-types";

/**
 * OWNER-ENGAGEMENT (#168 follow-up) — owner home quick-actions.
 *
 * Replaces the two deep-link cards ("Pre-approve a guest" → generic
 * inbox; "Schedule a review call" → settings) with REAL flows:
 *   - Pre-approve a guest → PreApproveGuestModal → owner_guest_preapprovals
 *   - Schedule a review call → ScheduleCallModal → q_review thread + chips
 *
 * The two link cards (personal stay / message) keep their hrefs. Same
 * .quick-action-grid / .qa-card visual lineage as QuickActionGrid.
 */

const ICON = {
  stay: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  guest: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </svg>
  ),
  message: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  call: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

function Card({
  icon,
  label,
  context,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  context: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="qa-card qa-card-button" onClick={onClick}>
      <span className="qa-icon" aria-hidden>{icon}</span>
      <span className="qa-body">
        <span className="qa-label">{label}</span>
        <span className="qa-ctx">{context}</span>
      </span>
    </button>
  );
}

export function OwnerQuickActions({ villas }: { villas: OwnerVillaOption[] }) {
  const router = useRouter();
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [callOpen, setCallOpen] = React.useState(false);

  async function submitPreApprove(values: {
    villaId: string;
    guestName: string;
    guestRelationship: string;
    partySize: number;
    arriveOn: string;
    departOn: string;
    notes: string;
  }) {
    const fd = new FormData();
    fd.set("villaId", values.villaId);
    fd.set("guestName", values.guestName);
    fd.set("guestRelationship", values.guestRelationship);
    fd.set("partySize", String(values.partySize));
    fd.set("arriveOn", values.arriveOn);
    fd.set("departOn", values.departOn);
    fd.set("notes", values.notes);
    const res = await preApproveGuestAction(null, fd);
    if (res.ok) router.refresh();
    return res;
  }

  async function submitCall(topic: string) {
    const fd = new FormData();
    fd.set("topic", topic);
    const res = await scheduleQReviewCallAction(null, fd);
    if (res.ok && res.threadId) router.push(`/owner/inbox?thread=${res.threadId}`);
    return res;
  }

  return (
    <>
      <div className="quick-action-grid">
        <Link className="qa-card" href="/owner/stays/new">
          <span className="qa-icon" aria-hidden>{ICON.stay}</span>
          <span className="qa-body">
            <span className="qa-label">Request personal stay</span>
            <span className="qa-ctx">Pick dates · mgmt confirms</span>
          </span>
        </Link>
        <Card
          icon={ICON.guest}
          label="Pre-approve a guest"
          context="Friends without a booking"
          onClick={() => setGuestOpen(true)}
        />
        <Link className="qa-card" href="/owner/inbox">
          <span className="qa-icon" aria-hidden>{ICON.message}</span>
          <span className="qa-body">
            <span className="qa-label">Message mgmt team</span>
            <span className="qa-ctx">Your dedicated operators</span>
          </span>
        </Link>
        <Card
          icon={ICON.call}
          label="Schedule a review call"
          context="15-min · director"
          onClick={() => setCallOpen(true)}
        />
      </div>

      <PreApproveGuestModal
        open={guestOpen}
        onOpenChange={setGuestOpen}
        villas={villas}
        onSubmit={submitPreApprove}
      />
      <ScheduleCallModal open={callOpen} onOpenChange={setCallOpen} onSubmit={submitCall} />
    </>
  );
}
