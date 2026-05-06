import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          { label: "Handoffs", href: "/dashboard/guest-ai/handoffs" },
          { label: handoff.id.slice(0, 8) },
        ]}
        title={`Handoff · ${handoff.handoffType.replace("_", " ")}`}
        description={`Booking ${handoff.bookingCode ?? "—"} · villa ${handoff.villaCode ?? "—"}`}
        actions={
          <div className="flex items-center gap-3">
            <RealtimeHandoffAdminClient handoffId={handoff.id} />
            <Badge tone={PRIORITY_TONES[handoff.priority] ?? "neutral"}>
              {handoff.priority}
            </Badge>
            <Badge tone={STATUS_TONES[handoff.status] ?? "neutral"}>
              {handoff.status.replace("_", " ")}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Section eyebrow="Guest message" title="Summary">
            <div className="rounded-md border border-line-soft bg-surface p-5 text-sm whitespace-pre-wrap">
              {handoff.guestSummary}
            </div>
          </Section>

          <Section
            eyebrow="AI excerpt"
            title={`Last ${transcript.length} AI message${transcript.length === 1 ? "" : "s"}`}
            description="Redacted excerpt from the AI session at the moment of escalation. Never includes Wi-Fi passwords or door codes."
          >
            <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {transcript.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-tertiary">
                  No prior messages — this was a first-touch escalation.
                </li>
              )}
              {transcript.map((m, idx) => (
                <li key={idx} className="px-4 py-3 flex flex-col gap-1">
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    {m.role === "user" ? "Guest" : "AI concierge"}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            eyebrow="Two-way thread"
            title={`${replies.length} repl${replies.length === 1 ? "y" : "ies"}`}
            description="Guest-visible replies appear in the guest portal. Internal notes are admin-only and never reach the guest."
          >
            <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {replies.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-tertiary">
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
                    <div className="flex items-center justify-between text-[11px] text-ink-tertiary">
                      <span className="uppercase tracking-widest">
                        {r.authorType === "guest"
                          ? "Guest"
                          : r.authorType === "system"
                            ? "System"
                            : `Staff${r.authorName ? ` · ${r.authorName}` : ""}`}
                      </span>
                      <span className="tabular-nums">
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
                              className="rounded-md border border-line-soft bg-canvas px-2 py-1.5 text-[11px] flex items-center gap-2"
                            >
                              {a.visibility === "internal_only" && (
                                <span className="text-[10px] uppercase tracking-widest text-warning">
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
                              <span className="text-[10px] text-ink-tertiary">
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
          </Section>

          <Section eyebrow="Compose" title="New reply or note">
            <StaffReplyForm
              handoffId={handoff.id}
              canAttach={canWriteAttachments}
            />
          </Section>

          {flags && (
            <Section eyebrow="Safety flags" title="Detected signals">
              <div className="flex flex-wrap gap-2">
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
                    <span className="text-xs text-ink-tertiary">
                      No automatic flags fired.
                    </span>
                  )}
              </div>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Section eyebrow="Service request" title="Linked operational ticket">
            {serviceRequest ? (
              <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    {serviceRequest.requestCode}
                  </span>
                  <Badge tone="info">{serviceRequest.status}</Badge>
                </div>
                <div className="text-ink">{serviceRequest.title}</div>
                <div className="text-[11px] text-ink-tertiary">
                  Priority: {serviceRequest.priority}
                </div>
                <Link
                  href={`/dashboard/operations`}
                  className="text-xs text-ink hover:underline underline-offset-4"
                >
                  Open in operations →
                </Link>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-4 text-xs text-ink-tertiary">
                No service request linked. Contact ops to create one
                manually.
              </p>
            )}
          </Section>

          <Section eyebrow="Actions" title="Move forward">
            <div className="flex flex-col gap-3">
              {isOpen && <AcknowledgeHandoffButton id={handoff.id} />}
              {handoff.status !== "resolved" &&
                handoff.status !== "cancelled" && (
                  <ResolveHandoffForm id={handoff.id} />
                )}
              {handoff.acknowledgedAt && (
                <p className="text-[11px] text-ink-tertiary tabular-nums">
                  Acknowledged{" "}
                  {new Date(handoff.acknowledgedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </p>
              )}
              {handoff.resolvedAt && (
                <p className="text-[11px] text-ink-tertiary tabular-nums">
                  Resolved{" "}
                  {new Date(handoff.resolvedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </p>
              )}
            </div>
          </Section>

          <Section eyebrow="SLA" title="Response times">
            <dl className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 gap-3 text-xs">
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
          </Section>

          <Section eyebrow="Stay context" title="Reference">
            <dl className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 gap-3 text-xs">
              <Pair label="Token prefix">
                {handoff.tokenPrefix ? `${handoff.tokenPrefix}…` : "—"}
              </Pair>
              <Pair label="Booking">{handoff.bookingCode ?? "—"}</Pair>
              <Pair label="Villa">{handoff.villaCode ?? "—"}</Pair>
              <Pair label="IP hash">{handoff.createdByIpHash ?? "—"}</Pair>
            </dl>
          </Section>
        </div>
      </div>
    </div>
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
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className="text-ink mt-1 font-mono">{children}</dd>
    </div>
  );
}
