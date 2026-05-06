import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuestShell } from "@/components/layout/guest-shell";
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

  return (
    <GuestShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
    >
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <header className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Requests
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Your requests
          </h1>
          <p className="text-sm text-ink-secondary">
            Everything you've asked our team to help with — concierge
            handoffs, free-text concierge requests, and any service
            order updates that flow through requests.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-soft bg-muted/20 p-6 text-sm text-ink-tertiary">
            No requests yet. Use the{" "}
            <Link
              href={`/stay/${token}/concierge`}
              className="text-ink hover:underline underline-offset-4"
            >
              Concierge AI
            </Link>{" "}
            or the{" "}
            <Link
              href={`/stay/${token}/services`}
              className="text-ink hover:underline underline-offset-4"
            >
              Concierge & services
            </Link>{" "}
            page to send one.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/stay/${token}/requests/${r.requestCode}`}
                  className="rounded-xl border border-line-soft bg-surface p-5 flex flex-col gap-2 hover:border-line-strong transition-colors block"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-ink-tertiary flex items-center gap-2">
                      {r.requestCode}
                      {r.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-ink-inverse text-[10px] font-medium">
                          {r.unreadCount} new
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                      <Badge tone={PRIORITY_TONES[r.priority] ?? "neutral"}>
                        {r.priority}
                      </Badge>
                    </span>
                  </div>
                  <p className="text-sm text-ink font-medium">{r.title}</p>
                  {r.latestVisibleReply && (
                    <p className="text-xs text-ink-secondary line-clamp-2">
                      {r.latestVisibleReply}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-ink-tertiary tabular-nums">
                    <span>
                      Sent{" "}
                      {new Date(r.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
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
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/stay/${token}/concierge`}
            className="text-sm rounded-md border border-line-soft bg-surface p-3 hover:border-line-strong"
          >
            <div className="text-ink font-medium">Concierge AI</div>
            <div className="text-[11px] text-ink-tertiary mt-1">
              Ask a quick question
            </div>
          </Link>
          <Link
            href={`/stay/${token}/services`}
            className="text-sm rounded-md border border-line-soft bg-surface p-3 hover:border-line-strong"
          >
            <div className="text-ink font-medium">Concierge & services</div>
            <div className="text-[11px] text-ink-tertiary mt-1">
              Book or request a service
            </div>
          </Link>
        </div>
      </div>
    </GuestShell>
  );
}
