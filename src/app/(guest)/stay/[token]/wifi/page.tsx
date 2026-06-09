import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader, Eyebrow } from "@/components/stay/stay-ui";
import { Wifi as WifiIcon } from "lucide-react";
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
    <StayShell
      villaName={villaLabel}
      dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="Wi-Fi" backHref={`/stay/${token}`} />

        {summary.wifi.length === 0 ? (
          <p className="rounded-[var(--r-md)] border border-dashed border-line-soft bg-muted/40 px-5 py-6 text-sm text-ink-tertiary">
            Wi-Fi details will appear here closer to your stay.
          </p>
        ) : (
          summary.wifi.map((w) => (
            <section
              key={w.id}
              className="rounded-[var(--r-card)] bg-stay-forest text-[#F4EFE6] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-[13px] bg-[rgba(220,198,145,0.18)] flex items-center justify-center shrink-0">
                  <WifiIcon className="w-[21px] h-[21px] text-gold-soft" strokeWidth={1.8} />
                </span>
                <div className="flex-1 min-w-0">
                  <Eyebrow className="text-[#F4EFE6]/60">Network</Eyebrow>
                  <div className="text-[17px] font-semibold mt-0.5">
                    {w.networkName}
                  </div>
                </div>
              </div>
              {w.hasPassword && (
                <div className="mt-3.5 pt-3.5 border-t border-[rgba(244,239,230,0.16)]">
                  <div className="text-[11px] text-[#F4EFE6]/60">Password</div>
                  <div className="mt-2">
                    <RevealSecretButton token={token} kind="wifi" wifiId={w.id} />
                  </div>
                  <p className="text-[11px] text-[#F4EFE6]/55 mt-2">
                    Tap to reveal — we log when the password is viewed for safety.
                  </p>
                </div>
              )}
              {w.instructionsMd && (
                <div className="mt-4 pt-4 border-t border-[rgba(244,239,230,0.16)]">
                  <MarkdownBlock source={w.instructionsMd} />
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </StayShell>
  );
}
