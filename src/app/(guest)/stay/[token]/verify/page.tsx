import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import {
  canAccessStayWithoutVerification,
  type VerificationStatus,
} from "@/features/guest-stays/verification";
import { hashStayToken, hashIpForLog } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { recordStayAccessEvent } from "@/features/guest-stays/access-log";
import { issueVerificationCode } from "@/features/guest-stays/verification";
import { VerificationForm } from "@/components/stay/verification-form";
import { RateLimitedView } from "@/components/stay/rate-limited";

export const metadata = { title: "Verify your stay" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? null;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const tokenPrefix = token.slice(0, 8);

  // Rate limit the verification page itself — hitting this URL is cheaper
  // than the underlying resolver but still abusable.
  const rl = await rateLimitStayTokenAccess({
    tokenPrefix,
    ip,
    kind: "token_access",
  });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  const resolved = await getStayByToken(token);
  if (!resolved.ok) {
    await recordStayAccessEvent({
      eventType:
        resolved.reason === "expired"
          ? "expired_token"
          : resolved.reason === "revoked"
            ? "revoked_token"
            : "invalid_token",
      ip,
      userAgent: ua,
    });
    notFound();
  }

  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (access.allowed) {
    redirect(`/stay/${token}`);
  }

  const status: VerificationStatus = access.status;

  // If there's no pending verification, auto-issue one (best-effort) so
  // the page isn't a dead end the very first time the guest lands.
  if (!status.pendingVerificationId) {
    const issued = await issueVerificationCode({
      guestStayTokenId: resolved.stay.tokenId,
      ipHash: hashIpForLog(ip),
      userAgent: ua,
    });
    if (issued.ok) {
      status.pendingVerificationId = issued.verificationId ?? null;
      status.recipientMasked = issued.recipientMasked ?? null;
      status.channel = issued.channel ?? null;
      if (issued.devCodePreview) {
        status.devCodePreview = issued.devCodePreview;
      }
    }
  }

  const stay = resolved.stay;
  const villaLabel = stay.villaName ?? stay.villaCode ?? "Your villa";
  const dateRange = `${stay.checkIn} → ${stay.checkOut}`;
  const attemptsLeft = Math.max(
    0,
    status.maxAttempts - (status.attempts ?? 0),
  );
  const hasContact = Boolean(status.recipientMasked);

  return (
    <GuestShell villaName={villaLabel} dates={dateRange}>
      <div className="flex flex-col gap-6">
        <VerificationForm
          token={token}
          recipientMasked={status.recipientMasked}
          hasContact={hasContact}
          attemptsLeft={attemptsLeft}
        />
        {status.devCodePreview && (
          <p className="rounded-md border border-warning/30 bg-warning-weak/20 p-3 text-[11px] text-ink-tertiary text-center font-mono">
            Dev fallback (no provider configured) · code:{" "}
            <span className="text-ink">{status.devCodePreview}</span>
          </p>
        )}
      </div>
    </GuestShell>
  );
}
