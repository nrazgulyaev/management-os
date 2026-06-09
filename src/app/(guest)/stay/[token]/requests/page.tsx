import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, Plus } from "lucide-react";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader, SectionTitle } from "@/components/stay/stay-ui";
import { Badge } from "@/components/ui/badge";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { listServiceRequestsForTokenWithReplies } from "@/features/guest-ai-concierge/handoff-services";
import { RateLimitedView } from "@/components/stay/rate-limited";

export const metadata = { title: "Your requests" };
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

export default async function RequestsPage({
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

  const resolved = await getStayByToken(token);
  if (!resolved.ok) notFound();
  const stay = resolved.stay;

  const rows = await listServiceRequestsForTokenWithReplies(
    stay.tokenId,
    stay.bookingId,
  );
  const villaLabel = stay.villaName ?? stay.villaCode ?? "your villa";
  const basePath = `/stay/${token}`;

  const DONE = new Set(["completed", "closed", "cancelled"]);
  const active = rows.filter((r) => !DONE.has(r.status));
  const done = rows.filter((r) => DONE.has(r.status));

  const renderCard = (r: (typeof rows)[number]) => (
    <li key={r.id}>
      <Link
        href={`${basePath}/requests/${r.requestCode}`}
        className="block rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2.5">
          <p className="flex-1 text-[15px] font-semibold text-ink">{r.title}</p>
          <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
            {r.status.replace("_", " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[12.5px] text-ink-tertiary">
          <Clock className="w-3.5 h-3.5 text-ink-4" strokeWidth={2} />
          <span className="font-mono text-ink-tertiary">{r.requestCode}</span>
          {r.unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-ink-inverse text-[10px] font-medium">
              {r.unreadCount} new
            </span>
          )}
          <Badge tone={PRIORITY_TONES[r.priority] ?? "neutral"}>
            {r.priority}
          </Badge>
        </div>
        {r.latestVisibleReply && (
          <p className="text-xs text-ink-secondary line-clamp-2">
            {r.latestVisibleReply}
          </p>
        )}
        <div className="flex items-center justify-between text-[10px] text-ink-tertiary tabular-nums">
          <span>
            Sent{" "}
            {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}
          </span>
          {r.lastUpdateAt && r.lastUpdateAt !== r.createdAt && (
            <span>
              Updated{" "}
              {new Date(r.lastUpdateAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}
            </span>
          )}
        </div>
        {r.handoffType && (
          <p className="text-[10px] text-ink-tertiary">
            via{" "}
            {r.handoffType === "emergency_concern"
              ? "🚨 emergency handoff"
              : "concierge handoff"}
          </p>
        )}
      </Link>
    </li>
  );

  return (
    <StayShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
      basePath={basePath}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="Requests" backHref={basePath} />

        <Link
          href={`${basePath}/concierge`}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terra text-[#fff] text-[15px] font-semibold px-[22px] py-[15px] shadow-[0_6px_18px_rgba(196,88,60,0.28)]"
        >
          <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} />
          New request
        </Link>

        {rows.length === 0 ? (
          <div className="rounded-[var(--r-card)] border border-dashed border-line-soft bg-muted/40 p-6 text-sm text-ink-tertiary">
            No requests yet. Use the{" "}
            <Link
              href={`${basePath}/concierge`}
              className="text-ink hover:underline underline-offset-4"
            >
              Concierge
            </Link>{" "}
            or the{" "}
            <Link
              href={`${basePath}/services`}
              className="text-ink hover:underline underline-offset-4"
            >
              Services
            </Link>{" "}
            page to send one.
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <SectionTitle title="Active" />
                <ul className="flex flex-col gap-3">{active.map(renderCard)}</ul>
              </section>
            )}
            {done.length > 0 && (
              <section>
                <SectionTitle title="Done" />
                <ul className="flex flex-col gap-3 opacity-75">
                  {done.map(renderCard)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </StayShell>
  );
}
