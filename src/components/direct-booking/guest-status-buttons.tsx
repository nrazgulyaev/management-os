"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  rebuildDirectBookingGuestStatusAction,
  adminQueueGuestNotificationAction,
  adminReplyToGuestBookingThreadAction,
  adminSetGuestThreadStatusAction,
  adminMarkThreadReadAction,
} from "@/features/direct-booking/guest-status-actions";

function PendingButton({ label, busyLabel, small }: { label: string; busyLabel: string; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={small ? "sm" : undefined} disabled={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}

export function RebuildSnapshotButton({
  holdId,
}: {
  holdId: string;
}) {
  const [state, action] = useFormState(rebuildDirectBookingGuestStatusAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="holdId" value={holdId} />
      <PendingButton label="Rebuild snapshot" busyLabel="Rebuilding…" small />
      {state && state.ok && (
        <span className="text-[11px] text-success ml-2">Done.</span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function AdminQueueNotificationForm({
  holdId,
}: {
  holdId: string;
}) {
  const [state, action] = useFormState(adminQueueGuestNotificationAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line-soft bg-surface p-4">
      <input type="hidden" name="holdId" value={holdId} />
      <input
        name="notificationKey"
        placeholder="notification_key (e.g. concierge_message)"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
        defaultValue="concierge_message"
        required
      />
      <input
        name="publicTitle"
        placeholder="Public title"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
        required
      />
      <textarea
        name="publicBody"
        placeholder="Public body (guest-safe copy only)"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
        rows={3}
        required
      />
      <input
        name="publicActionLabel"
        placeholder="Action label (optional)"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs"
      />
      <input
        name="publicActionHref"
        placeholder="Action href (optional)"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs"
      />
      <input
        name="dedupeKey"
        placeholder="dedupe key (e.g. dbg:concierge:<hold>:<n>)"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs"
        required
      />
      <select
        name="severity"
        defaultValue="info"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs"
      >
        <option value="info">info</option>
        <option value="success">success</option>
        <option value="warning">warning</option>
        <option value="critical">critical</option>
      </select>
      <PendingButton label="Queue guest notification" busyLabel="Queuing…" />
      {state && state.ok && (
        <p className="text-[11px] text-success">Notification queued.</p>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

export function AdminReplyForm({
  threadId,
}: {
  threadId: string;
}) {
  const [state, action] = useFormState(adminReplyToGuestBookingThreadAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line-soft bg-surface p-4">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        placeholder="Type your reply…"
        rows={4}
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
        required
      />
      <select
        name="visibility"
        defaultValue="guest_visible"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-xs"
      >
        <option value="guest_visible">Guest-visible</option>
        <option value="internal_only">Internal note (not sent to guest)</option>
      </select>
      <PendingButton label="Send reply" busyLabel="Sending…" />
      {state && state.ok && (
        <p className="text-[11px] text-success">Sent.</p>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

export function AdminSetThreadStatusButton({
  threadId,
  status,
  label,
}: {
  threadId: string;
  status: "open" | "closed" | "archived";
  label: string;
}) {
  const [state, action] = useFormState(adminSetGuestThreadStatusAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="status" value={status} />
      <PendingButton label={label} busyLabel="…" small />
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function AdminMarkReadButton({ threadId }: { threadId: string }) {
  const [_state, action] = useFormState(adminMarkThreadReadAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="threadId" value={threadId} />
      <PendingButton label="Mark read" busyLabel="…" small />
    </form>
  );
}
