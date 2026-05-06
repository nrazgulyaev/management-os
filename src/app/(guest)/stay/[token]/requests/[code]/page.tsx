import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { getGuestRequestDetailByCode } from "@/features/guest-ai-concierge/handoff-services";
import {
  listGuestVisibleRepliesForHandoff,
  markGuestReadAt,
} from "@/features/guest-ai-concierge/replies-services";
import { canGuestReply } from "@/features/guest-ai-concierge/replies-pure";
import { GuestReplyForm } from "@/components/stay/guest-reply-form";
import { RealtimeRequestClient } from "@/components/guest-ai/realtime-request-client";
import {
  listReadReceiptsForHandoff,
  recordGuestReadReceipts,
  replySeenByStaff,
} from "@/features/guest-ai-concierge/read-receipts-services";
import {
  listGuestVisibleAttachmentsForHandoff,
  pendingGuestAttachmentsForHandoff,
} from "@/features/guest-ai-concierge/attachments-services";
import { formatBytes } from "@/features/guest-ai-concierge/attachments-pure";

export const metadata = { title: "Request detail" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  new: "info",
  acknowledged: "info",
  in_progress: "warning",
  scheduled: "warning",
  completed: "success",
  closed: "neutral",
  cancelled: "neutral",
};

const PRIORITY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ token: string; code: string }>;
}) {
  const { token, code } = await params;
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const tokenPrefix = token.slice(0, 8);

  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) redirect(`/stay/${token}/verify`);

  const resolved = await getStayByToken(token);
  if (!resolved.ok) notFound();
  const stay = resolved.stay;

  const detail = await getGuestRequestDetailByCode({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
    requestCode: code,
  });
  if (!detail) notFound();

  // Mark guest-visible replies read on view (best-effort).
  if (detail.handoff && detail.handoff.guestUnreadCount > 0) {
    await markGuestReadAt({ handoffId: detail.handoff.id });
  }
  // V9K — per-message receipts. Idempotent insert keyed on
  // (reply, guest, token).
  if (detail.handoff) {
    await recordGuestReadReceipts({
      handoffId: detail.handoff.id,
      guestStayTokenId: stay.tokenId,
    });
  }

  const replies = detail.handoff
    ? await listGuestVisibleRepliesForHandoff(detail.handoff.id)
    : [];
  const receipts = detail.handoff
    ? await listReadReceiptsForHandoff(detail.handoff.id)
    : { byReplyId: new Map(), firstReadByReplyId: new Map() };
  const attachments = detail.handoff
    ? await listGuestVisibleAttachmentsForHandoff(detail.handoff.id)
    : [];
  const pendingAttachments = detail.handoff
    ? await pendingGuestAttachmentsForHandoff(detail.handoff.id)
    : [];
  const attachmentsByReply = new Map<
    string,
    typeof attachments
  >();
  for (const a of attachments) {
    const list = attachmentsByReply.get(a.replyId) ?? [];
    list.push(a);
    attachmentsByReply.set(a.replyId, list);
  }
  const pendingByReply = new Map<
    string,
    typeof pendingAttachments
  >();
  for (const p of pendingAttachments) {
    const list = pendingByReply.get(p.replyId) ?? [];
    list.push(p);
    pendingByReply.set(p.replyId, list);
  }
  const replyOpen = detail.handoff
    ? canGuestReply(
        detail.handoff.status as
          | "created"
          | "linked_to_request"
          | "acknowledged"
          | "resolved"
          | "cancelled",
      )
    : false;

  const villaLabel = stay.villaName ?? stay.villaCode ?? "your villa";

  return (
    <GuestShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
    >
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}/requests`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Your requests
        </Link>

        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-ink-tertiary">
              {detail.requestCode}
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={STATUS_TONES[detail.status] ?? "neutral"}>
                {detail.status.replace("_", " ")}
              </Badge>
              <Badge tone={PRIORITY_TONES[detail.priority] ?? "neutral"}>
                {detail.priority}
              </Badge>
            </span>
          </div>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            {detail.title}
          </h1>
          {detail.handoff && (
            <RealtimeRequestClient
              token={token}
              handoffCode={detail.requestCode}
              handoffStatus={detail.handoff.status}
            />
          )}
          <p className="text-[11px] text-ink-tertiary tabular-nums">
            Sent{" "}
            {new Date(detail.createdAt)
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}
          </p>
        </header>

        {detail.handoff && (
          <section className="rounded-xl border border-line-soft bg-canvas/50 p-5 flex flex-col gap-3">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              From your message
            </span>
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {detail.handoff.guestSummary}
            </p>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Conversation
          </span>
          {replies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-soft bg-muted/20 p-5 text-sm text-ink-tertiary">
              Our team will reply here. We&apos;ll keep this updated as we
              acknowledge and resolve your request.
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {replies.map((r) => {
                const replyAttachments = attachmentsByReply.get(r.id) ?? [];
                const replyPending = pendingByReply.get(r.id) ?? [];
                const seen =
                  r.authorType === "guest" &&
                  replySeenByStaff(r.id, receipts);
                return (
                  <li
                    key={r.id}
                    className={
                      r.authorType === "guest"
                        ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-ink text-ink-inverse px-4 py-3"
                        : r.authorType === "system"
                          ? "self-stretch max-w-full rounded-md border border-line-soft bg-canvas px-4 py-2 text-center"
                          : "self-start max-w-[90%] rounded-2xl rounded-bl-sm border border-line-soft bg-surface px-4 py-3"
                    }
                  >
                    {r.authorType === "system" ? (
                      <p className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                        {r.bodyRedacted}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap">
                          {r.bodyRedacted}
                        </p>
                        {replyAttachments.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {replyAttachments.map((a) => (
                              <li
                                key={a.id}
                                className={
                                  r.authorType === "guest"
                                    ? "rounded-md bg-ink-inverse/15 border border-ink-inverse/20 p-2"
                                    : "rounded-md bg-canvas border border-line-soft p-2"
                                }
                              >
                                {a.signedUrl ? (
                                  a.mimeType.startsWith("image/") ? (
                                    <a
                                      href={a.signedUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={a.signedUrl}
                                        alt={a.fileName}
                                        loading="lazy"
                                        className="rounded-sm max-h-48 w-auto"
                                      />
                                      <span className="text-[10px] block mt-1 opacity-75">
                                        {a.fileName} · {formatBytes(a.sizeBytes)}
                                      </span>
                                    </a>
                                  ) : (
                                    <a
                                      href={a.signedUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs underline underline-offset-4 hover:no-underline"
                                    >
                                      📄 {a.fileName} ·{" "}
                                      {formatBytes(a.sizeBytes)}
                                    </a>
                                  )
                                ) : (
                                  <span className="text-[10px] opacity-60">
                                    {a.fileName} (link expired)
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {replyPending.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {replyPending.map((p) => (
                              <li
                                key={p.id}
                                className={
                                  r.authorType === "guest"
                                    ? "rounded-md bg-ink-inverse/10 border border-ink-inverse/20 p-2 text-[11px]"
                                    : "rounded-md bg-canvas border border-line-soft p-2 text-[11px]"
                                }
                              >
                                {p.state === "processing"
                                  ? "Processing file securely… it will appear shortly."
                                  : "This file could not be processed safely. Please try another file."}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p
                          className={`text-[10px] mt-1 ${r.authorType === "guest" ? "text-ink-inverse/60" : "text-ink-tertiary"} tabular-nums flex items-center gap-1.5`}
                        >
                          {r.authorType === "guest" ? "You" : "Concierge"} ·{" "}
                          {new Date(r.createdAt)
                            .toISOString()
                            .slice(11, 16)}
                          {seen && (
                            <span className="ml-1 text-[10px] opacity-90">
                              · Seen by team
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {detail.handoff && replyOpen ? (
          <GuestReplyForm token={token} handoffId={detail.handoff.id} />
        ) : detail.handoff && detail.handoff.resolvedAt ? (
          <div className="rounded-xl border border-success/40 bg-success-weak/30 p-5 text-sm text-ink-secondary">
            This request was resolved on{" "}
            <span className="font-mono">
              {new Date(detail.handoff.resolvedAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}
            </span>
            . If anything else comes up, head back to the{" "}
            <Link
              href={`/stay/${token}/concierge`}
              className="text-ink hover:underline underline-offset-4"
            >
              Concierge AI
            </Link>{" "}
            to start a new request.
          </div>
        ) : null}

        <Link
          href={`/stay/${token}/concierge`}
          className="self-start text-xs text-ink hover:underline underline-offset-4"
        >
          Back to Concierge AI →
        </Link>
      </div>
    </GuestShell>
  );
}
