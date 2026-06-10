import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getHandoffDetail } from "@/features/guest-ai-concierge/handoff-services";
import {
  listAdminRepliesForHandoff,
  markStaffReadAt,
} from "@/features/guest-ai-concierge/replies-services";
import {
  AcknowledgeHandoffButton,
  ResolveHandoffForm,
} from "@/components/guest-ai/handoff-actions-buttons";
import { StaffReplyForm } from "@/components/guest-ai/staff-reply-form";
import { formatDuration } from "@/features/guest-ai-concierge/replies-pure";
import {
  listReadReceiptsForHandoff,
  recordStaffReadReceipts,
  replySeenByGuest,
  replySeenByStaff,
} from "@/features/guest-ai-concierge/read-receipts-services";
import {
  listAdminAttachmentsForHandoff,
} from "@/features/guest-ai-concierge/attachments-services";
import { formatBytes } from "@/features/guest-ai-concierge/attachments-pure";
import { RealtimeHandoffAdminClient } from "@/components/guest-ai/realtime-handoff-admin-client";
import { hasPermission } from "@/features/auth/permission-matrix";
import { getCurrentUserContext } from "@/features/auth/permissions";

export const metadata = { title: "Concierge AI handoff" };
export const dynamic = "force-dynamic";

interface SnapshotMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

const PRIORITY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  created: "info",
  linked_to_request: "info",
  acknowledged: "warning",
  resolved: "success",
  cancelled: "neutral",
};

export default async function HandoffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getHandoffDetail(id);
  if (!detail) notFound();
  const { handoff, serviceRequest } = detail;
  const transcript = parseSnapshot(handoff.lastMessagesJson);
  const flags = parseSafetyFlags(handoff.safetyFlags);
  const isOpen =
    handoff.status === "created" || handoff.status === "linked_to_request";
  const ctx = await getCurrentUserContext();
  const canSeeNotes = hasPermission(ctx, "guest_ai.handoff.notes.read");
  const canWriteAttachments = hasPermission(
    ctx,
    "guest_ai.handoff.attachments.write",
  );
  const allReplies = await listAdminRepliesForHandoff(id);
  // Drop internal-only replies entirely for users without
  // notes.read — never even render them as hidden in the DOM.
  const replies = canSeeNotes
    ? allReplies
    : allReplies.filter((r) => r.visibility !== "internal_only");
  // Mark staff-side read on view (best-effort).
  if (handoff.staffUnreadCount && handoff.staffUnreadCount > 0) {
    await markStaffReadAt({ handoffId: id });
  }
  await recordStaffReadReceipts({
    handoffId: id,
    appUserId: ctx.appUser?.id ?? null,
  });
  const receipts = await listReadReceiptsForHandoff(id);
  const adminAttachmentsRaw = await listAdminAttachmentsForHandoff(id);
  const adminAttachments = canSeeNotes
    ? adminAttachmentsRaw
    : adminAttachmentsRaw.filter(
        (a) => a.visibility !== "internal_only",
      );
  const attachmentsByReply = new Map<
    string,
    typeof adminAttachments
  >();
  for (const a of adminAttachments) {
    if (a.uploadStatus !== "uploaded") continue;
    const list = attachmentsByReply.get(a.replyId) ?? [];
    list.push(a);
    attachmentsByReply.set(a.replyId, list);
  }
  // SLA preview metrics shown on the side panel.
  const ackDurSec = handoff.acknowledgedAt
    ? Math.floor(
        (handoff.acknowledgedAt.getTime() - handoff.createdAt.getTime()) /
          1000,
      )
    : null;
  const firstReplyDurSec = handoff.firstStaffReplyAt
    ? Math.floor(
        (handoff.firstStaffReplyAt.getTime() -
          handoff.createdAt.getTime()) /
          1000,
      )
    : null;
  const resolveDurSec = handoff.resolvedAt
    ? Math.floor(
        (handoff.resolvedAt.getTime() - handoff.createdAt.getTime()) /
          1000,
      )
    : null;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <Link href="/dashboard/guest-ai/handoffs">Handoffs</Link> /{" "}
            <span>{handoff.id.slice(0, 8)}</span>
          </div>
          <h1>Handoff · {handoff.handoffType.replace("_", " ")}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Booking {handoff.bookingCode ?? "—"} · villa{" "}
            {handoff.villaCode ?? "—"}
          </p>
        </div>
        <div className="actions">
          <RealtimeHandoffAdminClient handoffId={handoff.id} />
          <Badge tone={PRIORITY_TONES[handoff.priority] ?? "neutral"}>
            {handoff.priority}
          </Badge>
          <Badge tone={STATUS_TONES[handoff.status] ?? "neutral"}>
            {handoff.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
        <div className="lg:col-span-2 flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Guest summary
            </h2>
            <div className="card px-5 py-[18px] text-sm whitespace-pre-wrap">
              {handoff.guestSummary}
            </div>
          </div>

          <div>
            <div className="mb-3.5">
              <h2 className="display text-[22px] font-normal">
                Last {transcript.length} AI message
                {transcript.length === 1 ? "" : "s"}
              </h2>
              <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
                Redacted excerpt from the AI session at the moment of
                escalation. Never includes Wi-Fi passwords or door codes.
              </p>
            </div>
            <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
              {transcript.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-4">
                  No prior messages — this was a first-touch escalation.
                </li>
              )}
              {transcript.map((m, idx) => (
                <li key={idx} className="px-4 py-3 flex flex-col gap-1">
                  <div className="mono text-[11px] uppercase tracking-[0.16em] text-ink-4">
                    {m.role === "user" ? "Guest" : "AI concierge"}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="mb-3.5">
              <h2 className="display text-[22px] font-normal">
                {replies.length} repl{replies.length === 1 ? "y" : "ies"}
              </h2>
              <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
                Guest-visible replies appear in the guest portal. Internal
                notes are admin-only and never reach the guest.
              </p>
            </div>
            <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
              {replies.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-4">
                  No replies yet. Use the composer below to send the
                  first one.
                </li>
              )}
              {replies.map((r) => {
                const replyAttachments = attachmentsByReply.get(r.id) ?? [];
                const seenByGuest =
                  r.authorType !== "guest" &&
                  r.visibility === "guest_visible" &&
                  replySeenByGuest(r.id, receipts);
                const seenByStaff =
                  r.authorType === "guest" &&
                  replySeenByStaff(r.id, receipts);
                return (
                  <li
                    key={r.id}
                    className="px-4 py-3 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-ink-4">
                      <span className="mono uppercase tracking-[0.16em]">
                        {r.authorType === "guest"
                          ? "Guest"
                          : r.authorType === "system"
                            ? "System"
                            : `Staff${r.authorName ? ` · ${r.authorName}` : ""}`}
                      </span>
                      <span className="mono tabular-nums">
                        {new Date(r.createdAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")}
                      </span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {r.bodyRedacted}
                    </div>
                    {replyAttachments.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {replyAttachments.map((a) => {
                          const safeForDownload =
                            a.metadataStatus === "stripped" ||
                            a.metadataStatus === "not_required" ||
                            a.metadataStatus === "warning";
                          return (
                            <li
                              key={a.id}
                              className="rounded-[10px] border border-[var(--line)] bg-[var(--paper,var(--panel))] px-2.5 py-1.5 text-[11px] flex items-center gap-2"
                            >
                              {a.visibility === "internal_only" && (
                                <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn,var(--warning))]">
                                  internal
                                </span>
                              )}
                              {safeForDownload && a.signedUrl ? (
                                <a
                                  href={a.signedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline underline-offset-4 hover:no-underline"
                                >
                                  {a.fileName}
                                </a>
                              ) : (
                                <span>{a.fileName}</span>
                              )}
                              <span className="text-[10px] text-ink-4">
                                {formatBytes(
                                  Number(
                                    a.processedSizeBytes ?? a.sizeBytes,
                                  ),
                                )}
                              </span>
                              <Badge
                                tone={
                                  a.metadataStatus === "stripped" ||
                                  a.metadataStatus === "not_required"
                                    ? "success"
                                    : a.metadataStatus === "warning"
                                      ? "warning"
                                      : a.metadataStatus === "failed"
                                        ? "danger"
                                        : "info"
                                }
                              >
                                {a.metadataStatus === "stripped"
                                  ? "metadata stripped"
                                  : a.metadataStatus === "not_required"
                                    ? "no metadata"
                                    : a.metadataStatus === "warning"
                                      ? "review (webp)"
                                      : a.metadataStatus === "failed"
                                        ? "strip failed"
                                        : "processing"}
                              </Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        tone={
                          r.visibility === "guest_visible"
                            ? "success"
                            : "warning"
                        }
                      >
                        {r.visibility === "guest_visible"
                          ? "guest visible"
                          : "internal note"}
                      </Badge>
                      <Badge tone="neutral">{r.replyType}</Badge>
                      {r.body !== r.bodyRedacted && (
                        <Badge tone="info">redacted</Badge>
                      )}
                      {seenByGuest && (
                        <Badge tone="info">seen by guest</Badge>
                      )}
                      {seenByStaff && (
                        <Badge tone="info">read by staff</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              New reply or note
            </h2>
            <div className="card px-5 py-[18px]">
              <StaffReplyForm
                handoffId={handoff.id}
                canAttach={canWriteAttachments}
              />
            </div>
          </div>

          {flags && (
            <div>
              <h2 className="display text-[22px] font-normal mb-3.5">
                Safety flags
              </h2>
              <div className="card px-5 py-[18px] flex flex-wrap gap-2">
                {flags.emergencyKeywords && (
                  <Badge tone="danger">emergency_keywords</Badge>
                )}
                {flags.problemKeywords && (
                  <Badge tone="warning">problem_keywords</Badge>
                )}
                {flags.containedNumbers && (
                  <Badge tone="info">contained_numbers</Badge>
                )}
                {!flags.emergencyKeywords &&
                  !flags.problemKeywords &&
                  !flags.containedNumbers && (
                    <span className="text-xs text-ink-4">
                      No automatic flags fired.
                    </span>
                  )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Linked service request
            </h2>
            {serviceRequest ? (
              <div className="card px-5 py-[18px] flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs">
                    {serviceRequest.requestCode}
                  </span>
                  <Badge tone="info">{serviceRequest.status}</Badge>
                </div>
                <div>{serviceRequest.title}</div>
                <div className="text-[11px] text-ink-4">
                  Priority: {serviceRequest.priority}
                </div>
                <Link
                  href={`/dashboard/operations`}
                  className="text-xs hover:text-terra underline underline-offset-4"
                >
                  Open in operations →
                </Link>
              </div>
            ) : (
              <p className="card px-5 py-[18px] text-xs text-ink-4">
                No service request linked. Contact ops to create one
                manually.
              </p>
            )}
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Move forward
            </h2>
            <div className="card px-5 py-[18px] flex flex-col gap-3">
              {isOpen && <AcknowledgeHandoffButton id={handoff.id} />}
              {handoff.status !== "resolved" &&
                handoff.status !== "cancelled" && (
                  <ResolveHandoffForm id={handoff.id} />
                )}
              {handoff.acknowledgedAt && (
                <p className="text-[11px] text-ink-4 tabular-nums">
                  Acknowledged{" "}
                  {new Date(handoff.acknowledgedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </p>
              )}
              {handoff.resolvedAt && (
                <p className="text-[11px] text-ink-4 tabular-nums">
                  Resolved{" "}
                  {new Date(handoff.resolvedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              SLA · response times
            </h2>
            <dl className="card px-5 py-[18px] grid grid-cols-2 gap-3 text-xs">
              <Pair label="Time to ack">{formatDuration(ackDurSec)}</Pair>
              <Pair label="First response">
                {formatDuration(firstReplyDurSec)}
              </Pair>
              <Pair label="Time to resolve">
                {formatDuration(resolveDurSec)}
              </Pair>
              <Pair label="Unread (guest / staff)">
                {handoff.guestUnreadCount ?? 0} /{" "}
                {handoff.staffUnreadCount ?? 0}
              </Pair>
            </dl>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Stay context
            </h2>
            <dl className="card px-5 py-[18px] grid grid-cols-2 gap-3 text-xs">
              <Pair label="Token prefix">
                {handoff.tokenPrefix ? `${handoff.tokenPrefix}…` : "—"}
              </Pair>
              <Pair label="Booking">{handoff.bookingCode ?? "—"}</Pair>
              <Pair label="Villa">{handoff.villaCode ?? "—"}</Pair>
              <Pair label="IP hash">{handoff.createdByIpHash ?? "—"}</Pair>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

function parseSnapshot(value: unknown): SnapshotMessage[] {
  if (!Array.isArray(value)) return [];
  const out: SnapshotMessage[] = [];
  for (const m of value) {
    if (
      m &&
      typeof m === "object" &&
      "role" in m &&
      "content" in m &&
      ((m as { role: unknown }).role === "user" ||
        (m as { role: unknown }).role === "assistant") &&
      typeof (m as { content: unknown }).content === "string"
    ) {
      const r = m as SnapshotMessage;
      out.push({
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      });
    }
  }
  return out;
}

function parseSafetyFlags(
  value: unknown,
): null | {
  emergencyKeywords: boolean;
  problemKeywords: boolean;
  containedNumbers: boolean;
} {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    emergencyKeywords: Boolean(v.emergencyKeywords),
    problemKeywords: Boolean(v.problemKeywords),
    containedNumbers: Boolean(v.containedNumbers),
  };
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
        {label}
      </dt>
      <dd className="mt-1 mono">{children}</dd>
    </div>
  );
}
