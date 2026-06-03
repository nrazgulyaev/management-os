import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerHome } from "@/features/owner-portal/get-home";
import { OwnerGreeting } from "@/components/owner-portal/owner-greeting";
import { HeroTile } from "@/components/owner-portal/hero-tile";
import { VillaCard } from "@/components/owner-portal/villa-card";
import { UpcomingList } from "@/components/owner-portal/upcoming-list";
import {
  QuickActionGrid,
  type QuickAction,
} from "@/components/owner-portal/quick-action-grid";

/**
 * Sprint OWNER-PORTAL-1A · redesign owner-01 — Owner home.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/01-home.html. Wires the
 * Phase 2.3 owner-portal presentational primitives (OwnerGreeting / HeroTile /
 * VillaCard / UpcomingList / QuickActionGrid) to the live `getOwnerHome`
 * aggregate. Layout per the prototype's "Where this lands" spec:
 *   greeting → 3-tile hero (YTD / Pending / Next) → villa card(s)
 *            → upcoming (14d) → quick actions.
 */

export const metadata = { title: "Your portfolio" };
export const dynamic = "force-dynamic";

function fmtUsd(usd: number): string {
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (Math.abs(usd) >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}

const ICON = {
  stay: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  guest: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </svg>
  ),
  message: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  call: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

function SectionHead({
  title,
  href,
  link,
}: {
  title: string;
  href: string;
  link: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <h2
        className="display"
        style={{ fontSize: 28, fontWeight: 400, margin: 0, lineHeight: 1.1, color: "var(--ink)" }}
      >
        {title}
      </h2>
      <Link
        href={href}
        className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-terra no-underline hover:opacity-70"
      >
        {link}
      </Link>
    </div>
  );
}

export default async function OwnerHomePage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const home = await getOwnerHome(owner.ownerId);

  const year = new Date().getFullYear();
  const eyebrow = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();

  const upcomingCount = home.upcoming.length;
  const narrative = home.pendingStatement ? (
    <>
      Your <strong>{home.pendingStatement.periodLabel}</strong> statement is ready
      for your review — net <strong>{fmtUsd(home.pendingStatement.netUsd)}</strong>.
      {upcomingCount > 0
        ? ` ${upcomingCount} arrival${upcomingCount === 1 ? "" : "s"} over the next 14 days.`
        : ""}
    </>
  ) : home.ytdNetUsd > 0 ? (
    <>
      You&rsquo;re all caught up. Your villas have paid out{" "}
      <strong>{fmtUsd(home.ytdNetUsd)}</strong> so far in {year}.
      {upcomingCount > 0
        ? ` ${upcomingCount} upcoming over the next 14 days.`
        : ""}
    </>
  ) : (
    <>
      Welcome to your portfolio. Your first statement will appear here once your
      operator generates it.
    </>
  );

  const actions: QuickAction[] = [
    {
      id: "stay",
      href: "/owner/stays/new",
      label: "Request personal stay",
      context: "Pick dates · mgmt confirms",
      icon: ICON.stay,
    },
    {
      id: "guest",
      href: "/owner/inbox",
      label: "Pre-approve a guest",
      context: "Friends without a booking",
      icon: ICON.guest,
    },
    {
      id: "msg",
      href: "/owner/inbox",
      label: "Message mgmt team",
      context: "Your dedicated operators",
      icon: ICON.message,
    },
    {
      id: "call",
      href: "/owner/preferences",
      label: "Schedule a review call",
      context: "15-min · director",
      icon: ICON.call,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <OwnerGreeting
        ownerName={owner.ownerName}
        eyebrow={eyebrow}
        narrative={narrative}
      />

      {/* 3-tile hero — YTD net / pending review / next statement */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroTile
          variant="dark"
          label={`YTD net · ${year}`}
          value={home.ytdNetUsd > 0 ? fmtUsd(home.ytdNetUsd) : "—"}
          sub="Net to you · across your villas"
          foot="Wired monthly"
        />
        {home.pendingStatement ? (
          <HeroTile
            variant="flat"
            className="gold"
            label="Pending review"
            value={home.pendingStatement.periodLabel}
            sub={`${home.pendingStatement.statementCode} · ${fmtUsd(home.pendingStatement.netUsd)} net`}
            foot={
              <Link href={home.pendingStatement.href} className="btn btn-accent btn-sm">
                Review →
              </Link>
            }
          />
        ) : (
          <HeroTile
            variant="flat"
            label="Statements"
            value="All clear"
            sub="Nothing awaiting your review"
            foot={
              <Link href="/owner/statements" className="text-terra no-underline">
                All statements →
              </Link>
            }
          />
        )}
        <HeroTile
          variant="flat"
          label="Next statement"
          value={home.nextStatementLabel}
          sub="Auto-prepares early next month"
          foot="Cadence · monthly"
        />
      </div>

      {/* Your villa(s) */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title={home.villas.length === 1 ? "Your villa" : "Your villas"}
          href="/owner/villas"
          link={`All villas (${home.villas.length}) →`}
        />
        {home.villas.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">
            No villa ownership recorded. Contact your operator to confirm shares.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {home.villas.map((v) => (
              <VillaCard
                key={v.id}
                href={v.href}
                code={v.code}
                name={v.name}
                imageUrl={v.imageUrl}
                bedrooms={v.bedrooms}
                occupancyPct={v.occupancyPct}
                netUsd={v.netUsd}
                location={v.location}
                orientation="col"
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming · next 14 days */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Upcoming · next 14 days"
          href="/owner/calendar"
          link="Full calendar →"
        />
        <UpcomingList
          items={home.upcoming.map((u) => ({ ...u, dateLabel: fmtDay(u.dateLabel) }))}
          emptyMessage="No arrivals or stays in the next 14 days."
        />
      </section>

      {/* Quick actions */}
      <section className="flex flex-col gap-4">
        <h2
          className="display"
          style={{ fontSize: 28, fontWeight: 400, margin: 0, lineHeight: 1.1, color: "var(--ink)" }}
        >
          Quick actions
        </h2>
        <QuickActionGrid actions={actions} />
      </section>
    </div>
  );
}
