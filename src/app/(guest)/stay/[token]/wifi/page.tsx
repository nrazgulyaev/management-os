import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { ArrowLeft, Wifi as WifiIcon } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { recordStayAccessEvent } from "@/features/guest-stays/access-log";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { MarkdownBlock } from "@/components/stay/markdown-block";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { RevealSecretButton } from "@/components/stay/reveal-button";

export const metadata = { title: "Wi-Fi" };
export const dynamic = "force-dynamic";

export default async function WifiPage({
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
    eventType: "wifi_viewed",
    ip,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  return (
    <GuestShell villaName={villaLabel} dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>

        <h1 className="text-2xl font-medium text-ink">Wi-Fi</h1>

        {summary.wifi.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Wi-Fi details will appear here closer to your stay.
          </p>
        ) : (
          summary.wifi.map((w) => (
            <section
              key={w.id}
              className="rounded-xl border border-line-soft bg-surface p-6"
            >
              <div className="flex items-center gap-2 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <WifiIcon className="w-3.5 h-3.5" /> Network
              </div>
              <div className="mt-2 text-ink font-medium text-base">
                {w.networkName}
              </div>
              {w.hasPassword && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    Password
                  </div>
                  <div className="mt-2">
                    <RevealSecretButton token={token} kind="wifi" wifiId={w.id} />
                  </div>
                  <p className="text-[11px] text-ink-tertiary mt-2">
                    Tap to reveal — we log when the password is viewed for safety.
                  </p>
                </div>
              )}
              {w.instructionsMd && (
                <div className="mt-4">
                  <MarkdownBlock source={w.instructionsMd} />
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </GuestShell>
  );
}
