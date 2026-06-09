import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { GuestShell } from "@/components/layout/guest-shell";
import {
  Eyebrow,
  SectionTitle,
  StayRow,
  Timeline,
  TimelineItem,
} from "@/components/stay/stay-ui";
import {
  KeyRound,
  Wifi as WifiIcon,
  ScrollText,
  ClipboardList,
  ConciergeBell,
  Download,
  MessageCircle,
  Compass,
  Inbox,
  ChevronRight,
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
  const basePath = `/stay/${token}`;

  // Countdown to arrival (mockup "До заезда" / "Until arrival" card).
  // Pure date math off the stored YYYY-MM-DD check-in; clamped to ≥0.
  const arrival = new Date(`${summary.base.checkIn}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysToArrival = Number.isNaN(arrival.getTime())
    ? null
    : Math.max(0, Math.round((arrival.getTime() - today.getTime()) / msPerDay));
  const arrivalLabel =
    daysToArrival === null
      ? "Soon"
      : daysToArrival === 0
        ? "Today"
        : `${daysToArrival} day${daysToArrival === 1 ? "" : "s"}`;

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
    <StayShell villaName={villaLabel} dates={dateRange} basePath={basePath}>
      <div className="flex flex-col gap-8">
        {/* Hero — full-bleed villa band with a serif greeting. The
            gradient scrim sits over the booking's villa photo in
            production (mockup variant A · editorial). */}
        <section className="relative -mx-6 -mt-7 overflow-hidden rounded-b-[var(--r-hero)]">
          <div className="bg-stay-hero h-[300px] sm:h-[360px]" />
          <div className="absolute inset-0 bg-stay-hero-scrim" />
          <div className="absolute inset-x-6 bottom-12 text-[#F6F1E7]">
            <Eyebrow className="text-[#F6F1E7]/75">
              {summary.base.guestDisplayName
                ? `Welcome, ${summary.base.guestDisplayName}`
                : "Welcome"}
            </Eyebrow>
            <h1 className="text-display text-[38px] leading-[1.06] tracking-[-0.02em] font-normal text-white mt-1.5">
              {villaLabel}
            </h1>
            {summary.base.projectName && (
              <p className="text-sm text-white/80 mt-1.5">
                {summary.base.projectName}
              </p>
            )}
            <p className="text-[14.5px] text-white/90 mt-1.5">{dateRange}</p>
            {summary.base.guestsCount > 0 && (
              <p className="text-xs text-white/70 mt-1">
                {summary.base.guestsCount} guest
                {summary.base.guestsCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </section>

        {/* Countdown + check-in card (mockup "До заезда"). Lifts over the
            hero. Only the open-check-in CTA renders inside the smart-lock
            validity window; otherwise the same countdown shows alone. */}
        <section className="relative z-[2] -mt-[26px]">
          <div className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5 flex items-center gap-4">
            <div>
              <Eyebrow>Until arrival</Eyebrow>
              <div className="text-display text-[30px] leading-none mt-1 text-ink">
                {arrivalLabel}
              </div>
            </div>
            <div className="w-px self-stretch bg-line-soft mx-0.5" />
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold text-ink-secondary">
                Online check-in is open
              </div>
              <p className="text-[12.5px] text-ink-tertiary mt-0.5 leading-[1.5]">
                Complete it before you arrive — we&apos;ll hand over the
                key faster.
              </p>
            </div>
          </div>
          {summary.smartLock?.visible && (
            <Link
              href={`${basePath}/check-in`}
              id="check-in"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-terra text-[#fff] text-[15px] font-semibold px-[22px] py-[15px] shadow-[0_6px_18px_rgba(196,88,60,0.28)]"
            >
              Complete check-in
              <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
            </Link>
          )}
        </section>

        {/* Recommended now — Prompt 102 guest journey suggestions.
            CTAs link to existing surfaces (services, guide, check-in,
            review). Never a purchase. */}
        <RecommendedNowList suggestions={recommended} token={token} />

        {/* Your service — calm list of the primary destinations
            (mockup "Ваш сервис" .row group). */}
        <section>
          <SectionTitle title="Your service" />
          <div className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] px-5 divide-y divide-line-soft">
            <StayRow
              href={`${basePath}/concierge`}
              icon={MessageCircle}
              title="Concierge"
              detail="Ask anything — we reply around the clock"
            />
            <StayRow
              href={`${basePath}/services`}
              icon={ConciergeBell}
              title="Services & orders"
              detail="Breakfast, spa, transfer, groceries"
            />
            <StayRow
              href={`${basePath}/neighborhood`}
              icon={Compass}
              title="Nearby"
              detail="Beaches, restaurants, what to see"
            />
            <StayRow
              href={`${basePath}/guide`}
              icon={ScrollText}
              title="Villa guide"
              detail="Wi-Fi, appliances, house rules"
            />
          </div>
        </section>

        {/* Your stay — timeline (mockup "Ваше пребывание" .tl). */}
        <section>
          <SectionTitle title="Your stay" />
          <div className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5">
            <Timeline>
              <TimelineItem
                time={`${summary.base.checkIn} · 15:00`}
                title="Check-in"
                detail="The villa is ready by 14:00. Your manager meets you at the gate."
              />
              <TimelineItem
                time="Morning"
                title="Breakfast on the terrace"
                detail="Included. The chef confirms the menu the evening before."
              />
              <TimelineItem
                time={`${summary.base.checkOut} · 11:00`}
                title="Check-out"
                detail="Late check-out available on request."
              />
            </Timeline>
          </div>
        </section>

        {/* More — secondary destinations (check-in detail, Wi-Fi, house
            rules, requests, offline). */}
        <section>
          <SectionTitle title="More" />
          <div className="grid grid-cols-2 gap-3">
            <QuickLink
              href={`${basePath}/check-in`}
              icon={KeyRound}
              title="Check-in"
              detail="Door code & arrival info"
            />
            <QuickLink
              href={`${basePath}/wifi`}
              icon={WifiIcon}
              title="Wi-Fi"
              detail={
                summary.wifi.length > 0
                  ? summary.wifi[0].networkName
                  : "Network details"
              }
            />
            <QuickLink
              href={`${basePath}/house-rules`}
              icon={ClipboardList}
              title="House rules"
              detail="What to know"
            />
            <QuickLink
              href={`${basePath}/requests`}
              icon={Inbox}
              title="Your requests"
              detail="Status of what you've sent us"
            />
            <QuickLink
              href={`${basePath}/offline`}
              icon={Download}
              title="Offline page"
              detail="Print or save"
            />
          </div>
        </section>
      </div>
    </StayShell>
  );
}

function QuickLink({
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
      className="rounded-[var(--r-md)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-4 flex flex-col gap-3 min-h-[104px] justify-between"
    >
      <Icon className="w-[21px] h-[21px] text-forest" strokeWidth={1.7} />
      <div>
        <div className="text-ink font-semibold text-[14.5px]">{title}</div>
        <div className="text-xs text-ink-tertiary mt-0.5">{detail}</div>
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
