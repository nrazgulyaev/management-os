import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  Wifi as WifiIcon,
  ScrollText,
  MapPin,
  ShieldAlert,
  ClipboardList,
  Smartphone,
  Download,
  Sparkles,
  Inbox,
} from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { recordStayAccessEvent } from "@/features/guest-stays/access-log";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { listGuestVisibleSuggestionsForToken } from "@/features/guest-journey/services";
import {
  RecommendedNowList,
  type RecommendedSuggestion,
} from "@/components/stay/recommended-now";
import { buildSuggestionCta } from "@/features/guest-journey/suggestions-pure";
import type { SuggestionType } from "@/features/guest-journey/suggestions-pure";

export const metadata = { title: "Your stay" };
export const dynamic = "force-dynamic";

export default async function StayHome({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? null;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Rate limit before doing any DB work for the resolver.
  const tokenPrefix = token.slice(0, 8);
  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  // Verification gate (v9G). The resolver still runs first to flip
  // status=expired etc; if access is fine, we redirect into /verify.
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    redirect(`/stay/${token}/verify`);
  }

  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) {
    await recordStayAccessEvent({
      eventType:
        result.reason === "expired"
          ? "expired_token"
          : result.reason === "revoked"
            ? "revoked_token"
            : "invalid_token",
      ip,
      userAgent: ua,
    });
    return <StayUnavailable reason={result.reason} />;
  }

  const { summary } = result;
  await recordStayAccessEvent({
    guestStayTokenId: summary.base.tokenId,
    bookingId: summary.base.bookingId,
    eventType: "opened",
    ip,
    userAgent: ua,
  });

  const dateRange = `${summary.base.checkIn} → ${summary.base.checkOut} · ${summary.base.nights} nights`;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";

  // Pull up to 3 active suggestions for this stay token. CTA hrefs
  // generated server-side use the raw token; the client component
  // only sees the rewritten paths.
  const suggestionRows = await listGuestVisibleSuggestionsForToken(
    summary.base.tokenId,
    new Date(),
    3,
  );
  const recommended: RecommendedSuggestion[] = suggestionRows.map((s) => {
    const cta = buildSuggestionCta(
      (s.suggestionType as SuggestionType) ?? "info",
      token,
      null,
    );
    return {
      id: s.id,
      title: s.title,
      body: s.body,
      ctaHref: s.ctaHref ?? cta.ctaHref,
      ctaLabel: s.ctaLabel ?? cta.ctaLabel,
      suggestionType: s.suggestionType,
      priority: s.priority,
    };
  });

  return (
    <GuestShell villaName={villaLabel} dates={dateRange}>
      <div className="flex flex-col gap-10">
        {/* Hero */}
        <section className="rounded-xl overflow-hidden border border-line-soft bg-surface">
          <div
            className="aspect-[16/10] md:aspect-[16/9]"
            style={{
              background:
                "linear-gradient(180deg, rgba(14,59,46,0.15) 0%, rgba(14,59,46,0.5) 100%), linear-gradient(135deg, #5a6b5c 0%, #2a3a30 100%)",
            }}
          />
          <div className="p-6 md:p-8">
            <Badge tone="gold">
              {summary.base.guestDisplayName
                ? `Welcome, ${summary.base.guestDisplayName}`
                : "Welcome"}
            </Badge>
            <h1 className="text-display text-[32px] md:text-[44px] leading-[1.05] font-medium text-ink mt-4">
              {villaLabel}
            </h1>
            {summary.base.projectName && (
              <p className="text-sm text-ink-tertiary mt-1">
                {summary.base.projectName}
              </p>
            )}
            <p className="text-sm text-ink-secondary mt-3">{dateRange}</p>
            {summary.base.guestsCount > 0 && (
              <p className="text-xs text-ink-tertiary mt-1">
                {summary.base.guestsCount} guest
                {summary.base.guestsCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </section>

        {/* Recommended now — Prompt 102 guest journey suggestions.
            CTAs link to existing surfaces (services, guide, check-in,
            review). Never a purchase. */}
        <RecommendedNowList suggestions={recommended} token={token} />

        {/* Smart-lock card — only renders inside the validity window.
            v9G: code is hidden behind a reveal button; the on-disk
            display value is no longer rendered server-side. */}
        {summary.smartLock?.visible && (
          <section
            id="check-in"
            className="rounded-xl border border-line-soft bg-surface p-6 md:p-8"
          >
            <div className="flex items-center gap-2 text-ink-tertiary text-[11px] uppercase tracking-widest">
              <KeyRound className="w-3.5 h-3.5" /> Door access
            </div>
            <div className="mt-4">
              <Link
                href={`/stay/${token}/check-in`}
                className="h-10 px-4 inline-flex items-center rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
              >
                Open check-in
              </Link>
            </div>
            <p className="text-xs text-ink-tertiary mt-3">
              Tap to reveal your door code on the check-in page. Each
              reveal is logged for safety.
            </p>
          </section>
        )}

        {/* Quick links */}
        <section className="grid grid-cols-2 gap-3">
          <SubpageLink
            href={`/stay/${token}/check-in`}
            icon={KeyRound}
            title="Check-in"
            detail="Door code & arrival info"
          />
          <SubpageLink
            href={`/stay/${token}/wifi`}
            icon={WifiIcon}
            title="Wi-Fi"
            detail={
              summary.wifi.length > 0
                ? `${summary.wifi[0].networkName}`
                : "Network details"
            }
          />
          <SubpageLink
            href={`/stay/${token}/guide`}
            icon={ScrollText}
            title="Villa guide"
            detail="Appliances, amenities, transport"
          />
          <SubpageLink
            href={`/stay/${token}/house-rules`}
            icon={ClipboardList}
            title="House rules"
            detail="What to know"
          />
          <SubpageLink
            href={`/stay/${token}/neighborhood`}
            icon={MapPin}
            title="Neighborhood"
            detail="Beaches, restaurants, transport"
          />
          <SubpageLink
            href={`/stay/${token}/emergency`}
            icon={ShieldAlert}
            title="Emergency"
            detail="Safety contacts"
          />
          <SubpageLink
            href={`/stay/${token}/services`}
            icon={Smartphone}
            title="Concierge"
            detail="Send a request"
          />
          <SubpageLink
            href={`/stay/${token}/concierge`}
            icon={Sparkles}
            title="Concierge AI"
            detail="Ask questions about your stay"
          />
          <SubpageLink
            href={`/stay/${token}/requests`}
            icon={Inbox}
            title="Your requests"
            detail="Status of what you've sent us"
          />
          <SubpageLink
            href={`/stay/${token}/offline`}
            icon={Download}
            title="Offline page"
            detail="Print or save"
          />
        </section>
      </div>
    </GuestShell>
  );
}

function SubpageLink({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-line-soft bg-surface p-4 hover:border-line-strong transition-colors flex flex-col gap-3 min-h-[96px]"
    >
      <Icon className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
      <div>
        <div className="text-ink font-medium text-sm">{title}</div>
        <div className="text-[11px] text-ink-tertiary mt-0.5">{detail}</div>
      </div>
    </Link>
  );
}

function StayUnavailable({
  reason,
}: {
  reason: "invalid" | "expired" | "revoked" | "not_found";
}) {
  if (reason === "not_found") notFound();
  const labels: Record<
    "invalid" | "expired" | "revoked",
    { title: string; body: string }
  > = {
    invalid: {
      title: "Stay link not recognised",
      body: "We couldn't find a stay for this link. Please double-check the URL or contact your host.",
    },
    expired: {
      title: "This stay link has expired",
      body: "Your access window has closed. Reach out to your host if you still need access.",
    },
    revoked: {
      title: "Stay link no longer valid",
      body: "This link has been deactivated by your host. They'll send a fresh one if needed.",
    },
  };
  const copy = labels[reason];
  return (
    <GuestShell>
      <div className="rounded-xl border border-line-soft bg-surface p-6 md:p-10 mt-12 text-center">
        <h1 className="text-2xl font-medium text-ink">{copy.title}</h1>
        <p className="text-sm text-ink-secondary mt-3 max-w-md mx-auto">
          {copy.body}
        </p>
      </div>
    </GuestShell>
  );
}
