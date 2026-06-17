import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { listFulfilmentsForStayToken } from "@/features/service-fulfilment/services";
import {
  guestFacingFulfilmentStatus,
  type FulfilmentStatus,
} from "@/features/service-fulfilment/status-pure";

export const metadata = { title: "Your service orders" };
export const dynamic = "force-dynamic";

export default async function GuestServiceOrdersPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Rate limit before any DB work (mirrors `/stay/[token]`).
  const tokenPrefix = token.slice(0, 8);
  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  // Verification gate (v9G): an unverified token must not browse orders.
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    redirect(`/stay/${token}/verify`);
  }

  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const stay = result.summary.base;
  const villaLabel = stay.villaName ?? stay.villaCode ?? "Your villa";
  const rows = await listFulfilmentsForStayToken(stay.tokenId);
  return (
    <GuestShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
    >
      <div className="flex flex-col gap-8">
        <Link
          href={`/stay/${token}/services`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Concierge
        </Link>
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Concierge
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Your service requests
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            Each request the concierge has worked on appears here. Tap a row
            for status, ETA, or to leave a rating once it's complete.
          </p>
        </header>
        <Section eyebrow="History" title={`${rows.length} requests`}>
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
              No service requests yet.
            </p>
          ) : (
            <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {rows.map(({ fulfilment, service }) => {
                const guest = guestFacingFulfilmentStatus(
                  fulfilment.status as FulfilmentStatus,
                );
                return (
                  <li key={fulfilment.id} className="px-4 py-3">
                    <Link
                      href={`/stay/${token}/services/orders/${fulfilment.id}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-ink">
                          {service?.name ?? "Service"}
                        </span>
                        <span className="text-[11px] text-ink-tertiary">
                          {fulfilment.scheduledFor
                            ? `Scheduled ${fulfilment.scheduledFor.toISOString().slice(0, 16).replace("T", " ")} UTC`
                            : "Awaiting schedule"}
                        </span>
                      </div>
                      <Badge tone={guest.tone}>{guest.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </GuestShell>
  );
}
