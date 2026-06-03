import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { KeyRound, ArrowLeft } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { recordStayAccessEvent } from "@/features/guest-stays/access-log";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { MarkdownBlock } from "@/components/stay/markdown-block";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { RevealSecretButton } from "@/components/stay/reveal-button";
import { getCheckinByBooking } from "@/features/checkins/queries";
import { GuestCheckinForm } from "@/components/stay/guest-checkin-form";

export const metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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

  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  await recordStayAccessEvent({
    guestStayTokenId: summary.base.tokenId,
    bookingId: summary.base.bookingId,
    eventType: "guide_opened",
    ip,
    userAgent: hdrs.get("user-agent") ?? null,
    metadata: { section: "check_in" },
  });

  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const dateRange = `${summary.base.checkIn} → ${summary.base.checkOut}`;
  const checkInSection = summary.sections.find((s) => s.sectionKey === "check_in");

  // Door code is gated on the check-in lifecycle (FC-GUEST-STAY-PORTAL §3):
  // it reveals only once the operator has approved (status='code_issued').
  const checkin = await getCheckinByBooking(summary.base.bookingId);
  const status = checkin?.status ?? "not_started";

  return (
    <GuestShell villaName={villaLabel} dates={dateRange}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>

        <h1 className="text-2xl font-medium text-ink">Check-in</h1>

        {status === "code_issued" ? (
          <section className="rounded-xl border border-line-soft bg-surface p-6">
            <div className="flex items-center gap-2 text-ink-tertiary text-[11px] uppercase tracking-widest">
              <KeyRound className="w-3.5 h-3.5" /> Door access
            </div>
            <div className="mt-3">
              <RevealSecretButton token={token} kind="lock" hiddenLabel="Show door code" />
            </div>
            <p className="text-[11px] text-ink-tertiary mt-3">
              <Badge tone="neutral">demo</Badge> Real lock control ships in a future release.
              Each reveal is logged for safety.
            </p>
          </section>
        ) : status === "submitted" || status === "approved" ? (
          <section className="rounded-xl border border-line-soft bg-muted/30 p-6">
            <h2 className="text-lg font-medium text-ink">Check-in submitted</h2>
            <p className="text-sm text-ink-secondary mt-1">
              Thanks — our team is reviewing your check-in. Your villa door code will appear
              here once it’s approved.
            </p>
          </section>
        ) : (
          <GuestCheckinForm token={token} />
        )}

        {checkInSection && (
          <section className="rounded-xl border border-line-soft bg-surface p-6">
            <h2 className="text-lg font-medium text-ink mb-3">{checkInSection.title}</h2>
            <MarkdownBlock source={checkInSection.bodyMd} />
          </section>
        )}
      </div>
    </GuestShell>
  );
}
