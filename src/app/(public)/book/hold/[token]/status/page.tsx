import { notFound } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getGuestMessagePreviewByHoldToken,
  getGuestStatusSnapshotByHoldToken,
  listGuestNotificationsByHoldToken,
  rebuildGuestStatusSnapshotForHold,
  resolveGuestChainByToken,
} from "@/features/direct-booking/guest-status-services";
import {
  buildGuestTimeline,
  type PublicGuestStage,
} from "@/features/direct-booking/guest-status-pure";
import { GuestMessageComposer } from "@/components/direct-booking/guest-message-composer";

export const metadata = { title: "Booking status" };
export const dynamic = "force-dynamic";

export default async function HoldStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const chain = await resolveGuestChainByToken(token);
  if (!chain) notFound();
  // Always rebuild on read so the public page never lags behind a
  // recent admin action.  Best-effort.
  try {
    await rebuildGuestStatusSnapshotForHold(chain.hold.id, token);
  } catch (err) {
    console.error("[guest-status] rebuild on read failed", err);
  }
  const [snapshot, notifications, messagePreview] = await Promise.all([
    getGuestStatusSnapshotByHoldToken(token),
    listGuestNotificationsByHoldToken(token),
    getGuestMessagePreviewByHoldToken(token),
  ]);
  if (!snapshot) notFound();
  const stage = snapshot.publicStage as PublicGuestStage;
  const visibleNotifications = notifications.filter(
    (n) => n.status !== "archived",
  );
  const timeline = buildGuestTimeline(
    stage,
    visibleNotifications.map((n) => ({
      notificationKey: n.notificationKey,
      createdAt:
        n.createdAt instanceof Date
          ? n.createdAt.toISOString()
          : (n.createdAt as unknown as string),
    })),
  );

  const total = snapshot.totalAmountMinor
    ? formatMinorString(snapshot.totalAmountMinor.toString())
    : null;
  const deposit = snapshot.depositAmountMinor
    ? formatMinorString(snapshot.depositAmountMinor.toString())
    : null;
  const balance = snapshot.balanceDueMinor
    ? formatMinorString(snapshot.balanceDueMinor.toString())
    : null;

  const severityTone: Record<
    string,
    "neutral" | "info" | "warning" | "success" | "danger"
  > = {
    info: "info",
    success: "success",
    warning: "warning",
    critical: "danger",
  };

  return (
    <GuestShell
      villaName={snapshot.villaLabel ?? "Villa"}
      dates={`${snapshot.checkIn ?? ""} → ${snapshot.checkOut ?? ""}`}
    >
      <div className="flex flex-col gap-8">
        <p className="text-[11px] text-ink-tertiary leading-relaxed">
          Your request is being reviewed by our team. We&rsquo;ll move
          through the stages below as we confirm availability and the
          deposit. No payment is collected on this page directly — when
          a deposit is required we&rsquo;ll send a secure link.
        </p>
        <header className="flex flex-col gap-3 rounded-md border border-line-soft bg-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Booking status
            </span>
            <Badge tone={severityTone[stageBadgeSeverity(stage)] ?? "neutral"}>
              {publicStageLabel(stage)}
            </Badge>
          </div>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            {snapshot.headline}
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose leading-relaxed">
            {snapshot.body}
          </p>
          {snapshot.nextActionLabel && snapshot.nextActionHref && (
            <Link
              href={snapshot.nextActionHref}
              className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 self-start"
            >
              {snapshot.nextActionLabel}
            </Link>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-ink-tertiary">
            {snapshot.holdExpiresAt && stage !== "expired" && (
              <span>
                Hold expires {formatDateTime(snapshot.holdExpiresAt as unknown as Date)}
              </span>
            )}
            {snapshot.depositExpiresAt && stage === "deposit_required" && (
              <span>
                Deposit window closes{" "}
                {formatDateTime(snapshot.depositExpiresAt as unknown as Date)}
              </span>
            )}
          </div>
        </header>

        <Section eyebrow="Reservation" title="Booking summary">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Pair label="Villa" value={snapshot.villaLabel ?? "—"} />
            <Pair
              label="Dates"
              value={`${snapshot.checkIn ?? "—"} → ${snapshot.checkOut ?? "—"}`}
            />
            <Pair
              label="Nights"
              value={snapshot.nights !== null ? String(snapshot.nights) : "—"}
            />
            <Pair
              label="Guests"
              value={
                snapshot.guestCount !== null ? String(snapshot.guestCount) : "—"
              }
            />
            {total && snapshot.currency && (
              <Pair label="Total" value={`${total} ${snapshot.currency}`} mono />
            )}
            {deposit && snapshot.currency && (
              <Pair
                label="Deposit"
                value={`${deposit} ${snapshot.currency}`}
                mono
              />
            )}
            {balance && snapshot.currency && (
              <Pair
                label="Balance due"
                value={`${balance} ${snapshot.currency}`}
                mono
              />
            )}
          </dl>
        </Section>

        <Section eyebrow="Timeline" title="Where we are">
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {timeline.map((step) => (
              <li
                key={step.key}
                className="px-4 py-3 flex items-center justify-between"
              >
                <span className="text-sm text-ink">{step.label}</span>
                <Badge
                  tone={
                    step.state === "complete"
                      ? "success"
                      : step.state === "active"
                        ? "info"
                        : step.state === "warning"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {step.state === "complete"
                    ? "Done"
                    : step.state === "active"
                      ? "Now"
                      : step.state === "warning"
                        ? "—"
                        : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>

        {visibleNotifications.length > 0 && (
          <Section
            eyebrow="Updates"
            title={`${visibleNotifications.length} update${visibleNotifications.length === 1 ? "" : "s"}`}
          >
            <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {visibleNotifications.map((n) => (
                <li
                  key={n.id}
                  className="px-4 py-3 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone[n.severity] ?? "neutral"}>
                      {n.severity}
                    </Badge>
                    <span className="text-sm text-ink font-medium">
                      {n.publicTitle}
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    {n.publicBody}
                  </p>
                  {n.publicActionLabel && n.publicActionHref && (
                    <Link
                      href={n.publicActionHref}
                      className="text-xs text-ink hover:underline underline-offset-4 self-start"
                    >
                      {n.publicActionLabel} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          eyebrow="Concierge"
          title="Need help?"
          description="Send a short message to our concierge team. Please don't include payment details, passwords, or access codes — they'll be redacted."
        >
          {messagePreview.totalCount > 0 && messagePreview.lastBody && (
            <div className="rounded-md border border-line-soft bg-surface p-4 mb-3 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                Latest from {messagePreview.lastAuthor}
              </span>
              <p className="mt-1 text-sm text-ink leading-relaxed">
                {messagePreview.lastBody}
              </p>
            </div>
          )}
          <GuestMessageComposer
            token={token}
            disabled={!snapshot.guestCanAct && !canStillMessage(stage)}
            disabledReason={
              !canStillMessage(stage)
                ? "Messaging is disabled for completed or cancelled requests."
                : null
            }
          />
        </Section>
      </div>
    </GuestShell>
  );
}

function publicStageLabel(stage: PublicGuestStage): string {
  switch (stage) {
    case "quote_held":
      return "Held";
    case "request_submitted":
      return "Submitted";
    case "under_review":
      return "Under review";
    case "deposit_required":
      return "Deposit pending";
    case "deposit_pending_confirmation":
      return "Verifying";
    case "deposit_confirmed":
      return "Deposit confirmed";
    case "approved":
      return "Approved";
    case "confirmed":
      return "Confirmed";
    case "in_house":
      return "In-house";
    case "completed":
      return "Completed";
    case "expired":
      return "Expired";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Not confirmed";
    case "failed":
      return "Payment failed";
  }
}

function stageBadgeSeverity(stage: PublicGuestStage): string {
  switch (stage) {
    case "confirmed":
    case "in_house":
    case "completed":
    case "deposit_confirmed":
      return "success";
    case "deposit_required":
    case "expired":
    case "cancelled":
    case "rejected":
      return "warning";
    case "failed":
      return "critical";
    default:
      return "info";
  }
}

function canStillMessage(stage: PublicGuestStage): boolean {
  return (
    stage !== "expired" &&
    stage !== "cancelled" &&
    stage !== "rejected" &&
    stage !== "completed" &&
    stage !== "failed"
  );
}

function formatMinorString(s: string): string {
  const big = BigInt(s);
  const major = big / 100n;
  const rest = big % 100n;
  return `${major.toString()}.${String(rest).padStart(2, "0")}`;
}

function formatDateTime(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function Pair({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
